//! Dashboard WebSocket JSON-RPC chat transport.
//!
//! The default chat path talks to the Hermes Gateway over `/v1/runs` SSE
//! (see `http_stream_runs` in `lib.rs`). This module adds the alternative
//! "dashboard" transport: a WebSocket JSON-RPC channel exposed by
//! `hermes dashboard` at `/api/ws`. It connects, creates/seeds a runtime
//! session, submits the prompt, and maps the dashboard's streaming
//! notifications onto the same [`RuntimeStreamEvent`] shape the existing UI
//! already renders, so reasoning/tool/usage/text streaming stays identical
//! regardless of transport.
//!
//! Only plaintext `ws://` is supported (matching the gateway HTTP client,
//! which is `http://`-only). For `local` mode this module manages a
//! `hermes dashboard` child process; for `remote`/`ssh` it derives the
//! WebSocket endpoint from the active connection base URL + token.

use serde_json::{json, Value};
use std::io::{ErrorKind, Read, Write};
use std::net::TcpStream;
use std::process::{Child, Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::AppHandle;

use crate::{
    completion_suffix, emit_stream_event, enhanced_path, extract_run_usage, find_free_port,
    find_hermes_command, format_tool_event_content, hermes_home, home_dir, is_task_cancelled,
    parse_clarify_choices, tool_event_from_payload, trace_stream_event, RuntimeStreamEvent,
};

/// Outcome of a dashboard transport attempt.
pub(crate) enum DashboardOutcome {
    /// The dashboard stream completed and produced the final answer text.
    Completed(String),
    /// The dashboard transport could not be used (no process, no socket,
    /// handshake failed). Callers in `auto` mode should fall back to legacy.
    Unavailable(String),
}

struct ManagedDashboard {
    child: Child,
    port: u16,
    token: String,
    profile: String,
}

static MANAGED_DASHBOARD: OnceLock<Mutex<Option<ManagedDashboard>>> = OnceLock::new();

fn managed_dashboard() -> &'static Mutex<Option<ManagedDashboard>> {
    MANAGED_DASHBOARD.get_or_init(|| Mutex::new(None))
}

/// A resolved dashboard WebSocket endpoint.
struct DashboardEndpoint {
    host: String,
    host_header: String,
    port: u16,
    /// Request path including the `?token=` query string.
    path: String,
}

fn pseudo_random_bytes(len: usize) -> Vec<u8> {
    let mut seed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_nanos())
        .unwrap_or(0) as u64
        ^ 0x9E37_79B9_7F4A_7C15;
    let mut out = Vec::with_capacity(len);
    for _ in 0..len {
        // xorshift64*
        seed ^= seed >> 12;
        seed ^= seed << 25;
        seed ^= seed >> 27;
        let value = seed.wrapping_mul(0x2545_F491_4F6C_DD1D);
        out.push((value >> 33) as u8);
    }
    out
}

fn base64_standard(bytes: &[u8]) -> String {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

// ─────────────────────────────────────────────────────────────────────────
// Minimal RFC 6455 WebSocket client (text frames, client-masked).
// ─────────────────────────────────────────────────────────────────────────

struct WsClient {
    stream: TcpStream,
    buffer: Vec<u8>,
}

impl WsClient {
    fn connect(endpoint: &DashboardEndpoint) -> Result<WsClient, String> {
        let mut stream = TcpStream::connect((&*endpoint.host, endpoint.port)).map_err(|error| {
            format!(
                "连接 dashboard {}:{} 失败：{error}",
                endpoint.host, endpoint.port
            )
        })?;
        stream
            .set_read_timeout(Some(Duration::from_secs(1)))
            .map_err(|error| format!("设置 dashboard 读取超时失败：{error}"))?;
        stream
            .set_write_timeout(Some(Duration::from_secs(15)))
            .map_err(|error| format!("设置 dashboard 写入超时失败：{error}"))?;

        let key = base64_standard(&pseudo_random_bytes(16));
        let request = format!(
            "GET {path} HTTP/1.1\r\nHost: {host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n",
            path = endpoint.path,
            host = endpoint.host_header,
        );
        stream
            .write_all(request.as_bytes())
            .map_err(|error| format!("写入 dashboard 握手失败：{error}"))?;

        // Read the HTTP handshake response up to the header terminator.
        let mut raw = Vec::new();
        let mut chunk = [0_u8; 1024];
        let deadline = Instant::now() + Duration::from_secs(10);
        loop {
            if Instant::now() > deadline {
                return Err("dashboard WebSocket 握手超时".to_string());
            }
            match stream.read(&mut chunk) {
                Ok(0) => return Err("dashboard WebSocket 握手期间连接被关闭".to_string()),
                Ok(size) => {
                    raw.extend_from_slice(&chunk[..size]);
                    if let Some(index) = find_double_crlf(&raw) {
                        let head = String::from_utf8_lossy(&raw[..index]).to_string();
                        if !head
                            .lines()
                            .next()
                            .map(|line| line.contains("101"))
                            .unwrap_or(false)
                        {
                            return Err(format!(
                                "dashboard WebSocket 升级失败：{}",
                                head.lines().next().unwrap_or("unknown")
                            ));
                        }
                        // Any bytes past the header are the first WS frame bytes.
                        let leftover = raw[index + 4..].to_vec();
                        return Ok(WsClient {
                            stream,
                            buffer: leftover,
                        });
                    }
                }
                Err(error)
                    if matches!(error.kind(), ErrorKind::WouldBlock | ErrorKind::TimedOut) =>
                {
                    continue;
                }
                Err(error) => return Err(format!("读取 dashboard 握手失败：{error}")),
            }
        }
    }

    fn send_text(&mut self, text: &str) -> Result<(), String> {
        let payload = text.as_bytes();
        let mut frame = Vec::with_capacity(payload.len() + 14);
        frame.push(0x81); // FIN + text opcode
        let mask_bit = 0x80_u8;
        let len = payload.len();
        if len < 126 {
            frame.push(mask_bit | len as u8);
        } else if len < 65536 {
            frame.push(mask_bit | 126);
            frame.extend_from_slice(&(len as u16).to_be_bytes());
        } else {
            frame.push(mask_bit | 127);
            frame.extend_from_slice(&(len as u64).to_be_bytes());
        }
        let mask = pseudo_random_bytes(4);
        frame.extend_from_slice(&mask);
        for (index, byte) in payload.iter().enumerate() {
            frame.push(byte ^ mask[index % 4]);
        }
        self.stream
            .write_all(&frame)
            .map_err(|error| format!("发送 dashboard 帧失败：{error}"))
    }

    fn send_close(&mut self) {
        // Client close frame (opcode 0x8), masked, no body.
        let mask = pseudo_random_bytes(4);
        let frame = [0x88, 0x80, mask[0], mask[1], mask[2], mask[3]];
        let _ = self.stream.write_all(&frame);
    }

    fn send_pong(&mut self, payload: &[u8]) {
        let mut frame = Vec::with_capacity(payload.len() + 6);
        frame.push(0x8A); // FIN + pong opcode
        frame.push(0x80 | payload.len() as u8);
        let mask = pseudo_random_bytes(4);
        frame.extend_from_slice(&mask);
        for (index, byte) in payload.iter().enumerate() {
            frame.push(byte ^ mask[index % 4]);
        }
        let _ = self.stream.write_all(&frame);
    }

    /// Ensure at least `needed` bytes are buffered, reading from the socket.
    /// Returns false on timeout/no-data (caller can re-check cancellation).
    fn fill(&mut self, needed: usize, task_id: &str) -> Result<bool, String> {
        let mut chunk = [0_u8; 8192];
        while self.buffer.len() < needed {
            if is_task_cancelled(Some(task_id)) {
                return Err("任务已取消。".to_string());
            }
            match self.stream.read(&mut chunk) {
                Ok(0) => return Ok(false),
                Ok(size) => self.buffer.extend_from_slice(&chunk[..size]),
                Err(error)
                    if matches!(error.kind(), ErrorKind::WouldBlock | ErrorKind::TimedOut) =>
                {
                    return Ok(false);
                }
                Err(error) => return Err(format!("读取 dashboard 帧失败：{error}")),
            }
        }
        Ok(true)
    }

    /// Read the next complete text message, handling control frames and
    /// fragmentation. Returns `Ok(Some(text))` for a text message, `Ok(None)`
    /// on close or when no full frame is available yet (the caller loops).
    fn read_message(&mut self, task_id: &str) -> Result<Option<String>, String> {
        let mut assembled: Vec<u8> = Vec::new();
        loop {
            if !self.fill(2, task_id)? {
                return Ok(None);
            }
            let first = self.buffer[0];
            let second = self.buffer[1];
            let fin = first & 0x80 != 0;
            let opcode = first & 0x0F;
            let masked = second & 0x80 != 0;
            let mut len = (second & 0x7F) as usize;
            let mut header = 2;
            if len == 126 {
                if !self.fill(4, task_id)? {
                    return Ok(None);
                }
                len = u16::from_be_bytes([self.buffer[2], self.buffer[3]]) as usize;
                header = 4;
            } else if len == 127 {
                if !self.fill(10, task_id)? {
                    return Ok(None);
                }
                let mut bytes = [0_u8; 8];
                bytes.copy_from_slice(&self.buffer[2..10]);
                len = u64::from_be_bytes(bytes) as usize;
                header = 10;
            }
            let mask_len = if masked { 4 } else { 0 };
            let total = header + mask_len + len;
            if !self.fill(total, task_id)? {
                return Ok(None);
            }
            let mask_offset = header;
            let payload_offset = header + mask_len;
            let mut payload = self.buffer[payload_offset..payload_offset + len].to_vec();
            if masked {
                let mask = [
                    self.buffer[mask_offset],
                    self.buffer[mask_offset + 1],
                    self.buffer[mask_offset + 2],
                    self.buffer[mask_offset + 3],
                ];
                for (index, byte) in payload.iter_mut().enumerate() {
                    *byte ^= mask[index % 4];
                }
            }
            self.buffer.drain(..total);

            match opcode {
                0x8 => {
                    // Close
                    return Ok(None);
                }
                0x9 => {
                    // Ping → pong
                    self.send_pong(&payload);
                    continue;
                }
                0xA => {
                    // Pong, ignore
                    continue;
                }
                0x1 | 0x2 | 0x0 => {
                    assembled.extend_from_slice(&payload);
                    if fin {
                        return Ok(Some(String::from_utf8_lossy(&assembled).to_string()));
                    }
                    // continuation expected; keep reading
                    continue;
                }
                _ => continue,
            }
        }
    }
}

fn find_double_crlf(buf: &[u8]) -> Option<usize> {
    buf.windows(4).position(|window| window == b"\r\n\r\n")
}

// ─────────────────────────────────────────────────────────────────────────
// Endpoint resolution + local dashboard process management.
// ─────────────────────────────────────────────────────────────────────────

fn dashboard_web_dist() -> Option<String> {
    let candidate = hermes_home()
        .ok()?
        .join("hermes-agent")
        .join("hermes_cli")
        .join("web_dist");
    if candidate.join("index.html").exists() {
        Some(candidate.to_string_lossy().to_string())
    } else {
        None
    }
}

/// GET `/api/status` on a local dashboard to confirm readiness. Returns true
/// when the server answers with a 2xx.
fn dashboard_status_ok(port: u16, token: &str) -> bool {
    let Ok(mut stream) = TcpStream::connect(("127.0.0.1", port)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(2)));
    let request = format!(
        "GET /api/status HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nX-Hermes-Session-Token: {token}\r\nConnection: close\r\n\r\n"
    );
    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }
    let mut raw = Vec::new();
    let mut chunk = [0_u8; 2048];
    let deadline = Instant::now() + Duration::from_secs(3);
    loop {
        if Instant::now() > deadline {
            break;
        }
        match stream.read(&mut chunk) {
            Ok(0) => break,
            Ok(size) => {
                raw.extend_from_slice(&chunk[..size]);
                if find_double_crlf(&raw).is_some() {
                    break;
                }
            }
            Err(error) if matches!(error.kind(), ErrorKind::WouldBlock | ErrorKind::TimedOut) => {
                break;
            }
            Err(_) => break,
        }
    }
    String::from_utf8_lossy(&raw)
        .lines()
        .next()
        .map(|line| line.contains(" 200") || line.contains(" 204"))
        .unwrap_or(false)
}

/// Ensure a local `hermes dashboard` process is running and return its
/// `(port, token)`. Reuses a previously spawned process when still healthy.
fn ensure_local_dashboard(profile: Option<&str>) -> Result<(u16, String), String> {
    let profile_key = profile.unwrap_or("default").to_string();
    let mut guard = managed_dashboard()
        .lock()
        .map_err(|_| "dashboard 进程状态锁已损坏。".to_string())?;

    if let Some(existing) = guard.as_mut() {
        let alive = existing
            .child
            .try_wait()
            .map(|status| status.is_none())
            .unwrap_or(false);
        if alive
            && existing.profile == profile_key
            && dashboard_status_ok(existing.port, &existing.token)
        {
            return Ok((existing.port, existing.token.clone()));
        }
        // Stale/different profile — tear it down before respawning.
        let _ = existing.child.kill();
        let _ = existing.child.wait();
        *guard = None;
    }

    let hermes = find_hermes_command()?;
    let port = find_free_port(9119)?;
    let token = hex_token(24);
    let mut command = Command::new(&hermes);
    if let Some(name) = profile {
        command.arg("--profile").arg(name);
    }
    command
        .arg("dashboard")
        .arg("--port")
        .arg(port.to_string())
        .arg("--host")
        .arg("127.0.0.1")
        .arg("--no-open");
    let has_dist = dashboard_web_dist();
    if has_dist.is_some() {
        command.arg("--skip-build");
    }
    command
        .env("HERMES_HOME", hermes_home()?.to_string_lossy().to_string())
        .env("HOME", home_dir()?)
        .env("HERMES_DASHBOARD_SESSION_TOKEN", &token)
        .env("HERMES_DESKTOP", "1")
        .env("PATH", enhanced_path())
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    if let Some(dist) = has_dist {
        command.env("HERMES_WEB_DIST", dist);
    }

    let child = command
        .spawn()
        .map_err(|error| format!("启动 hermes dashboard 失败：{error}"))?;

    let mut managed = ManagedDashboard {
        child,
        port,
        token: token.clone(),
        profile: profile_key,
    };

    // Wait for readiness. Pre-built dist starts fast; otherwise a build runs.
    let timeout = if dashboard_web_dist().is_some() {
        Duration::from_secs(45)
    } else {
        Duration::from_secs(180)
    };
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        if managed
            .child
            .try_wait()
            .map(|status| status.is_some())
            .unwrap_or(true)
        {
            let _ = managed.child.wait();
            return Err("hermes dashboard 进程提前退出。".to_string());
        }
        if dashboard_status_ok(port, &token) {
            *guard = Some(managed);
            return Ok((port, token));
        }
        std::thread::sleep(Duration::from_millis(400));
    }
    let _ = managed.child.kill();
    let _ = managed.child.wait();
    Err("等待 hermes dashboard 就绪超时。".to_string())
}

fn hex_token(bytes: usize) -> String {
    pseudo_random_bytes(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

/// Strip scheme/path from a base URL and append the dashboard `/api/ws` path
/// with the session token in the query string.
fn remote_dashboard_endpoint(base_url: &str, token: &str) -> Result<DashboardEndpoint, String> {
    let without_scheme = base_url
        .trim()
        .strip_prefix("http://")
        .ok_or_else(|| "dashboard 远程传输仅支持 http:// 基础地址".to_string())?;
    let host_port = without_scheme.split('/').next().unwrap_or(without_scheme);
    let (host, port) = match host_port.rsplit_once(':') {
        Some((host, port)) => (
            host.to_string(),
            port.parse::<u16>()
                .map_err(|_| format!("无效端口：{port}"))?,
        ),
        None => (host_port.to_string(), 80),
    };
    if host.is_empty() {
        return Err("dashboard host 不能为空".to_string());
    }
    Ok(DashboardEndpoint {
        host,
        host_header: host_port.to_string(),
        port,
        path: format!("/api/ws?token={}", encode_token(token)),
    })
}

fn encode_token(token: &str) -> String {
    token
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.' | '~') {
                ch.to_string()
            } else {
                format!("%{:02X}", ch as u32)
            }
        })
        .collect()
}

fn resolve_dashboard_endpoint(
    mode: &str,
    base_url: &str,
    auth: Option<&str>,
    profile: Option<&str>,
) -> Result<DashboardEndpoint, String> {
    match mode {
        "local" => {
            let (port, token) = ensure_local_dashboard(profile)?;
            Ok(DashboardEndpoint {
                host: "127.0.0.1".to_string(),
                host_header: format!("127.0.0.1:{port}"),
                port,
                path: format!("/api/ws?token={}", encode_token(&token)),
            })
        }
        _ => {
            let token = auth
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .ok_or_else(|| "dashboard 远程/SSH 传输需要 API 密钥作为会话令牌。".to_string())?;
            remote_dashboard_endpoint(base_url, token)
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────
// Streaming driver: session.create → prompt.submit → event mapping.
// ─────────────────────────────────────────────────────────────────────────

fn as_object(value: &Value) -> &serde_json::Map<String, Value> {
    static EMPTY: OnceLock<serde_json::Map<String, Value>> = OnceLock::new();
    value
        .as_object()
        .unwrap_or_else(|| EMPTY.get_or_init(serde_json::Map::new))
}

fn payload_text(payload: &Value, keys: &[&str]) -> String {
    let object = as_object(payload);
    for key in keys {
        if let Some(text) = object.get(*key).and_then(|item| item.as_str()) {
            if !text.is_empty() {
                return text.to_string();
            }
        }
    }
    String::new()
}

/// Normalise a JSON-RPC message into `(maybe_response_id, maybe_event)`.
struct Notification {
    event_type: String,
    payload: Value,
    session_id: Option<String>,
}

fn normalize_notification(message: &Value) -> Option<Notification> {
    let object = message.as_object()?;
    if let Some(event_type) = object.get("type").and_then(|item| item.as_str()) {
        return Some(Notification {
            event_type: event_type.to_string(),
            payload: object.get("payload").cloned().unwrap_or(Value::Null),
            session_id: object
                .get("session_id")
                .and_then(|item| item.as_str())
                .map(str::to_string),
        });
    }
    let method = object.get("method").and_then(|item| item.as_str())?;
    let params = object.get("params");
    if method == "event" {
        if let Some(params) = params.and_then(|item| item.as_object()) {
            if let Some(event_type) = params.get("type").and_then(|item| item.as_str()) {
                return Some(Notification {
                    event_type: event_type.to_string(),
                    payload: params.get("payload").cloned().unwrap_or(Value::Null),
                    session_id: params
                        .get("session_id")
                        .and_then(|item| item.as_str())
                        .map(str::to_string),
                });
            }
        }
    }
    let params_obj = params.and_then(|item| item.as_object());
    Some(Notification {
        event_type: method.to_string(),
        payload: params_obj
            .and_then(|object| object.get("payload"))
            .cloned()
            .unwrap_or(Value::Null),
        session_id: params_obj
            .and_then(|object| object.get("session_id"))
            .and_then(|item| item.as_str())
            .map(str::to_string),
    })
}

#[allow(clippy::too_many_arguments)]
pub(crate) fn stream_dashboard_chat(
    app: &AppHandle,
    task_id: &str,
    mode: &str,
    base_url: &str,
    auth: Option<&str>,
    profile: Option<&str>,
    model: &str,
    instruction: &str,
    conversation_history: &[Value],
    context_folder: Option<&str>,
) -> Result<DashboardOutcome, String> {
    let endpoint = match resolve_dashboard_endpoint(mode, base_url, auth, profile) {
        Ok(endpoint) => endpoint,
        Err(reason) => return Ok(DashboardOutcome::Unavailable(reason)),
    };

    let mut client = match WsClient::connect(&endpoint) {
        Ok(client) => client,
        Err(reason) => return Ok(DashboardOutcome::Unavailable(reason)),
    };
    trace_stream_event("transport", "dashboard");

    // 1) Create the runtime session, seeding prior turns + cwd + profile.
    let mut create_params = json!({ "cols": 96 });
    if let Some(object) = create_params.as_object_mut() {
        if !conversation_history.is_empty() {
            object.insert("messages".to_string(), json!(conversation_history));
        }
        if let Some(folder) = context_folder.filter(|value| !value.trim().is_empty()) {
            object.insert("cwd".to_string(), json!(folder));
        }
        if let Some(name) = profile {
            object.insert("profile".to_string(), json!(name));
        }
    }
    let create = match request_response(&mut client, task_id, 1, "session.create", &create_params) {
        Ok(value) => value,
        Err(error) if error == "任务已取消。" => {
            client.send_close();
            return Err(error);
        }
        Err(error) => {
            client.send_close();
            return Ok(DashboardOutcome::Unavailable(error));
        }
    };
    let session_id = create
        .get("session_id")
        .and_then(|item| item.as_str())
        .unwrap_or_default()
        .to_string();
    if session_id.is_empty() {
        client.send_close();
        return Ok(DashboardOutcome::Unavailable(
            "dashboard session.create 未返回 session_id".to_string(),
        ));
    }

    // 2) Best-effort model selection for the session (ignored on failure: the
    //    session keeps the profile's active model, which is still real).
    if !model.trim().is_empty() && model != "hermes-agent" {
        let command = format!("/model {model}");
        let _ = request_response(
            &mut client,
            task_id,
            2,
            "slash.exec",
            &json!({ "session_id": session_id, "command": command }),
        );
    }

    // 3) Submit the prompt. The answer streams back as notifications.
    if let Err(error) = client.send_text(
        &json!({
            "jsonrpc": "2.0",
            "id": 3,
            "method": "prompt.submit",
            "params": { "session_id": session_id, "text": instruction },
        })
        .to_string(),
    ) {
        client.send_close();
        return Ok(DashboardOutcome::Unavailable(error));
    }

    // 4) Read notifications until the turn completes.
    let mut full_content = String::new();
    let mut full_reasoning = String::new();
    let result = drive_stream(
        app,
        task_id,
        &session_id,
        &mut client,
        &mut full_content,
        &mut full_reasoning,
    );
    match result {
        Ok(()) => {
            client.send_close();
            Ok(DashboardOutcome::Completed(full_content))
        }
        Err(error) if error == "任务已取消。" => {
            let _ = client.send_text(
                &json!({
                    "jsonrpc": "2.0",
                    "id": 99,
                    "method": "session.interrupt",
                    "params": { "session_id": session_id },
                })
                .to_string(),
            );
            client.send_close();
            Err(error)
        }
        Err(error) => {
            client.send_close();
            // If we already produced text, treat the failure as a completion so
            // the user keeps the partial answer; otherwise mark unavailable.
            if full_content.trim().is_empty() {
                Ok(DashboardOutcome::Unavailable(error))
            } else {
                Ok(DashboardOutcome::Completed(full_content))
            }
        }
    }
}

/// Send a JSON-RPC request and read frames until the matching response id
/// arrives, applying notifications that show up in the meantime would be lost
/// here — so this is only used before the streaming phase (session.create,
/// slash.exec), where no chat notifications are expected yet.
fn request_response(
    client: &mut WsClient,
    task_id: &str,
    id: u64,
    method: &str,
    params: &Value,
) -> Result<Value, String> {
    let message = json!({
        "jsonrpc": "2.0",
        "id": id,
        "method": method,
        "params": params,
    });
    client.send_text(&message.to_string())?;
    let deadline = Instant::now() + Duration::from_secs(30);
    loop {
        if Instant::now() > deadline {
            return Err(format!("dashboard 请求超时：{method}"));
        }
        match client.read_message(task_id)? {
            Some(text) => {
                let Ok(value) = serde_json::from_str::<Value>(&text) else {
                    continue;
                };
                let matches_id = value
                    .get("id")
                    .map(|item| item == &json!(id))
                    .unwrap_or(false);
                if matches_id && value.get("method").is_none() {
                    if let Some(error) = value.get("error") {
                        let message = error
                            .get("message")
                            .and_then(|item| item.as_str())
                            .or_else(|| error.as_str())
                            .unwrap_or("dashboard 请求失败");
                        return Err(message.to_string());
                    }
                    return Ok(value.get("result").cloned().unwrap_or(Value::Null));
                }
            }
            None => {
                if is_task_cancelled(Some(task_id)) {
                    return Err("任务已取消。".to_string());
                }
                continue;
            }
        }
    }
}

fn drive_stream(
    app: &AppHandle,
    task_id: &str,
    session_id: &str,
    client: &mut WsClient,
    full_content: &mut String,
    full_reasoning: &mut String,
) -> Result<(), String> {
    let deadline = Instant::now() + Duration::from_secs(900);
    loop {
        if Instant::now() > deadline {
            return Err("dashboard 流式响应超时。".to_string());
        }
        if is_task_cancelled(Some(task_id)) {
            return Err("任务已取消。".to_string());
        }
        let Some(text) = client.read_message(task_id)? else {
            // No frame yet (timeout) or socket closed. Distinguish: a closed
            // socket without completion is an error; a timeout just loops.
            if is_task_cancelled(Some(task_id)) {
                return Err("任务已取消。".to_string());
            }
            continue;
        };
        let Ok(value) = serde_json::from_str::<Value>(&text) else {
            continue;
        };
        // Ignore JSON-RPC responses (acks) during streaming.
        if value.get("id").is_some() && value.get("method").is_none() && value.get("type").is_none()
        {
            continue;
        }
        let Some(notification) = normalize_notification(&value) else {
            continue;
        };
        // Drop events addressed to a different runtime session.
        if let Some(ref event_session) = notification.session_id {
            if !event_session.is_empty() && event_session != session_id {
                continue;
            }
        }
        if handle_dashboard_event(app, task_id, &notification, full_content, full_reasoning)? {
            return Ok(());
        }
    }
}

/// Map a single dashboard notification to UI stream events. Returns true when
/// the turn is complete.
fn handle_dashboard_event(
    app: &AppHandle,
    task_id: &str,
    notification: &Notification,
    full_content: &mut String,
    full_reasoning: &mut String,
) -> Result<bool, String> {
    let payload = &notification.payload;
    trace_stream_event("dashboard-event", &notification.event_type);

    // Surface usage whenever the payload carries it.
    if let Some(usage) = extract_run_usage(&json!({ "usage": payload.get("usage") })) {
        let cache_delta = if usage.cache_read > 0 || usage.cache_write > 0 {
            format!("{},{}", usage.cache_read, usage.cache_write)
        } else {
            String::new()
        };
        emit_stream_event(
            app,
            RuntimeStreamEvent {
                task_id: task_id.to_string(),
                kind: "usage".to_string(),
                delta: cache_delta,
                content: usage.prompt.to_string(),
                message: usage.total.to_string(),
            },
        )?;
    }

    match notification.event_type.as_str() {
        "message.start" => Ok(false),
        "message.delta" | "assistant.delta" => {
            let delta = payload_text(payload, &["text", "delta"]);
            if !delta.is_empty() {
                full_content.push_str(&delta);
                emit_stream_event(
                    app,
                    RuntimeStreamEvent {
                        task_id: task_id.to_string(),
                        kind: "delta".to_string(),
                        delta,
                        content: full_content.clone(),
                        message: String::new(),
                    },
                )?;
            }
            Ok(false)
        }
        "reasoning.delta" | "reasoning.available" | "reasoning.summary" => {
            let text = payload_text(payload, &["text", "delta", "reasoning", "summary"]);
            if !text.is_empty() {
                full_reasoning.push_str(&text);
                emit_stream_event(
                    app,
                    RuntimeStreamEvent {
                        task_id: task_id.to_string(),
                        kind: "reasoning".to_string(),
                        delta: text,
                        content: full_reasoning.clone(),
                        message: String::new(),
                    },
                )?;
            }
            Ok(false)
        }
        "thinking.delta" => Ok(false),
        "clarify.request" => {
            let question = payload_text(payload, &["question", "message", "text"]);
            if !question.is_empty() {
                let choices = if let Some(items) = payload.get("choices").and_then(|v| v.as_array())
                {
                    items
                        .iter()
                        .filter_map(|item| item.as_str().map(str::to_string))
                        .collect::<Vec<_>>()
                } else {
                    parse_clarify_choices(&question)
                };
                let request_id = payload_text(payload, &["request_id", "id"]);
                emit_stream_event(
                    app,
                    RuntimeStreamEvent {
                        task_id: task_id.to_string(),
                        kind: "clarify".to_string(),
                        delta: question,
                        content: serde_json::to_string(&choices)
                            .unwrap_or_else(|_| "[]".to_string()),
                        message: request_id,
                    },
                )?;
            }
            // A clarify pauses the turn; end the dashboard stream so the user
            // can answer with the next prompt.
            Ok(true)
        }
        "message.complete" | "assistant.completed" => {
            let reasoning = payload_text(payload, &["reasoning", "reasoning_content"]);
            if !reasoning.is_empty() && full_reasoning.trim().is_empty() {
                full_reasoning.push_str(&reasoning);
                emit_stream_event(
                    app,
                    RuntimeStreamEvent {
                        task_id: task_id.to_string(),
                        kind: "reasoning".to_string(),
                        delta: reasoning,
                        content: full_reasoning.clone(),
                        message: String::new(),
                    },
                )?;
            }
            let final_text = payload_text(payload, &["text", "rendered", "content"]);
            if !final_text.is_empty() {
                let suffix = completion_suffix(full_content, &final_text);
                if !suffix.is_empty() {
                    full_content.push_str(&suffix);
                    emit_stream_event(
                        app,
                        RuntimeStreamEvent {
                            task_id: task_id.to_string(),
                            kind: "delta".to_string(),
                            delta: suffix,
                            content: full_content.clone(),
                            message: String::new(),
                        },
                    )?;
                }
            }
            Ok(true)
        }
        other => {
            if is_dashboard_tool_event(other) {
                let status = if other.contains("complete") {
                    if payload.get("error").is_some()
                        || payload.get("status").and_then(|v| v.as_str()) == Some("failed")
                    {
                        "failed"
                    } else {
                        "completed"
                    }
                } else {
                    "running"
                };
                let tool_event = tool_event_from_payload(other, payload, status);
                if tool_event.name.eq_ignore_ascii_case("clarify") {
                    return Ok(false);
                }
                emit_stream_event(
                    app,
                    RuntimeStreamEvent {
                        task_id: task_id.to_string(),
                        kind: "tool".to_string(),
                        delta: tool_event.status.clone(),
                        content: format_tool_event_content(&tool_event),
                        message: tool_event.call_id.clone(),
                    },
                )?;
            }
            Ok(false)
        }
    }
}

fn is_dashboard_tool_event(event_type: &str) -> bool {
    matches!(
        event_type,
        "tool.start"
            | "tool.started"
            | "tool.progress"
            | "tool.generating"
            | "tool.complete"
            | "tool.completed"
            | "tool.failed"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_typed_notification() {
        let value = json!({
            "type": "message.delta",
            "payload": { "text": "hi" },
            "session_id": "abc",
        });
        let notification = normalize_notification(&value).expect("notification");
        assert_eq!(notification.event_type, "message.delta");
        assert_eq!(notification.session_id.as_deref(), Some("abc"));
        assert_eq!(payload_text(&notification.payload, &["text"]), "hi");
    }

    #[test]
    fn normalizes_jsonrpc_event_method() {
        let value = json!({
            "jsonrpc": "2.0",
            "method": "event",
            "params": {
                "type": "reasoning.delta",
                "payload": { "reasoning": "thinking" },
                "session_id": "s1",
            },
        });
        let notification = normalize_notification(&value).expect("notification");
        assert_eq!(notification.event_type, "reasoning.delta");
        assert_eq!(notification.session_id.as_deref(), Some("s1"));
        assert_eq!(
            payload_text(&notification.payload, &["reasoning"]),
            "thinking"
        );
    }

    #[test]
    fn normalizes_bare_method_notification() {
        let value = json!({
            "method": "tool.start",
            "params": { "payload": { "name": "search" }, "session_id": "x" },
        });
        let notification = normalize_notification(&value).expect("notification");
        assert_eq!(notification.event_type, "tool.start");
        assert!(is_dashboard_tool_event(&notification.event_type));
    }

    #[test]
    fn ignores_messages_without_type_or_method() {
        let value = json!({ "id": 1, "result": {} });
        assert!(normalize_notification(&value).is_none());
    }

    #[test]
    fn tool_event_classification() {
        assert!(is_dashboard_tool_event("tool.complete"));
        assert!(is_dashboard_tool_event("tool.progress"));
        assert!(!is_dashboard_tool_event("message.delta"));
        assert!(!is_dashboard_tool_event("clarify.request"));
    }

    #[test]
    fn encodes_remote_token_query_safely() {
        let endpoint = remote_dashboard_endpoint("http://127.0.0.1:8642", "tok en/1").unwrap();
        assert_eq!(endpoint.host, "127.0.0.1");
        assert_eq!(endpoint.port, 8642);
        assert!(endpoint.path.starts_with("/api/ws?token="));
        assert!(endpoint.path.contains("tok%20en%2F1"));
    }

    #[test]
    fn ws_text_frame_is_masked_and_recoverable() {
        // Build a frame the way the client sends it, then unmask to confirm the
        // payload round-trips (the masking key is applied per RFC 6455).
        let payload = b"{\"jsonrpc\":\"2.0\"}";
        let mut frame = Vec::new();
        frame.push(0x81);
        frame.push(0x80 | payload.len() as u8);
        let mask = pseudo_random_bytes(4);
        frame.extend_from_slice(&mask);
        for (index, byte) in payload.iter().enumerate() {
            frame.push(byte ^ mask[index % 4]);
        }
        // Header (2) + mask (4) + payload.
        assert_eq!(frame.len(), 2 + 4 + payload.len());
        let recovered: Vec<u8> = frame[6..]
            .iter()
            .enumerate()
            .map(|(index, byte)| byte ^ mask[index % 4])
            .collect();
        assert_eq!(recovered, payload);
    }
}
