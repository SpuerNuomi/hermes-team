use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashSet;
use std::fs;
use std::io::{ErrorKind, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::thread::sleep;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};

static CANCELLED_TASKS: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
static SSH_TUNNEL_PROCESS: OnceLock<Mutex<Option<Child>>> = OnceLock::new();
static SSH_TUNNEL_URL: OnceLock<Mutex<Option<String>>> = OnceLock::new();

#[tauri::command]
fn app_ready() -> &'static str {
    "hermes-team-ready"
}

#[tauri::command]
async fn open_external_url(url: String) -> Result<bool, String> {
    let trimmed = url.trim();
    if !(trimmed.starts_with("http://") || trimmed.starts_with("https://")) {
        return Err("只允许打开 http:// 或 https:// URL。".to_string());
    }
    Command::new("open")
        .arg(trimmed)
        .spawn()
        .map_err(|error| format!("打开外部浏览器失败：{error}"))?;
    Ok(true)
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GatewayProbeResult {
    ok: bool,
    base_url: String,
    profile: String,
    message: String,
    capabilities: Option<serde_json::Value>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct HermesProfileInfo {
    name: String,
    active: bool,
    home: String,
    gateway_url: String,
    has_api_key: bool,
    is_default: bool,
    model: String,
    provider: String,
    has_env: bool,
    has_soul: bool,
    skill_count: usize,
    gateway_running: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateProfileInput {
    name: String,
    clone_config: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProfileNameInput {
    name: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HermesInstallStatus {
    installed: bool,
    command: Option<String>,
    version: Option<String>,
    hermes_home: String,
    active_profile: String,
    config_exists: bool,
    env_exists: bool,
    api_server_key_present: bool,
    api_server_configured: bool,
    gateway_running: bool,
    gateway_health: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ConfigHealthSummary {
    errors: usize,
    warnings: usize,
    infos: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ConfigHealthIssue {
    code: String,
    severity: String,
    message: String,
    detail: Option<String>,
    locations: Vec<String>,
    auto_fixable: bool,
    fix_description: Option<String>,
    fix_location: Option<String>,
    context: Option<std::collections::BTreeMap<String, String>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ConfigHealthReport {
    ran_at: u64,
    profile: String,
    issues: Vec<ConfigHealthIssue>,
    summary: ConfigHealthSummary,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConfigHealthFixInput {
    profile: Option<String>,
    code: String,
    context: Option<std::collections::BTreeMap<String, String>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ConfigHealthFixResult {
    ok: bool,
    message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ToolsetInfo {
    key: String,
    label: String,
    description: String,
    enabled: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct McpServerInfo {
    name: String,
    transport: String,
    enabled: bool,
    detail: String,
    url: Option<String>,
    command: Option<String>,
    args: Vec<String>,
    env: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SetToolsetEnabledInput {
    profile: Option<String>,
    key: String,
    enabled: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveMcpServerInput {
    profile: Option<String>,
    name: String,
    transport: String,
    url: Option<String>,
    command: Option<String>,
    args: Option<String>,
    env: Option<String>,
    auth: Option<String>,
    enabled: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RemoveMcpServerInput {
    profile: Option<String>,
    name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SearchSkillsInput {
    profile: Option<String>,
    query: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct InstallSkillInput {
    profile: Option<String>,
    source_path: String,
    category: Option<String>,
    name: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RemoveSkillInput {
    profile: Option<String>,
    category: String,
    name: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct InstalledSkillInfo {
    name: String,
    dir_name: String,
    category: String,
    description: String,
    path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct MemorySummary {
    memory_exists: bool,
    user_exists: bool,
    memory_chars: usize,
    user_chars: usize,
    memory_entries: usize,
    memory_path: String,
    user_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct MemoryContent {
    memory: String,
    user: String,
    memory_path: String,
    user_path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WriteMemoryInput {
    profile: Option<String>,
    kind: String,
    content: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SshConnectionConfig {
    host: String,
    port: u16,
    username: String,
    key_path: String,
    remote_port: u16,
    local_port: u16,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct RemoteConnectionConfig {
    mode: String,
    remote_url: String,
    api_key: String,
    ssh: SshConnectionConfig,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RemoteConnectionStatus {
    mode: String,
    base_url: String,
    ssh_tunnel_active: bool,
    ok: bool,
    message: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AppSettings {
    theme: String,
    rounded_corners: bool,
    font: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct UpdatePreferences {
    auto_upgrade: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateStatus {
    app_version: String,
    hermes_version: Option<String>,
    auto_upgrade: bool,
    last_checked_at: u64,
    update_available: Option<String>,
    message: String,
    log_path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct UpdateRunResult {
    ok: bool,
    message: String,
    log_path: String,
    output: String,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SavedModel {
    id: String,
    name: String,
    provider: String,
    model: String,
    base_url: String,
    api_mode: Option<String>,
    context_length: Option<u64>,
    created_at: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ActiveModelConfig {
    provider: String,
    model: String,
    base_url: String,
    context_length: Option<u64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveModelInput {
    id: Option<String>,
    name: String,
    provider: String,
    model: String,
    base_url: Option<String>,
    api_mode: Option<String>,
    context_length: Option<u64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ActivateModelInput {
    profile: Option<String>,
    provider: String,
    model: String,
    base_url: Option<String>,
    context_length: Option<u64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SetReasoningEffortInput {
    profile: Option<String>,
    value: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProviderKeyInfo {
    provider: String,
    label: String,
    env_key: String,
    present: bool,
    masked: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveProviderKeyInput {
    profile: Option<String>,
    env_key: String,
    value: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "snake_case")]
struct CredentialPoolEntry {
    id: Option<String>,
    label: Option<String>,
    auth_type: Option<String>,
    priority: Option<u64>,
    source: Option<String>,
    access_token: Option<String>,
    refresh_token: Option<String>,
    api_key: Option<String>,
    base_url: Option<String>,
    request_count: Option<u64>,
    key: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CredentialPoolDisplayEntry {
    id: String,
    label: String,
    masked: String,
    auth_type: String,
    source: String,
    base_url: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CredentialPoolGroup {
    provider: String,
    entries: Vec<CredentialPoolDisplayEntry>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AddCredentialPoolEntryInput {
    profile: Option<String>,
    provider: String,
    api_key: String,
    label: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RemoveCredentialPoolEntryInput {
    profile: Option<String>,
    provider: String,
    id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProviderDiscoveryInput {
    profile: Option<String>,
    provider: String,
    base_url: Option<String>,
    env_key: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DiscoveredModel {
    id: String,
    context_length: Option<u64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProviderDiscoveryResult {
    ok: bool,
    provider: String,
    base_url: String,
    env_key: String,
    key_present: bool,
    status: String,
    message: String,
    model_count: usize,
    models: Vec<DiscoveredModel>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct CronRepeat {
    times: Option<u64>,
    completed: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct CronJobInfo {
    id: String,
    name: String,
    schedule: String,
    prompt: String,
    state: String,
    enabled: bool,
    next_run_at: Option<String>,
    last_run_at: Option<String>,
    last_status: Option<String>,
    last_error: Option<String>,
    repeat: Option<CronRepeat>,
    deliver: Vec<String>,
    skills: Vec<String>,
    script: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateCronJobInput {
    profile: Option<String>,
    schedule: String,
    prompt: Option<String>,
    name: Option<String>,
    deliver: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CronJobActionInput {
    profile: Option<String>,
    job_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CronJobActionResult {
    success: bool,
    error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct MessagingEnvVarInfo {
    advanced: bool,
    description: String,
    is_password: bool,
    is_set: bool,
    key: String,
    prompt: String,
    redacted_value: Option<String>,
    required: bool,
    url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct MessagingToolsetInfo {
    description: String,
    enabled: bool,
    key: String,
    label: String,
    risk: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct MessagingPlatformInfo {
    configured: bool,
    description: String,
    docs_url: String,
    enabled: bool,
    env_vars: Vec<MessagingEnvVarInfo>,
    error_code: Option<String>,
    error_message: Option<String>,
    gateway_running: bool,
    id: String,
    name: String,
    state: Option<String>,
    toolsets: Vec<MessagingToolsetInfo>,
    updated_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct MessagingPlatformsResponse {
    editable: bool,
    message: Option<String>,
    platforms: Vec<MessagingPlatformInfo>,
    source: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MessagingPlatformUpdate {
    clear_env: Option<Vec<String>>,
    enabled: Option<bool>,
    env: Option<std::collections::BTreeMap<String, String>>,
    toolsets: Option<std::collections::BTreeMap<String, bool>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct MessagingPlatformTestResponse {
    message: String,
    ok: bool,
    state: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeMessage {
    role: String,
    content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeAttachment {
    path: Option<String>,
    name: Option<String>,
    kind: Option<String>,
    mime: Option<String>,
    size: Option<u64>,
    text: Option<String>,
    data_url: Option<String>,
    original_size: Option<u64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StageAttachmentInput {
    session_id: Option<String>,
    filename: String,
    base64_bytes: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct HermesStateSessionSummary {
    id: String,
    title: String,
    started_at: u64,
    ended_at: Option<u64>,
    message_count: u64,
    model: String,
    preview: String,
    profile: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct HermesStateMessage {
    id: i64,
    kind: String,
    role: String,
    content: String,
    timestamp: u64,
    call_id: Option<String>,
    name: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SelectedPathInfo {
    path: String,
    name: String,
    is_file: bool,
    is_dir: bool,
    size_bytes: Option<u64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DirectoryEntryInfo {
    name: String,
    path: String,
    is_file: bool,
    is_dir: bool,
    size_bytes: Option<u64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct FileReadResult {
    content: String,
    truncated: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RunHermesAgentInput {
    task_id: Option<String>,
    base_url: Option<String>,
    profile: Option<String>,
    model: Option<String>,
    agent_name: String,
    system_prompt: String,
    instruction: String,
    history: Vec<RuntimeMessage>,
    attachments: Vec<RuntimeAttachment>,
    context_folder: Option<String>,
}

#[derive(Debug, Serialize)]
struct RunHermesAgentOutput {
    content: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct RuntimeStreamEvent {
    task_id: String,
    kind: String,
    delta: String,
    content: String,
    message: String,
}

#[derive(Debug, Default)]
struct ParsedStreamDelta {
    message_delta: String,
    reasoning_delta: String,
    tool_event: Option<ParsedToolEvent>,
}

#[derive(Debug, Clone)]
struct ParsedToolEvent {
    call_id: String,
    name: String,
    status: String,
    preview: String,
    result: String,
}

struct RuntimeEndpoint {
    base_url: String,
    auth: Option<String>,
    message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct EnsureGatewayResult {
    ok: bool,
    profile: String,
    base_url: String,
    message: String,
    log_path: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ApiServerKeyResult {
    ok: bool,
    profile: String,
    message: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HermesLogInfo {
    name: String,
    path: String,
    size_bytes: u64,
    modified_at: u64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HermesLogContent {
    name: String,
    path: String,
    content: String,
    truncated: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HermesFileArtifact {
    key: String,
    path: String,
    exists: bool,
    size_bytes: u64,
    redacted: bool,
    content: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HermesDumpArtifact {
    generated_at: u64,
    version: String,
    kind: String,
    app_home: String,
    hermes_home: String,
    active_profile: String,
    install_status: HermesInstallStatus,
    profiles: Vec<String>,
    connection: RemoteConnectionConfig,
    connection_status: RemoteConnectionStatus,
    gateway_probe: GatewayProbeResult,
    logs: Vec<HermesLogInfo>,
    files: Vec<HermesFileArtifact>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RestoreHermesBackupInput {
    path: Option<String>,
    content: Option<String>,
    overwrite: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct HermesRestoreResult {
    target_path: String,
    restored: usize,
    skipped: usize,
    warnings: Vec<String>,
    ok: bool,
}

#[tauri::command]
async fn list_hermes_profiles() -> Result<Vec<HermesProfileInfo>, String> {
    let active = active_profile_name();
    let mut names = vec!["default".to_string()];
    let profiles_dir = hermes_home()?.join("profiles");
    if let Ok(entries) = fs::read_dir(profiles_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                if let Some(name) = path.file_name().and_then(|item| item.to_str()) {
                    if is_valid_profile_name(name) {
                        names.push(name.to_string());
                    }
                }
            }
        }
    }
    names.sort();
    names.dedup();

    Ok(names
        .into_iter()
        .map(|name| {
            let profile = normalize_profile(Some(&name));
            let home = profile_home(profile.as_deref()).unwrap_or_else(|_| PathBuf::new());
            let api_key = read_api_server_key(profile.as_deref()).unwrap_or(None);
            let model_config = read_model_config(profile.as_deref()).unwrap_or(ActiveModelConfig {
                provider: "auto".to_string(),
                model: String::new(),
                base_url: String::new(),
                context_length: None,
            });
            let gateway_url = resolve_gateway_url(profile.as_deref()).unwrap_or_else(|_| {
                if profile.is_some() {
                    "http://127.0.0.1:8643".to_string()
                } else {
                    "http://127.0.0.1:8642".to_string()
                }
            });
            let gateway_running = gateway_is_ready(&gateway_url, api_key.as_deref());
            HermesProfileInfo {
                gateway_url,
                active: name == active,
                is_default: profile.is_none(),
                name: name.clone(),
                home: home.to_string_lossy().to_string(),
                has_api_key: api_key.is_some(),
                model: model_config.model,
                provider: model_config.provider,
                has_env: home.join(".env").exists(),
                has_soul: home.join("SOUL.md").exists(),
                skill_count: count_profile_skills(&home),
                gateway_running,
            }
        })
        .collect())
}

#[tauri::command]
async fn create_hermes_profile(
    input: CreateProfileInput,
) -> Result<Vec<HermesProfileInfo>, String> {
    let name = input.name.trim().to_ascii_lowercase();
    if name == "default" {
        return Err("不能创建 default profile。".to_string());
    }
    if !is_valid_profile_name(&name) {
        return Err(
            "Profile 名称只能包含小写字母、数字、下划线和短横线，且不能超过 64 个字符。"
                .to_string(),
        );
    }
    let mut args = vec!["profile".to_string(), "create".to_string(), name];
    if input.clone_config {
        args.push("--clone".to_string());
    }
    run_hermes_cli(&args, Duration::from_secs(30))?;
    list_hermes_profiles().await
}

#[tauri::command]
async fn delete_hermes_profile(input: ProfileNameInput) -> Result<Vec<HermesProfileInfo>, String> {
    let name = input.name.trim();
    if name == "default" {
        return Err("不能删除 default profile。".to_string());
    }
    if !is_valid_profile_name(name) {
        return Err("无效 Profile 名称。".to_string());
    }
    run_hermes_cli(
        &[
            "profile".to_string(),
            "delete".to_string(),
            name.to_string(),
            "--yes".to_string(),
        ],
        Duration::from_secs(30),
    )?;
    list_hermes_profiles().await
}

#[tauri::command]
async fn set_active_hermes_profile(
    input: ProfileNameInput,
) -> Result<Vec<HermesProfileInfo>, String> {
    let name = input.name.trim();
    if name != "default" && !is_valid_profile_name(name) {
        return Err("无效 Profile 名称。".to_string());
    }
    run_hermes_cli(
        &["profile".to_string(), "use".to_string(), name.to_string()],
        Duration::from_secs(10),
    )?;
    list_hermes_profiles().await
}

#[tauri::command]
async fn inspect_hermes_install() -> Result<HermesInstallStatus, String> {
    let command = find_hermes_command().ok();
    let profile = normalize_profile(Some(&active_profile_name()));
    let home = hermes_home()?;
    let base = resolve_gateway_url(profile.as_deref())
        .unwrap_or_else(|_| "http://127.0.0.1:8642".to_string());
    let auth = read_api_server_key(profile.as_deref()).unwrap_or(None);
    let health = match http_request(&base, "GET", "/health", None, auth.as_deref()) {
        Ok(response) if (200..300).contains(&response.status) => "healthy".to_string(),
        Ok(response) => format!("http_{}", response.status),
        Err(error) => error,
    };
    Ok(HermesInstallStatus {
        installed: command.is_some(),
        command: command
            .as_ref()
            .map(|path| path.to_string_lossy().to_string()),
        version: command.as_ref().and_then(|path| hermes_version(path).ok()),
        hermes_home: home.to_string_lossy().to_string(),
        active_profile: active_profile_name(),
        config_exists: profile_home(profile.as_deref())?
            .join("config.yaml")
            .exists(),
        env_exists: profile_home(profile.as_deref())?.join(".env").exists(),
        api_server_key_present: auth.is_some(),
        api_server_configured: read_nested_yaml_scalar(
            &read_profile_file(profile.as_deref(), "config.yaml")?.unwrap_or_default(),
            &["platforms", "api_server", "enabled"],
        )
        .is_some(),
        gateway_running: health == "healthy",
        gateway_health: health,
    })
}

#[tauri::command]
async fn get_config_health(profile: Option<String>) -> Result<ConfigHealthReport, String> {
    let profile = normalize_profile(profile.as_deref());
    build_config_health_report(profile.as_deref())
}

#[tauri::command]
async fn rerun_config_health(profile: Option<String>) -> Result<ConfigHealthReport, String> {
    get_config_health(profile).await
}

#[tauri::command]
async fn autofix_config_issue(
    input: ConfigHealthFixInput,
) -> Result<ConfigHealthFixResult, String> {
    let profile = normalize_profile(input.profile.as_deref());
    let code = input.code.trim();
    match code {
        "API_SERVER_KEY_NON_CANONICAL" => {
            let token = input
                .context
                .as_ref()
                .and_then(|context| context.get("value"))
                .map(String::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
                .or_else(|| {
                    first_api_server_key_source(profile.as_deref()).map(|source| source.value)
                });
            let Some(token) = token else {
                return Err("没有可迁移的 API_SERVER_KEY。".to_string());
            };
            upsert_env_value(profile.as_deref(), "API_SERVER_KEY", &token)?;
            append_config_health_log(profile.as_deref(), code, "copied API_SERVER_KEY to .env")?;
            Ok(ConfigHealthFixResult {
                ok: true,
                message: "已将 API_SERVER_KEY 写入当前 profile 的 .env。".to_string(),
            })
        }
        "LEGACY_TOOLSET_NAME" => {
            let config = read_profile_file(profile.as_deref(), "config.yaml")?.unwrap_or_default();
            if !config.contains("code-execution") {
                return Ok(ConfigHealthFixResult {
                    ok: true,
                    message: "未发现旧 toolset 名称，无需修复。".to_string(),
                });
            }
            let next = config.replace("code-execution", "code_execution");
            write_profile_file(
                profile.as_deref(),
                "config.yaml",
                &ensure_trailing_newline(&next),
            )?;
            append_config_health_log(
                profile.as_deref(),
                code,
                "renamed code-execution to code_execution",
            )?;
            Ok(ConfigHealthFixResult {
                ok: true,
                message: "已将 code-execution 更新为 code_execution。".to_string(),
            })
        }
        other => Err(format!("该配置问题暂不支持自动修复：{other}")),
    }
}

#[tauri::command]
async fn list_hermes_toolsets(profile: Option<String>) -> Result<Vec<ToolsetInfo>, String> {
    let profile = normalize_profile(profile.as_deref());
    let config = read_profile_file(profile.as_deref(), "config.yaml")?.unwrap_or_default();
    Ok(toolset_defs()
        .into_iter()
        .map(|(key, label, description)| ToolsetInfo {
            key: key.to_string(),
            label: label.to_string(),
            description: description.to_string(),
            enabled: toolset_enabled(&config, key),
        })
        .collect())
}

#[tauri::command]
async fn set_hermes_toolset_enabled(
    input: SetToolsetEnabledInput,
) -> Result<Vec<ToolsetInfo>, String> {
    let profile = normalize_profile(input.profile.as_deref());
    let key = input.key.trim();
    if !toolset_defs()
        .iter()
        .any(|(item_key, _, _)| *item_key == key)
    {
        return Err(format!("未知 toolset：{key}"));
    }
    let path = profile_home(profile.as_deref())?.join("config.yaml");
    let content = fs::read_to_string(&path).unwrap_or_default();
    let next = set_cli_toolset_enabled(&content, key, input.enabled);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("创建 {} 失败：{error}", parent.to_string_lossy()))?;
    }
    fs::write(&path, ensure_trailing_newline(&next))
        .map_err(|error| format!("写入 {} 失败：{error}", path.to_string_lossy()))?;
    list_hermes_toolsets(input.profile).await
}

#[tauri::command]
async fn list_hermes_mcp_servers(profile: Option<String>) -> Result<Vec<McpServerInfo>, String> {
    let profile = normalize_profile(profile.as_deref());
    let config = read_profile_file(profile.as_deref(), "config.yaml")?.unwrap_or_default();
    Ok(parse_mcp_servers(&config))
}

#[tauri::command]
async fn save_hermes_mcp_server(input: SaveMcpServerInput) -> Result<Vec<McpServerInfo>, String> {
    validate_mcp_input(&input)?;
    let profile = normalize_profile(input.profile.as_deref());
    let path = profile_home(profile.as_deref())?.join("config.yaml");
    let content = fs::read_to_string(&path).unwrap_or_default();
    let next = upsert_mcp_server_config(&content, &input)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("创建 {} 失败：{error}", parent.to_string_lossy()))?;
    }
    fs::write(&path, ensure_trailing_newline(&next))
        .map_err(|error| format!("写入 {} 失败：{error}", path.to_string_lossy()))?;
    list_hermes_mcp_servers(input.profile).await
}

#[tauri::command]
async fn remove_hermes_mcp_server(
    input: RemoveMcpServerInput,
) -> Result<Vec<McpServerInfo>, String> {
    let profile = normalize_profile(input.profile.as_deref());
    let name = input.name.trim();
    if !is_valid_mcp_name(name) {
        return Err(format!("无效 MCP server 名称：{name}"));
    }
    let path = profile_home(profile.as_deref())?.join("config.yaml");
    let content = fs::read_to_string(&path).unwrap_or_default();
    let next = remove_mcp_server_config(&content, name);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("创建 {} 失败：{error}", parent.to_string_lossy()))?;
    }
    fs::write(&path, ensure_trailing_newline(&next))
        .map_err(|error| format!("写入 {} 失败：{error}", path.to_string_lossy()))?;
    list_hermes_mcp_servers(input.profile).await
}

#[tauri::command]
async fn list_hermes_skills(profile: Option<String>) -> Result<Vec<InstalledSkillInfo>, String> {
    let profile = normalize_profile(profile.as_deref());
    let root = profile_home(profile.as_deref())?.join("skills");
    let mut skills = Vec::new();
    if !root.exists() {
        return Ok(skills);
    }
    for category in fs::read_dir(&root)
        .map_err(|error| format!("读取 {} 失败：{error}", root.to_string_lossy()))?
        .flatten()
    {
        let category_path = category.path();
        if !category_path.is_dir() {
            continue;
        }
        let category_name = category.file_name().to_string_lossy().to_string();
        for entry in fs::read_dir(&category_path)
            .map_err(|error| format!("读取 {} 失败：{error}", category_path.to_string_lossy()))?
            .flatten()
        {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            let skill_file = path.join("SKILL.md");
            if !skill_file.exists() {
                continue;
            }
            let content = fs::read_to_string(&skill_file).unwrap_or_default();
            let (name, description) = parse_skill_metadata(&content);
            let dir_name = entry.file_name().to_string_lossy().to_string();
            skills.push(InstalledSkillInfo {
                name: if name.is_empty() {
                    dir_name.clone()
                } else {
                    name
                },
                dir_name,
                category: category_name.clone(),
                description,
                path: path.to_string_lossy().to_string(),
            });
        }
    }
    skills.sort_by(|left, right| {
        left.category
            .cmp(&right.category)
            .then(left.name.cmp(&right.name))
    });
    Ok(skills)
}

#[tauri::command]
async fn search_hermes_skills(input: SearchSkillsInput) -> Result<Vec<InstalledSkillInfo>, String> {
    let query = input.query.unwrap_or_default().trim().to_ascii_lowercase();
    let skills = list_hermes_skills(input.profile).await?;
    if query.is_empty() {
        return Ok(skills);
    }
    Ok(skills
        .into_iter()
        .filter(|skill| {
            skill.name.to_ascii_lowercase().contains(&query)
                || skill.dir_name.to_ascii_lowercase().contains(&query)
                || skill.category.to_ascii_lowercase().contains(&query)
                || skill.description.to_ascii_lowercase().contains(&query)
        })
        .collect())
}

#[tauri::command]
async fn install_hermes_skill(input: InstallSkillInput) -> Result<Vec<InstalledSkillInfo>, String> {
    let profile = normalize_profile(input.profile.as_deref());
    let source = PathBuf::from(input.source_path.trim());
    if !source.exists() || !source.is_dir() {
        return Err("Skill 来源必须是本地目录。".to_string());
    }
    let skill_file = source.join("SKILL.md");
    if !skill_file.exists() {
        return Err("Skill 来源目录必须包含 SKILL.md。".to_string());
    }

    let content = fs::read_to_string(&skill_file)
        .map_err(|error| format!("读取 {} 失败：{error}", skill_file.to_string_lossy()))?;
    let (metadata_name, _) = parse_skill_metadata(&content);
    let source_dir_name = source
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_string();
    let category = input
        .category
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("custom");
    let name = input
        .name
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .or_else(|| {
            let trimmed = metadata_name.trim();
            if is_valid_skill_segment(trimmed) {
                Some(trimmed)
            } else {
                None
            }
        })
        .unwrap_or(source_dir_name.trim());

    if !is_valid_skill_segment(category) {
        return Err(format!("无效 Skill 分类：{category}"));
    }
    if !is_valid_skill_segment(name) {
        return Err(format!("无效 Skill 名称：{name}"));
    }

    let skills_root = profile_home(profile.as_deref())?.join("skills");
    let target = skills_root.join(category).join(name);
    let source_canon = source
        .canonicalize()
        .map_err(|error| format!("解析 {} 失败：{error}", source.to_string_lossy()))?;
    if target.exists() {
        let target_canon = target
            .canonicalize()
            .map_err(|error| format!("解析 {} 失败：{error}", target.to_string_lossy()))?;
        if source_canon == target_canon {
            return Err("该 Skill 已经安装在目标位置。".to_string());
        }
        fs::remove_dir_all(&target)
            .map_err(|error| format!("删除旧 Skill {} 失败：{error}", target.to_string_lossy()))?;
    }
    fs::create_dir_all(target.parent().unwrap_or(&skills_root))
        .map_err(|error| format!("创建 Skill 目录失败：{error}"))?;
    copy_dir_recursive(&source_canon, &target)
        .map_err(|error| format!("安装 Skill 到 {} 失败：{error}", target.to_string_lossy()))?;
    list_hermes_skills(input.profile).await
}

#[tauri::command]
async fn remove_hermes_skill(input: RemoveSkillInput) -> Result<Vec<InstalledSkillInfo>, String> {
    let profile = normalize_profile(input.profile.as_deref());
    let category = input.category.trim();
    let name = input.name.trim();
    if !is_valid_skill_segment(category) {
        return Err(format!("无效 Skill 分类：{category}"));
    }
    if !is_valid_skill_segment(name) {
        return Err(format!("无效 Skill 名称：{name}"));
    }
    let skills_root = profile_home(profile.as_deref())?.join("skills");
    let target = skills_root.join(category).join(name);
    if !target.exists() {
        return Ok(list_hermes_skills(input.profile).await?);
    }
    let root_canon = skills_root
        .canonicalize()
        .map_err(|error| format!("解析 {} 失败：{error}", skills_root.to_string_lossy()))?;
    let target_canon = target
        .canonicalize()
        .map_err(|error| format!("解析 {} 失败：{error}", target.to_string_lossy()))?;
    if !target_canon.starts_with(&root_canon) || target_canon == root_canon {
        return Err("拒绝删除 skills 目录之外的路径。".to_string());
    }
    fs::remove_dir_all(&target_canon)
        .map_err(|error| format!("删除 Skill {} 失败：{error}", target.to_string_lossy()))?;
    list_hermes_skills(input.profile).await
}

#[tauri::command]
async fn read_hermes_memory_summary(profile: Option<String>) -> Result<MemorySummary, String> {
    let profile = normalize_profile(profile.as_deref());
    let memory_path = profile_home(profile.as_deref())?
        .join("memories")
        .join("MEMORY.md");
    let user_path = profile_home(profile.as_deref())?
        .join("memories")
        .join("USER.md");
    let memory = fs::read_to_string(&memory_path).unwrap_or_default();
    let user = fs::read_to_string(&user_path).unwrap_or_default();
    Ok(MemorySummary {
        memory_exists: memory_path.exists(),
        user_exists: user_path.exists(),
        memory_chars: memory.chars().count(),
        user_chars: user.chars().count(),
        memory_entries: parse_memory_entries(&memory),
        memory_path: memory_path.to_string_lossy().to_string(),
        user_path: user_path.to_string_lossy().to_string(),
    })
}

#[tauri::command]
async fn read_hermes_memory_content(profile: Option<String>) -> Result<MemoryContent, String> {
    let profile = normalize_profile(profile.as_deref());
    let memory_path = profile_home(profile.as_deref())?
        .join("memories")
        .join("MEMORY.md");
    let user_path = profile_home(profile.as_deref())?
        .join("memories")
        .join("USER.md");
    Ok(MemoryContent {
        memory: fs::read_to_string(&memory_path).unwrap_or_default(),
        user: fs::read_to_string(&user_path).unwrap_or_default(),
        memory_path: memory_path.to_string_lossy().to_string(),
        user_path: user_path.to_string_lossy().to_string(),
    })
}

#[tauri::command]
async fn write_hermes_memory_content(input: WriteMemoryInput) -> Result<MemoryContent, String> {
    let profile = normalize_profile(input.profile.as_deref());
    let memories_dir = profile_home(profile.as_deref())?.join("memories");
    fs::create_dir_all(&memories_dir)
        .map_err(|error| format!("创建 {} 失败：{error}", memories_dir.to_string_lossy()))?;
    let file_name = match input.kind.trim() {
        "memory" => "MEMORY.md",
        "user" => "USER.md",
        other => return Err(format!("未知 memory 类型：{other}")),
    };
    let path = memories_dir.join(file_name);
    fs::write(&path, ensure_trailing_newline(&input.content))
        .map_err(|error| format!("写入 {} 失败：{error}", path.to_string_lossy()))?;
    read_hermes_memory_content(input.profile).await
}

#[tauri::command]
async fn get_app_settings() -> Result<AppSettings, String> {
    read_app_settings()
}

#[tauri::command]
async fn save_app_settings(settings: AppSettings) -> Result<AppSettings, String> {
    let normalized = normalize_app_settings(settings);
    write_app_settings(&normalized)?;
    Ok(normalized)
}

#[tauri::command]
async fn get_update_status() -> Result<UpdateStatus, String> {
    build_update_status("尚未运行更新检查。".to_string(), None)
}

#[tauri::command]
async fn set_auto_upgrade_enabled(enabled: bool) -> Result<UpdateStatus, String> {
    write_update_preferences(&UpdatePreferences {
        auto_upgrade: enabled,
    })?;
    append_update_log(&format!("auto_upgrade={enabled}"))?;
    build_update_status("更新偏好已保存。".to_string(), None)
}

#[tauri::command]
async fn check_for_app_updates() -> Result<UpdateStatus, String> {
    let status = build_update_status("已检查本地 Hermes 版本。".to_string(), None)?;
    append_update_log(&format!(
        "check app_version={} hermes_version={}",
        status.app_version,
        status
            .hermes_version
            .clone()
            .unwrap_or_else(|| "unknown".to_string())
    ))?;
    Ok(status)
}

#[tauri::command]
async fn run_hermes_update() -> Result<UpdateRunResult, String> {
    let log_path = updater_log_path()?;
    append_update_log("running hermes update")?;
    let result = run_hermes_cli(&["update".to_string()], Duration::from_secs(120));
    match result {
        Ok(output) => {
            let trimmed = truncate(output.trim(), 12_000);
            append_update_log(&format!("hermes update ok\n{trimmed}"))?;
            Ok(UpdateRunResult {
                ok: true,
                message: "hermes update 已完成。".to_string(),
                log_path: log_path.to_string_lossy().to_string(),
                output: trimmed,
            })
        }
        Err(error) => {
            append_update_log(&format!("hermes update failed: {error}"))?;
            Ok(UpdateRunResult {
                ok: false,
                message: format!("hermes update 失败：{error}"),
                log_path: log_path.to_string_lossy().to_string(),
                output: error,
            })
        }
    }
}

#[tauri::command]
async fn get_hermes_model_config(profile: Option<String>) -> Result<ActiveModelConfig, String> {
    let profile = normalize_profile(profile.as_deref());
    read_model_config(profile.as_deref())
}

#[tauri::command]
async fn get_hermes_reasoning_effort(profile: Option<String>) -> Result<String, String> {
    let profile = normalize_profile(profile.as_deref());
    read_reasoning_effort_config(profile.as_deref())
}

#[tauri::command]
async fn set_hermes_reasoning_effort(input: SetReasoningEffortInput) -> Result<String, String> {
    let profile = normalize_profile(input.profile.as_deref());
    let value = normalize_reasoning_effort(&input.value);
    write_reasoning_effort_config(profile.as_deref(), &value)?;
    read_reasoning_effort_config(profile.as_deref())
}

#[tauri::command]
async fn list_hermes_models() -> Result<Vec<SavedModel>, String> {
    read_models()
}

#[tauri::command]
async fn save_hermes_model(input: SaveModelInput) -> Result<SavedModel, String> {
    validate_model_input(&input)?;
    let mut models = read_models()?;
    let now = unix_millis();
    if let Some(id) = input
        .id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        let index = models
            .iter()
            .position(|model| model.id == id)
            .ok_or_else(|| format!("未找到模型条目：{id}"))?;
        models[index] = SavedModel {
            id: id.to_string(),
            name: input.name.trim().to_string(),
            provider: input.provider.trim().to_string(),
            model: input.model.trim().to_string(),
            base_url: input.base_url.unwrap_or_default().trim().to_string(),
            api_mode: input
                .api_mode
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty()),
            context_length: input.context_length.filter(|value| *value > 0),
            created_at: models[index].created_at,
        };
        let saved = models[index].clone();
        write_models(&models)?;
        return Ok(saved);
    }

    if let Some(existing) = models
        .iter()
        .find(|item| item.provider == input.provider.trim() && item.model == input.model.trim())
    {
        return Ok(existing.clone());
    }

    let saved = SavedModel {
        id: format!("model_{}", random_hex(8)?),
        name: input.name.trim().to_string(),
        provider: input.provider.trim().to_string(),
        model: input.model.trim().to_string(),
        base_url: input.base_url.unwrap_or_default().trim().to_string(),
        api_mode: input
            .api_mode
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty()),
        context_length: input.context_length.filter(|value| *value > 0),
        created_at: now,
    };
    models.push(saved.clone());
    write_models(&models)?;
    Ok(saved)
}

#[tauri::command]
async fn remove_hermes_model(id: String) -> Result<bool, String> {
    let mut models = read_models()?;
    let before = models.len();
    models.retain(|model| model.id != id);
    if models.len() == before {
        return Ok(false);
    }
    write_models(&models)?;
    Ok(true)
}

#[tauri::command]
async fn activate_hermes_model(input: ActivateModelInput) -> Result<ActiveModelConfig, String> {
    let profile = normalize_profile(input.profile.as_deref());
    let provider = input.provider.trim();
    let model = input.model.trim();
    if provider.is_empty() {
        return Err("provider 不能为空".to_string());
    }
    if model.is_empty() {
        return Err("model 不能为空".to_string());
    }
    let base_url = input
        .base_url
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .or_else(|| canonical_provider_base_url(provider).map(str::to_string))
        .unwrap_or_default();
    write_model_config(
        profile.as_deref(),
        provider,
        model,
        &base_url,
        input.context_length.filter(|value| *value > 0),
    )?;
    read_model_config(profile.as_deref())
}

#[tauri::command]
async fn list_provider_keys(profile: Option<String>) -> Result<Vec<ProviderKeyInfo>, String> {
    let profile = normalize_profile(profile.as_deref());
    let env = read_profile_file(profile.as_deref(), ".env")?.unwrap_or_default();
    Ok(provider_key_defs()
        .into_iter()
        .map(|(provider, label, env_key)| {
            let value = read_env_value(&env, env_key).unwrap_or_default();
            ProviderKeyInfo {
                provider: provider.to_string(),
                label: label.to_string(),
                env_key: env_key.to_string(),
                present: !value.trim().is_empty(),
                masked: mask_secret(&value),
            }
        })
        .collect())
}

#[tauri::command]
async fn save_provider_key(input: SaveProviderKeyInput) -> Result<ProviderKeyInfo, String> {
    let profile = normalize_profile(input.profile.as_deref());
    let env_key = input.env_key.trim();
    if !is_valid_env_key(env_key) {
        return Err(format!("无效环境变量名：{env_key}"));
    }
    let value = input.value.trim();
    if value.is_empty() {
        return Err("API key 不能为空。".to_string());
    }
    upsert_env_value(profile.as_deref(), env_key, value)?;
    let (provider, label, _) = provider_key_defs()
        .into_iter()
        .find(|(_, _, key)| *key == env_key)
        .unwrap_or(("custom", env_key, env_key));
    Ok(ProviderKeyInfo {
        provider: provider.to_string(),
        label: label.to_string(),
        env_key: env_key.to_string(),
        present: true,
        masked: mask_secret(value),
    })
}

#[tauri::command]
async fn list_credential_pool(profile: Option<String>) -> Result<Vec<CredentialPoolGroup>, String> {
    let profile = normalize_profile(profile.as_deref());
    let pool = read_credential_pool(profile.as_deref())?;
    let mut groups = pool
        .into_iter()
        .map(|(provider, entries)| CredentialPoolGroup {
            provider,
            entries: entries.into_iter().map(display_credential_entry).collect(),
        })
        .collect::<Vec<_>>();
    groups.sort_by(|left, right| left.provider.cmp(&right.provider));
    Ok(groups)
}

#[tauri::command]
async fn add_credential_pool_entry(
    input: AddCredentialPoolEntryInput,
) -> Result<Vec<CredentialPoolGroup>, String> {
    let profile = normalize_profile(input.profile.as_deref());
    let provider = input.provider.trim();
    let api_key = input.api_key.trim();
    if provider.is_empty() {
        return Err("provider 不能为空。".to_string());
    }
    if api_key.is_empty() {
        return Err("API key 不能为空。".to_string());
    }
    let mut store = read_auth_store(profile.as_deref())?;
    let mut pool = auth_store_pool(&store);
    let existing = pool.remove(provider).unwrap_or_default();
    let entry = build_credential_pool_entry(
        provider,
        api_key,
        input.label.as_deref().unwrap_or(""),
        &existing,
    )?;
    let mut next = existing;
    next.push(entry);
    pool.insert(provider.to_string(), next);
    write_auth_store_pool(&mut store, pool);
    write_auth_store(profile.as_deref(), &store)?;
    list_credential_pool(input.profile).await
}

#[tauri::command]
async fn remove_credential_pool_entry(
    input: RemoveCredentialPoolEntryInput,
) -> Result<Vec<CredentialPoolGroup>, String> {
    let profile = normalize_profile(input.profile.as_deref());
    let provider = input.provider.trim();
    let id = input.id.trim();
    if provider.is_empty() || id.is_empty() {
        return Err("provider 和 id 不能为空。".to_string());
    }
    let mut store = read_auth_store(profile.as_deref())?;
    let mut pool = auth_store_pool(&store);
    if let Some(entries) = pool.get_mut(provider) {
        entries.retain(|entry| entry_id(entry) != id);
    }
    write_auth_store_pool(&mut store, pool);
    write_auth_store(profile.as_deref(), &store)?;
    list_credential_pool(input.profile).await
}

#[tauri::command]
async fn discover_provider_models(
    input: ProviderDiscoveryInput,
) -> Result<ProviderDiscoveryResult, String> {
    let profile = normalize_profile(input.profile.as_deref());
    let provider = input.provider.trim().to_ascii_lowercase();
    let base_url = input
        .base_url
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.trim_end_matches('/').to_string())
        .or_else(|| canonical_provider_base_url(&provider).map(str::to_string))
        .unwrap_or_default();
    if provider.is_empty() {
        return Err("provider 不能为空。".to_string());
    }
    if base_url.is_empty() {
        return Ok(provider_discovery_result(
            false,
            &provider,
            "",
            "",
            false,
            "unknown-host",
            "当前 provider 没有可探测的 base URL。",
            Vec::new(),
        ));
    }
    if provider_discovery_unsupported(&provider) {
        return Ok(provider_discovery_result(
            false,
            &provider,
            &base_url,
            "",
            false,
            "unsupported",
            "当前 provider 不支持静态 API key 的 /models 探测。",
            Vec::new(),
        ));
    }

    let env_key = input
        .env_key
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .or_else(|| provider_env_key(&provider, &base_url).map(str::to_string))
        .unwrap_or_else(|| "CUSTOM_API_KEY".to_string());
    let env = read_profile_file(profile.as_deref(), ".env")?.unwrap_or_default();
    let api_key = read_env_value(&env, &env_key).unwrap_or_default();
    let key_present = !api_key.trim().is_empty();
    let no_key_ok = provider_can_discover_without_key(&provider, &base_url);
    if !key_present && !no_key_ok {
        return Ok(provider_discovery_result(
            false,
            &provider,
            &base_url,
            &env_key,
            false,
            "no-key",
            "未发现该 provider 的 API key。",
            Vec::new(),
        ));
    }

    let endpoint = format!("{}/models", base_url.trim_end_matches('/'));
    match curl_json_get(&endpoint, &provider, api_key.trim()) {
        Ok((status, body)) if (200..300).contains(&status) => {
            let models = parse_provider_models(&body);
            let message = if models.is_empty() {
                "Provider 可连接，但响应中没有可解析的模型列表。".to_string()
            } else {
                format!("Provider 可连接，发现 {} 个模型。", models.len())
            };
            Ok(provider_discovery_result(
                true,
                &provider,
                &base_url,
                &env_key,
                key_present,
                "ok",
                &message,
                models,
            ))
        }
        Ok((status, body)) => Ok(provider_discovery_result(
            false,
            &provider,
            &base_url,
            &env_key,
            key_present,
            &format!("http_{status}"),
            &format!("Provider 返回 HTTP {status}：{}", truncate(&body, 240)),
            Vec::new(),
        )),
        Err(error) => Ok(provider_discovery_result(
            false,
            &provider,
            &base_url,
            &env_key,
            key_present,
            "error",
            &error,
            Vec::new(),
        )),
    }
}

#[tauri::command]
async fn list_hermes_cron_jobs(
    include_disabled: Option<bool>,
    profile: Option<String>,
) -> Result<Vec<CronJobInfo>, String> {
    let include_disabled = include_disabled.unwrap_or(true);
    let config = read_connection_config()?;
    if config.mode == "remote" || config.mode == "ssh" {
        return list_remote_cron_jobs(include_disabled, profile.as_deref());
    }

    let profile = normalize_profile(profile.as_deref());
    let path = profile_home(profile.as_deref())?
        .join("cron")
        .join("jobs.json");
    if !path.exists() {
        return Ok(Vec::new());
    }
    let content = fs::read_to_string(&path)
        .map_err(|error| format!("读取 {} 失败：{error}", path.to_string_lossy()))?;
    let parsed = serde_json::from_str::<serde_json::Value>(&content)
        .map_err(|error| format!("解析 {} 失败：{error}", path.to_string_lossy()))?;
    let raw_jobs = if let Some(items) = parsed.as_array() {
        items.clone()
    } else {
        parsed
            .get("jobs")
            .and_then(|value| value.as_array())
            .cloned()
            .unwrap_or_default()
    };
    let mut jobs = raw_jobs
        .iter()
        .filter_map(normalize_cron_job)
        .filter(|job| include_disabled || job.enabled)
        .collect::<Vec<_>>();
    jobs.sort_by(|left, right| {
        left.next_run_at
            .cmp(&right.next_run_at)
            .then_with(|| left.name.cmp(&right.name))
    });
    Ok(jobs)
}

#[tauri::command]
async fn create_hermes_cron_job(input: CreateCronJobInput) -> Result<CronJobActionResult, String> {
    let schedule = input.schedule.trim();
    if schedule.is_empty() {
        return Ok(cron_action_error("schedule 不能为空。"));
    }
    let config = read_connection_config()?;
    if config.mode == "remote" || config.mode == "ssh" {
        let body = json!({
            "name": input.name.unwrap_or_default(),
            "schedule": schedule,
            "prompt": input.prompt.unwrap_or_default(),
            "deliver": input.deliver.unwrap_or_else(|| "local".to_string()),
        });
        return remote_cron_request("POST", "/api/jobs", Some(body), input.profile.as_deref());
    }

    let mut args = vec!["create".to_string(), schedule.to_string()];
    if let Some(prompt) = input
        .prompt
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        args.push(prompt.to_string());
    }
    if let Some(name) = input
        .name
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        args.push("--name".to_string());
        args.push(name.to_string());
    }
    if let Some(deliver) = input
        .deliver
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        args.push("--deliver".to_string());
        args.push(deliver.to_string());
    }
    run_cron_command(&args, input.profile.as_deref())
}

#[tauri::command]
async fn remove_hermes_cron_job(input: CronJobActionInput) -> Result<CronJobActionResult, String> {
    run_cron_action(input, "remove", "DELETE", None).await
}

#[tauri::command]
async fn pause_hermes_cron_job(input: CronJobActionInput) -> Result<CronJobActionResult, String> {
    run_cron_action(input, "pause", "POST", Some("pause")).await
}

#[tauri::command]
async fn resume_hermes_cron_job(input: CronJobActionInput) -> Result<CronJobActionResult, String> {
    run_cron_action(input, "resume", "POST", Some("resume")).await
}

#[tauri::command]
async fn trigger_hermes_cron_job(input: CronJobActionInput) -> Result<CronJobActionResult, String> {
    run_cron_action(input, "run", "POST", Some("run")).await
}

#[tauri::command]
async fn list_messaging_platforms(
    profile: Option<String>,
) -> Result<MessagingPlatformsResponse, String> {
    let config = read_connection_config()?;
    if config.mode == "remote" || config.mode == "ssh" {
        return remote_messaging_platforms(
            "GET",
            "/api/messaging/platforms",
            None,
            profile.as_deref(),
        )
        .map(|mut response| {
            response.editable = true;
            response.source = "remote-api".to_string();
            response
        });
    }

    let profile = normalize_profile(profile.as_deref());
    let env = read_env_map(profile.as_deref())?;
    let config_text = read_profile_file(profile.as_deref(), "config.yaml")?.unwrap_or_default();
    let gateway_running = resolve_gateway_url(profile.as_deref())
        .ok()
        .and_then(|base| {
            let auth = read_api_server_key(profile.as_deref()).ok().flatten();
            Some(gateway_is_ready(&base, auth.as_deref()))
        })
        .unwrap_or(false);
    Ok(MessagingPlatformsResponse {
        editable: true,
        message: None,
        platforms: messaging_platform_defs()
            .into_iter()
            .map(|platform| build_messaging_platform(platform, &env, &config_text, gateway_running))
            .collect(),
        source: "desktop".to_string(),
    })
}

#[tauri::command]
async fn update_messaging_platform(
    platform: String,
    update: MessagingPlatformUpdate,
    profile: Option<String>,
) -> Result<MessagingPlatformsResponse, String> {
    let platform_id = platform.trim();
    validate_messaging_platform_update(platform_id, &update)?;
    let config = read_connection_config()?;
    if config.mode == "remote" || config.mode == "ssh" {
        let path = format!(
            "/api/messaging/platforms/{}",
            encode_path_segment(platform_id)
        );
        let body = serde_json::to_value(&update)
            .map_err(|error| format!("序列化 Messaging Platform 更新失败：{error}"))?;
        let _ = remote_messaging_action("PUT", &path, Some(body), profile.as_deref())?;
        return list_messaging_platforms(profile).await;
    }

    let profile_name = normalize_profile(profile.as_deref());
    for key in update.clear_env.unwrap_or_default() {
        remove_env_value(profile_name.as_deref(), &key)?;
    }
    for (key, value) in update.env.unwrap_or_default() {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            upsert_env_value(profile_name.as_deref(), &key, trimmed)?;
        }
    }
    let config_path = profile_home(profile_name.as_deref())?.join("config.yaml");
    let mut config_text = fs::read_to_string(&config_path).unwrap_or_default();
    let mut config_changed = false;
    if let Some(enabled) = update.enabled {
        config_text = set_platform_enabled(&config_text, platform_id, enabled);
        config_changed = true;
    }
    for (toolset, enabled) in update.toolsets.unwrap_or_default() {
        config_text = set_platform_toolset_enabled(&config_text, platform_id, &toolset, enabled);
        config_changed = true;
    }
    if config_changed {
        if let Some(parent) = config_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("创建 {} 失败：{error}", parent.to_string_lossy()))?;
        }
        fs::write(&config_path, ensure_trailing_newline(&config_text))
            .map_err(|error| format!("写入 {} 失败：{error}", config_path.to_string_lossy()))?;
    }
    list_messaging_platforms(profile).await
}

#[tauri::command]
async fn test_messaging_platform(
    platform: String,
    profile: Option<String>,
) -> Result<MessagingPlatformTestResponse, String> {
    let platform_id = platform.trim();
    let config = read_connection_config()?;
    if config.mode == "remote" || config.mode == "ssh" {
        let path = format!(
            "/api/messaging/platforms/{}/test",
            encode_path_segment(platform_id)
        );
        return remote_messaging_test("POST", &path, profile.as_deref());
    }
    let response = list_messaging_platforms(profile).await?;
    let Some(platform) = response
        .platforms
        .into_iter()
        .find(|item| item.id == platform_id)
    else {
        return Ok(MessagingPlatformTestResponse {
            ok: false,
            state: Some("unknown".to_string()),
            message: format!("未知 Messaging Platform：{platform_id}"),
        });
    };
    Ok(test_local_messaging_platform_status(&platform))
}

#[tauri::command]
async fn load_hermes_team_state() -> Result<Option<serde_json::Value>, String> {
    let path = app_state_path()?;
    if !path.exists() {
        return Ok(None);
    }
    let content = fs::read_to_string(&path)
        .map_err(|error| format!("读取 {} 失败：{error}", path.to_string_lossy()))?;
    serde_json::from_str(&content)
        .map(Some)
        .map_err(|error| format!("解析 {} 失败：{error}", path.to_string_lossy()))
}

#[tauri::command]
async fn save_hermes_team_state(state: serde_json::Value) -> Result<bool, String> {
    let path = app_state_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("创建 {} 失败：{error}", parent.to_string_lossy()))?;
    }
    let body = serde_json::to_string_pretty(&state)
        .map_err(|error| format!("序列化 Hermes Team 状态失败：{error}"))?;
    fs::write(&path, body)
        .map_err(|error| format!("写入 {} 失败：{error}", path.to_string_lossy()))?;
    Ok(true)
}

#[tauri::command]
async fn load_hermes_team_sessions() -> Result<Vec<serde_json::Value>, String> {
    let path = app_sessions_path()?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let content = fs::read_to_string(&path)
        .map_err(|error| format!("读取 {} 失败：{error}", path.to_string_lossy()))?;
    serde_json::from_str::<Vec<serde_json::Value>>(&content)
        .map_err(|error| format!("解析 {} 失败：{error}", path.to_string_lossy()))
}

fn write_hermes_team_sessions(sessions: &[serde_json::Value]) -> Result<(), String> {
    let path = app_sessions_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("创建 {} 失败：{error}", parent.to_string_lossy()))?;
    }
    let body = serde_json::to_string_pretty(sessions)
        .map_err(|error| format!("序列化 Hermes Team session 失败：{error}"))?;
    fs::write(&path, body).map_err(|error| format!("写入 {} 失败：{error}", path.to_string_lossy()))
}

#[tauri::command]
async fn save_hermes_team_session(
    session: serde_json::Value,
) -> Result<Vec<serde_json::Value>, String> {
    let mut sessions = load_hermes_team_sessions().await?;
    let id = session
        .get("id")
        .and_then(|value| value.as_str())
        .unwrap_or("default")
        .to_string();
    sessions.retain(|item| item.get("id").and_then(|value| value.as_str()) != Some(id.as_str()));
    sessions.insert(0, session);
    sessions.sort_by(|left, right| {
        let left_time = left
            .get("updatedAt")
            .and_then(|value| value.as_u64())
            .unwrap_or(0);
        let right_time = right
            .get("updatedAt")
            .and_then(|value| value.as_u64())
            .unwrap_or(0);
        right_time.cmp(&left_time)
    });
    sessions.truncate(50);
    write_hermes_team_sessions(&sessions)?;
    Ok(sessions)
}

#[tauri::command]
async fn update_hermes_team_session_title(
    session_id: String,
    title: String,
) -> Result<Vec<serde_json::Value>, String> {
    let id = session_id.trim();
    if id.is_empty() {
        return Err("Session id 不能为空。".to_string());
    }
    let trimmed_title = title.trim();
    if trimmed_title.is_empty() {
        return Err("Session 标题不能为空。".to_string());
    }

    let mut sessions = load_hermes_team_sessions().await?;
    let mut found = false;
    for session in sessions.iter_mut() {
        if session.get("id").and_then(|value| value.as_str()) == Some(id) {
            if let Some(object) = session.as_object_mut() {
                object.insert(
                    "title".to_string(),
                    serde_json::Value::String(trimmed_title.to_string()),
                );
                object.insert("titleEdited".to_string(), serde_json::Value::Bool(true));
            }
            found = true;
            break;
        }
    }
    if !found {
        return Err(format!("未找到 session：{id}"));
    }
    write_hermes_team_sessions(&sessions)?;
    Ok(sessions)
}

#[tauri::command]
async fn delete_hermes_team_session(session_id: String) -> Result<Vec<serde_json::Value>, String> {
    let id = session_id.trim();
    if id.is_empty() {
        return Err("Session id 不能为空。".to_string());
    }
    let mut sessions = load_hermes_team_sessions().await?;
    let before = sessions.len();
    sessions.retain(|item| item.get("id").and_then(|value| value.as_str()) != Some(id));
    if sessions.len() == before {
        return Err(format!("未找到 session：{id}"));
    }
    write_hermes_team_sessions(&sessions)?;
    Ok(sessions)
}

#[tauri::command]
async fn list_hermes_state_sessions(
    profile: Option<String>,
) -> Result<Vec<HermesStateSessionSummary>, String> {
    let profile_name = profile.unwrap_or_else(|| active_profile_name());
    let db_path = state_db_path_for_profile(&profile_name)?;
    if !db_path.exists() {
        return Ok(Vec::new());
    }
    let sql = "SELECT s.id, COALESCE(s.title, '') AS title, COALESCE(s.started_at, 0) AS started_at, s.ended_at, COALESCE(s.message_count, 0) AS message_count, COALESCE(s.model, '') AS model, COALESCE((SELECT content FROM messages m WHERE m.session_id = s.id AND m.role = 'user' AND m.content IS NOT NULL ORDER BY m.timestamp, m.id LIMIT 1), '') AS preview FROM sessions s ORDER BY s.started_at DESC LIMIT 100";
    let rows = sqlite_json_rows(&db_path, sql)?;
    Ok(rows
        .into_iter()
        .filter_map(|row| {
            let id = json_field_string(&row, "id")?;
            let preview = json_field_string(&row, "preview").unwrap_or_default();
            let title = json_field_string(&row, "title")
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| title_from_preview(&preview, &id));
            Some(HermesStateSessionSummary {
                id,
                title,
                started_at: json_field_u64(&row, "started_at").unwrap_or(0),
                ended_at: json_field_u64(&row, "ended_at"),
                message_count: json_field_u64(&row, "message_count").unwrap_or(0),
                model: json_field_string(&row, "model").unwrap_or_default(),
                preview: truncate(&preview, 240),
                profile: profile_name.clone(),
            })
        })
        .collect())
}

#[tauri::command]
async fn load_hermes_state_session(
    profile: Option<String>,
    session_id: String,
) -> Result<Vec<HermesStateMessage>, String> {
    let profile_name = profile.unwrap_or_else(|| active_profile_name());
    let db_path = state_db_path_for_profile(&profile_name)?;
    if !db_path.exists() {
        return Err(format!(
            "未找到 Hermes state.db：{}",
            db_path.to_string_lossy()
        ));
    }
    let escaped_session_id = sql_quote(&session_id);
    let sql = format!(
        "SELECT id, role, COALESCE(content, '') AS content, COALESCE(timestamp, 0) AS timestamp, tool_call_id, tool_calls, tool_name, reasoning, reasoning_content, reasoning_details FROM messages WHERE session_id = {escaped_session_id} AND role IN ('user','assistant','tool') ORDER BY timestamp, id"
    );
    let rows = sqlite_json_rows(&db_path, &sql)?;
    let mut messages = Vec::new();
    for row in rows {
        let id = json_field_i64(&row, "id").unwrap_or(0);
        let role = json_field_string(&row, "role").unwrap_or_default();
        let content = json_field_string(&row, "content").unwrap_or_default();
        let timestamp = json_field_u64(&row, "timestamp").unwrap_or(0);
        if role == "user" {
            if !content.trim().is_empty() {
                messages.push(HermesStateMessage {
                    id,
                    kind: "user".to_string(),
                    role,
                    content,
                    timestamp,
                    call_id: None,
                    name: None,
                });
            }
            continue;
        }
        if role == "assistant" {
            if let Some(reasoning) = pick_state_reasoning(&row) {
                messages.push(HermesStateMessage {
                    id,
                    kind: "reasoning".to_string(),
                    role: "assistant".to_string(),
                    content: reasoning,
                    timestamp,
                    call_id: None,
                    name: None,
                });
            }
            if !content.trim().is_empty() {
                messages.push(HermesStateMessage {
                    id,
                    kind: "assistant".to_string(),
                    role: "assistant".to_string(),
                    content,
                    timestamp,
                    call_id: None,
                    name: None,
                });
            }
            for tool in parse_state_tool_calls(json_field_string(&row, "tool_calls").as_deref()) {
                messages.push(HermesStateMessage {
                    id,
                    kind: "tool".to_string(),
                    role: "assistant".to_string(),
                    content: format_tool_call_history(&tool.0, &tool.1),
                    timestamp,
                    call_id: Some(tool.2),
                    name: Some(tool.0),
                });
            }
            continue;
        }
        if role == "tool" {
            let name = json_field_string(&row, "tool_name").unwrap_or_else(|| "tool".to_string());
            messages.push(HermesStateMessage {
                id,
                kind: "tool".to_string(),
                role,
                content: format_tool_result_history(&name, &content),
                timestamp,
                call_id: json_field_string(&row, "tool_call_id"),
                name: Some(name),
            });
        }
    }
    Ok(messages)
}

fn sqlite_json_rows(db_path: &Path, sql: &str) -> Result<Vec<serde_json::Value>, String> {
    let output = Command::new("sqlite3")
        .arg("-json")
        .arg(db_path)
        .arg(sql)
        .output()
        .map_err(|error| format!("调用 sqlite3 失败：{error}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "读取 Hermes state.db 失败：{}",
            truncate(&stderr, 500)
        ));
    }
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if stdout.is_empty() {
        return Ok(Vec::new());
    }
    serde_json::from_str::<Vec<serde_json::Value>>(&stdout)
        .map_err(|error| format!("解析 sqlite3 JSON 输出失败：{error}"))
}

fn sql_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

fn json_field_string(row: &serde_json::Value, key: &str) -> Option<String> {
    row.get(key).and_then(|value| {
        if let Some(text) = value.as_str() {
            let trimmed = text.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        } else if value.is_number() || value.is_boolean() {
            Some(value.to_string())
        } else {
            None
        }
    })
}

fn json_field_u64(row: &serde_json::Value, key: &str) -> Option<u64> {
    row.get(key).and_then(|value| {
        value
            .as_u64()
            .or_else(|| {
                value
                    .as_i64()
                    .and_then(|number| (number >= 0).then_some(number as u64))
            })
            .or_else(|| {
                value
                    .as_f64()
                    .and_then(|number| (number >= 0.0).then_some(number as u64))
            })
            .or_else(|| value.as_str().and_then(|text| text.parse::<u64>().ok()))
    })
}

fn json_field_i64(row: &serde_json::Value, key: &str) -> Option<i64> {
    row.get(key).and_then(|value| {
        value
            .as_i64()
            .or_else(|| value.as_u64().and_then(|number| i64::try_from(number).ok()))
            .or_else(|| value.as_str().and_then(|text| text.parse::<i64>().ok()))
    })
}

fn title_from_preview(preview: &str, session_id: &str) -> String {
    let visible = preview
        .lines()
        .find(|line| !line.trim().is_empty())
        .map(str::trim)
        .unwrap_or("");
    if visible.is_empty() {
        format!(
            "Hermes Session {}",
            session_id.chars().rev().take(6).collect::<String>()
        )
    } else {
        truncate(visible, 80)
    }
}

fn pick_state_reasoning(row: &serde_json::Value) -> Option<String> {
    for key in ["reasoning", "reasoning_content", "reasoning_details"] {
        if let Some(value) = json_field_string(row, key) {
            return Some(value);
        }
    }
    None
}

fn parse_state_tool_calls(raw: Option<&str>) -> Vec<(String, String, String)> {
    let Some(raw) = raw else {
        return Vec::new();
    };
    let Ok(value) = serde_json::from_str::<serde_json::Value>(raw) else {
        return Vec::new();
    };
    let Some(items) = value.as_array() else {
        return Vec::new();
    };
    items
        .iter()
        .filter_map(|item| {
            let name = item
                .pointer("/function/name")
                .and_then(|value| value.as_str())
                .unwrap_or("tool")
                .to_string();
            let args = item
                .pointer("/function/arguments")
                .and_then(|value| value.as_str())
                .unwrap_or("")
                .to_string();
            let call_id = item
                .get("call_id")
                .and_then(|value| value.as_str())
                .or_else(|| item.get("id").and_then(|value| value.as_str()))
                .unwrap_or("")
                .to_string();
            if name.trim().is_empty() {
                None
            } else {
                Some((name, pretty_json_or_raw(&args), call_id))
            }
        })
        .collect()
}

fn pretty_json_or_raw(raw: &str) -> String {
    serde_json::from_str::<serde_json::Value>(raw)
        .ok()
        .and_then(|value| serde_json::to_string_pretty(&value).ok())
        .unwrap_or_else(|| raw.to_string())
}

fn format_tool_call_history(name: &str, args: &str) -> String {
    if args.trim().is_empty() {
        format!("running · {name}")
    } else {
        format!("running · {name}\n{args}")
    }
}

fn format_tool_result_history(name: &str, content: &str) -> String {
    if content.trim().is_empty() {
        format!("completed · {name}")
    } else {
        format!("completed · {name}\n{}", content.trim())
    }
}

#[tauri::command]
async fn list_hermes_logs() -> Result<Vec<HermesLogInfo>, String> {
    let mut logs = Vec::new();
    for dir in hermes_log_dirs()? {
        if !dir.exists() {
            continue;
        }
        let entries = fs::read_dir(&dir)
            .map_err(|error| format!("读取 {} 失败：{error}", dir.to_string_lossy()))?;
        for entry in entries {
            let entry = entry.map_err(|error| format!("读取日志目录项失败：{error}"))?;
            let path = entry.path();
            if !path.is_file() || !is_log_file(&path) {
                continue;
            }
            let metadata = fs::metadata(&path)
                .map_err(|error| format!("读取 {} 元数据失败：{error}", path.to_string_lossy()))?;
            logs.push(HermesLogInfo {
                name: path
                    .file_name()
                    .and_then(|value| value.to_str())
                    .unwrap_or("log")
                    .to_string(),
                path: path.to_string_lossy().to_string(),
                size_bytes: metadata.len(),
                modified_at: modified_millis(&metadata),
            });
        }
    }
    logs.sort_by(|left, right| right.modified_at.cmp(&left.modified_at));
    Ok(logs)
}

#[tauri::command]
async fn read_hermes_log(
    path: String,
    max_bytes: Option<usize>,
) -> Result<HermesLogContent, String> {
    let path = PathBuf::from(path);
    ensure_allowed_log_path(&path)?;
    let max_bytes = max_bytes.unwrap_or(96 * 1024).max(4096);
    let bytes = fs::read(&path)
        .map_err(|error| format!("读取 {} 失败：{error}", path.to_string_lossy()))?;
    let truncated = bytes.len() > max_bytes;
    let start = bytes.len().saturating_sub(max_bytes);
    let content = String::from_utf8_lossy(&bytes[start..]).to_string();
    Ok(HermesLogContent {
        name: path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("log")
            .to_string(),
        path: path.to_string_lossy().to_string(),
        content,
        truncated,
    })
}

#[tauri::command]
async fn create_hermes_debug_dump() -> Result<String, String> {
    create_hermes_bundle("debug").await
}

#[tauri::command]
async fn create_hermes_backup_file() -> Result<String, String> {
    create_hermes_bundle("backup").await
}

#[tauri::command]
async fn restore_hermes_backup_file(
    input: RestoreHermesBackupInput,
) -> Result<HermesRestoreResult, String> {
    let mut source_label = "本地上传内容".to_string();
    let raw = if let Some(content) = input.content {
        if content.trim().is_empty() {
            return Err("导入内容为空".to_string());
        }
        content
    } else if let Some(path_str) = input.path.as_deref() {
        source_label = path_str.to_string();
        let path = PathBuf::from(path_str.trim());
        if !path.exists() {
            return Err(format!("备份文件不存在：{}", path.to_string_lossy()));
        }
        fs::read_to_string(&path)
            .map_err(|error| format!("读取 {} 失败：{error}", path.to_string_lossy()))?
    } else {
        return Err("未提供备份文件路径或内容".to_string());
    };
    let payload: HermesDumpArtifact =
        serde_json::from_str(&raw).map_err(|error| format!("解析备份文件失败：{error}"))?;
    if payload.kind != "backup" && payload.kind != "debug" {
        return Err("当前文件不是可识别的 Hermes 备份文件。".to_string());
    }
    let overwrite = input.overwrite.unwrap_or(true);
    let allowed_profiles: std::collections::HashSet<String> =
        payload.profiles.into_iter().collect();
    let mut restored = 0usize;
    let mut skipped = 0usize;
    let mut warnings = Vec::new();

    for artifact in payload.files {
        let target = match artifact.key.as_str() {
            "hermes-team/state.json" => Some(app_state_path()?),
            "hermes-team/sessions.json" => Some(app_sessions_path()?),
            "hermes-team/connection.json" => Some(app_connection_path()?),
            "hermes/config.yaml" => Some(profile_home(None)?.join("config.yaml")),
            "hermes/.env" => Some(profile_home(None)?.join(".env")),
            _ => {
                if let Some(remainder) = artifact.key.strip_prefix("hermes/profiles/") {
                    let mut parts = remainder.splitn(2, '/');
                    let profile = parts.next().unwrap_or_default();
                    let file = parts.next().unwrap_or_default();
                    if !allowed_profiles.contains(profile) {
                        skipped += 1;
                        warnings.push(format!(
                            "文件 {key} 的 profile 不在备份索引中，已跳过。",
                            key = artifact.key
                        ));
                        continue;
                    }
                    let root = profile_home(Some(profile))?;
                    Some(match file {
                        "config.yaml" => root.join("config.yaml"),
                        ".env" => root.join(".env"),
                        _ => {
                            skipped += 1;
                            warnings.push(format!("不支持恢复的文件项：{}", artifact.key));
                            continue;
                        }
                    })
                } else {
                    skipped += 1;
                    warnings.push(format!("不识别的备份文件项：{}", artifact.key));
                    continue;
                }
            }
        };

        let Some(target) = target else {
            skipped += 1;
            warnings.push(format!("无法解析目标路径：{}", artifact.key));
            continue;
        };

        let Some(content) = artifact.content else {
            skipped += 1;
            warnings.push(format!("{} 未包含内容，跳过恢复。", artifact.key));
            continue;
        };

        if target.exists() && !overwrite {
            skipped += 1;
            continue;
        }
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("创建 {} 失败：{error}", parent.to_string_lossy()))?;
        }
        fs::write(&target, content)
            .map_err(|error| format!("恢复 {} 失败：{error}", target.to_string_lossy()))?;
        restored += 1;
    }

    if !payload.active_profile.trim().is_empty() {
        let active = payload.active_profile;
        if active == "default" {
            let _ = fs::remove_file(hermes_home()?.join("active_profile"));
        } else {
            let home = hermes_home()?;
            fs::create_dir_all(&home)
                .map_err(|error| format!("创建 {} 失败：{}", home.to_string_lossy(), error))?;
            fs::write(home.join("active_profile"), format!("{active}\n"))
                .map_err(|error| format!("写入 active_profile 失败：{error}"))?;
        }
    }

    Ok(HermesRestoreResult {
        target_path: source_label,
        restored,
        skipped,
        warnings,
        ok: true,
    })
}

#[tauri::command]
async fn get_remote_connection_config() -> Result<RemoteConnectionConfig, String> {
    read_connection_config()
}

#[tauri::command]
async fn save_remote_connection_config(
    config: RemoteConnectionConfig,
) -> Result<RemoteConnectionConfig, String> {
    validate_connection_config(&config)?;
    write_connection_config(&config)?;
    Ok(config)
}

#[tauri::command]
async fn get_remote_connection_status() -> Result<RemoteConnectionStatus, String> {
    let config = read_connection_config()?;
    let endpoint = resolve_connection_endpoint(None, None)?;
    Ok(RemoteConnectionStatus {
        mode: config.mode,
        base_url: endpoint.base_url,
        ssh_tunnel_active: is_ssh_tunnel_active(),
        ok: true,
        message: endpoint.message,
    })
}

async fn create_hermes_bundle(kind: &str) -> Result<String, String> {
    let output_dir = app_home()?.join(if kind == "debug" { "dumps" } else { "backups" });
    fs::create_dir_all(&output_dir)
        .map_err(|error| format!("创建 {} 失败：{error}", output_dir.to_string_lossy()))?;

    let active_profile = active_profile_name();
    let profiles = list_hermes_profiles().await.unwrap_or_default();
    let profile_names: Vec<String> = profiles.into_iter().map(|item| item.name).collect();

    let install_status = inspect_hermes_install()
        .await
        .unwrap_or_else(|_| HermesInstallStatus {
            installed: false,
            command: None,
            version: Some("inspect 失败".to_string()),
            hermes_home: hermes_home()
                .map(|path| path.to_string_lossy().to_string())
                .unwrap_or_else(|_| String::new()),
            active_profile: active_profile.clone(),
            config_exists: false,
            env_exists: false,
            api_server_key_present: false,
            api_server_configured: false,
            gateway_running: false,
            gateway_health: "unknown".to_string(),
        });
    let connection = read_connection_config()?;
    let connection_status =
        get_remote_connection_status()
            .await
            .unwrap_or(RemoteConnectionStatus {
                mode: connection.mode.clone(),
                base_url: resolve_gateway_url(None)?,
                ssh_tunnel_active: false,
                ok: false,
                message: "connection status 获取失败".to_string(),
            });
    let gateway_probe = probe_hermes_gateway(None, Some(active_profile.clone()))
        .await
        .unwrap_or_else(|error| GatewayProbeResult {
            ok: false,
            base_url: connection_status.base_url.clone(),
            profile: active_profile.clone(),
            message: error.to_string(),
            capabilities: None,
        });
    let logs = list_hermes_logs().await.unwrap_or_default();

    let mut files = Vec::new();
    let redact_sensitive = kind == "debug";
    append_file_artifact(
        &mut files,
        "hermes-team/state.json",
        &app_state_path()?,
        false,
        4,
    )?;
    append_file_artifact(
        &mut files,
        "hermes-team/sessions.json",
        &app_sessions_path()?,
        false,
        4,
    )?;
    append_file_artifact(
        &mut files,
        "hermes-team/connection.json",
        &app_connection_path()?,
        redact_sensitive,
        4,
    )?;
    append_file_artifact(
        &mut files,
        "hermes/config.yaml",
        &profile_home(None)?.join("config.yaml"),
        redact_sensitive,
        4,
    )?;
    append_file_artifact(
        &mut files,
        "hermes/.env",
        &profile_home(None)?.join(".env"),
        redact_sensitive,
        4,
    )?;
    for profile in &profile_names {
        let profile_root = profile_home(Some(profile))?;
        append_file_artifact(
            &mut files,
            &format!("hermes/profiles/{profile}/config.yaml"),
            &profile_root.join("config.yaml"),
            redact_sensitive,
            4,
        )?;
        append_file_artifact(
            &mut files,
            &format!("hermes/profiles/{profile}/.env"),
            &profile_root.join(".env"),
            redact_sensitive,
            4,
        )?;
    }

    let payload = HermesDumpArtifact {
        generated_at: unix_millis(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        kind: kind.to_string(),
        app_home: app_home()?.to_string_lossy().to_string(),
        hermes_home: hermes_home()?.to_string_lossy().to_string(),
        active_profile: active_profile.clone(),
        install_status,
        profiles: profile_names,
        connection,
        connection_status,
        gateway_probe,
        logs,
        files,
    };
    let output = serde_json::to_string_pretty(&payload)
        .map_err(|error| format!("序列化 Hermes 诊断信息失败：{error}"))?;
    let file = output_dir.join(format!(
        "hermes-team-{}-{active_profile}-{}.json",
        kind,
        unix_millis()
    ));
    fs::write(&file, output)
        .map_err(|error| format!("写入 {} 失败：{error}", file.to_string_lossy()))?;
    Ok(file.to_string_lossy().to_string())
}

fn append_file_artifact(
    files: &mut Vec<HermesFileArtifact>,
    key: &str,
    path: &PathBuf,
    redact: bool,
    max_kb: usize,
) -> Result<(), String> {
    if !path.exists() {
        files.push(HermesFileArtifact {
            key: key.to_string(),
            path: path.to_string_lossy().to_string(),
            exists: false,
            size_bytes: 0,
            redacted: redact,
            content: None,
        });
        return Ok(());
    }

    let metadata = fs::metadata(path)
        .map_err(|error| format!("读取 {} 元数据失败：{error}", path.to_string_lossy()))?;
    let mut content = fs::read_to_string(path)
        .map_err(|error| format!("读取 {} 失败：{error}", path.to_string_lossy()))?;
    if redact {
        content = redact_sensitive_text(&content);
    }
    let max_len = max_kb.saturating_mul(1024);
    if content.len() > max_len {
        let bytes = content.as_bytes();
        let cutoff = bytes.len().saturating_sub(max_len);
        content = String::from_utf8_lossy(&bytes[cutoff..]).to_string();
    }

    files.push(HermesFileArtifact {
        key: key.to_string(),
        path: path.to_string_lossy().to_string(),
        exists: true,
        size_bytes: metadata.len(),
        redacted: redact,
        content: Some(content),
    });
    Ok(())
}

fn redact_sensitive_text(content: &str) -> String {
    let mut output = Vec::with_capacity(content.lines().count());
    for line in content.lines() {
        let trimmed = line.trim_start();
        let has_indent = line.len().saturating_sub(trimmed.len());
        let indent = &line[..has_indent];
        let marker = trimmed.find(|ch| ['=', ':'].contains(&ch));
        if let Some(index) = marker {
            let key = trimmed[..index].trim().trim_end_matches(':').trim();
            if is_sensitive_key(key) {
                let sep = trimmed.as_bytes()[index];
                let pair = if sep == b'=' {
                    format!("{indent}{key}=***REDACTED***")
                } else {
                    format!("{indent}{key}: ***REDACTED***")
                };
                output.push(pair);
                continue;
            }
        }
        output.push(line.to_string());
    }
    output.join("\n")
}

fn is_sensitive_key(key: &str) -> bool {
    let value = key.to_ascii_lowercase();
    [
        "api_server_key",
        "api_key",
        "token",
        "access_token",
        "secret_key",
        "secret",
        "password",
        "credential",
    ]
    .into_iter()
    .any(|pattern| value.contains(pattern) || value.ends_with("_key"))
}

#[tauri::command]
async fn test_remote_connection(
    config: RemoteConnectionConfig,
) -> Result<RemoteConnectionStatus, String> {
    validate_connection_config(&config)?;
    let base_url = match config.mode.as_str() {
        "local" => "http://127.0.0.1:8642".to_string(),
        "remote" => normalize_base_url(Some(&config.remote_url)),
        "ssh" => {
            start_ssh_tunnel_for_config(&config.ssh, optional_api_key(&config.api_key).as_deref())?
        }
        other => return Err(format!("未知连接模式：{other}")),
    };
    let auth = if config.api_key.trim().is_empty() {
        None
    } else {
        Some(config.api_key.trim().to_string())
    };
    let ready = gateway_is_ready(&base_url, auth.as_deref());
    Ok(RemoteConnectionStatus {
        mode: config.mode,
        base_url,
        ssh_tunnel_active: is_ssh_tunnel_active(),
        ok: ready,
        message: if ready {
            "Hermes Gateway 可用。".to_string()
        } else {
            "无法连接 Hermes Gateway，请检查 URL/API key 或 SSH 隧道。".to_string()
        },
    })
}

#[tauri::command]
async fn start_ssh_tunnel(
    config: RemoteConnectionConfig,
) -> Result<RemoteConnectionStatus, String> {
    validate_connection_config(&config)?;
    let mut next = config.clone();
    next.mode = "ssh".to_string();
    let base_url =
        start_ssh_tunnel_for_config(&next.ssh, optional_api_key(&next.api_key).as_deref())?;
    write_connection_config(&next)?;
    let auth = if next.api_key.trim().is_empty() {
        None
    } else {
        Some(next.api_key.trim().to_string())
    };
    let ready = gateway_is_ready(&base_url, auth.as_deref());
    Ok(RemoteConnectionStatus {
        mode: "ssh".to_string(),
        base_url,
        ssh_tunnel_active: is_ssh_tunnel_active(),
        ok: ready,
        message: if ready {
            "SSH 隧道已连接，Hermes Gateway 可用。".to_string()
        } else {
            "SSH 隧道已启动，但 Gateway 健康检查未通过。".to_string()
        },
    })
}

#[tauri::command]
async fn stop_ssh_tunnel() -> Result<RemoteConnectionStatus, String> {
    stop_ssh_tunnel_process();
    let config = read_connection_config()?;
    Ok(RemoteConnectionStatus {
        mode: config.mode,
        base_url: String::new(),
        ssh_tunnel_active: false,
        ok: true,
        message: "SSH 隧道已停止。".to_string(),
    })
}

#[tauri::command]
async fn generate_api_server_key(profile: Option<String>) -> Result<ApiServerKeyResult, String> {
    let profile = normalize_profile(profile.as_deref());
    let profile_name = profile.clone().unwrap_or_else(|| "default".to_string());
    if read_api_server_key(profile.as_deref())?.is_some() {
        return Ok(ApiServerKeyResult {
            ok: true,
            profile: profile_name,
            message: "当前 profile 已存在 API_SERVER_KEY，未覆盖。".to_string(),
        });
    }

    let key = format!("ht_{}", random_hex(32)?);
    upsert_env_value(profile.as_deref(), "API_SERVER_KEY", &key)?;
    Ok(ApiServerKeyResult {
        ok: true,
        profile: profile_name,
        message: "已写入 API_SERVER_KEY，请启动或重启 Hermes Gateway。".to_string(),
    })
}

#[tauri::command]
async fn ensure_hermes_gateway(
    profile: Option<String>,
    replace: Option<bool>,
) -> Result<EnsureGatewayResult, String> {
    let profile = normalize_profile(profile.as_deref());
    let profile_name = profile.clone().unwrap_or_else(|| "default".to_string());
    let base = resolve_gateway_url(profile.as_deref())?;
    ensure_api_server_config(profile.as_deref(), gateway_port_from_base_url(&base))?;
    let auth = read_api_server_key(profile.as_deref())?;
    let replace = replace.unwrap_or(false);

    if !replace && gateway_is_ready(&base, auth.as_deref()) {
        return Ok(EnsureGatewayResult {
            ok: true,
            profile: profile_name,
            base_url: base,
            message: "Hermes Gateway 已在运行。".to_string(),
            log_path: None,
        });
    }

    let hermes = find_hermes_command()?;
    let log_path = gateway_log_path(profile.as_deref())?;
    if let Some(parent) = log_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("创建 {} 失败：{error}", parent.to_string_lossy()))?;
    }
    let stdout = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .map_err(|error| format!("打开 {} 失败：{error}", log_path.to_string_lossy()))?;
    let stderr = stdout
        .try_clone()
        .map_err(|error| format!("复制 gateway 日志句柄失败：{error}"))?;

    let mut command = Command::new(&hermes);
    if let Some(name) = profile.as_deref() {
        command.arg("--profile").arg(name);
    }
    command
        .arg("gateway")
        .arg("--accept-hooks")
        .arg("run")
        .arg("--replace")
        .env("HERMES_HOME", hermes_home()?.to_string_lossy().to_string())
        .env("HOME", home_dir()?)
        .env("API_SERVER_ENABLED", "true")
        .env(
            "API_SERVER_PORT",
            gateway_port_from_base_url(&base).to_string(),
        )
        .env("HERMES_ACCEPT_HOOKS", "1")
        .env("PATH", enhanced_path())
        .stdout(Stdio::from(stdout))
        .stderr(Stdio::from(stderr))
        .stdin(Stdio::null());
    if let Some(key) = auth.as_deref() {
        command.env("API_SERVER_KEY", key);
    }

    command
        .spawn()
        .map_err(|error| format!("启动 Hermes Gateway 失败：{error}"))?;

    for _ in 0..720 {
        if gateway_is_ready(&base, auth.as_deref()) {
            return Ok(EnsureGatewayResult {
                ok: true,
                profile: profile_name,
                base_url: base,
                message: "Hermes Gateway 已启动。".to_string(),
                log_path: Some(log_path.to_string_lossy().to_string()),
            });
        }
        sleep(Duration::from_millis(250));
    }

    Ok(EnsureGatewayResult {
        ok: false,
        profile: profile_name,
        base_url: base,
        message: "已尝试启动 Hermes Gateway，但 API server 仍在初始化或未通过健康检查。请稍后刷新 Runtime，或查看日志。".to_string(),
        log_path: Some(log_path.to_string_lossy().to_string()),
    })
}

#[tauri::command]
async fn stop_hermes_gateway(profile: Option<String>) -> Result<EnsureGatewayResult, String> {
    let profile = normalize_profile(profile.as_deref());
    let profile_name = profile.clone().unwrap_or_else(|| "default".to_string());
    let base = resolve_gateway_url(profile.as_deref())?;
    let hermes = find_hermes_command()?;
    let mut command = Command::new(&hermes);
    if let Some(name) = profile.as_deref() {
        command.arg("--profile").arg(name);
    }
    let output = command
        .arg("gateway")
        .arg("stop")
        .env("HERMES_HOME", hermes_home()?.to_string_lossy().to_string())
        .env("HOME", home_dir()?)
        .env("PATH", enhanced_path())
        .output()
        .map_err(|error| format!("停止 Hermes Gateway 失败：{error}"))?;
    let mut message = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if message.is_empty() {
        message = stderr;
    }
    if message.is_empty() {
        message = if output.status.success() {
            "Hermes Gateway 已停止。".to_string()
        } else {
            "Hermes Gateway 停止命令执行失败。".to_string()
        };
    }
    Ok(EnsureGatewayResult {
        ok: output.status.success(),
        profile: profile_name,
        base_url: base,
        message,
        log_path: None,
    })
}

#[tauri::command]
async fn probe_hermes_gateway(
    base_url: Option<String>,
    profile: Option<String>,
) -> Result<GatewayProbeResult, String> {
    let profile = normalize_profile(profile.as_deref());
    let base = match base_url.as_deref() {
        Some(value) if !value.trim().is_empty() => normalize_base_url(Some(value)),
        _ => resolve_gateway_url(profile.as_deref())?,
    };
    let auth = read_api_server_key(profile.as_deref())?;
    let response = http_request(&base, "GET", "/v1/capabilities", None, auth.as_deref())
        .map_err(|error| format!("无法连接 Hermes Gateway：{error}"))?;

    if !(200..300).contains(&response.status) {
        return Ok(GatewayProbeResult {
            ok: false,
            base_url: base,
            profile: profile.clone().unwrap_or_else(|| "default".to_string()),
            message: format!(
                "Hermes Gateway 返回 HTTP {}：{}",
                response.status,
                truncate(&response.body, 200)
            ),
            capabilities: None,
        });
    }

    let capabilities = serde_json::from_str::<serde_json::Value>(&response.body).ok();
    Ok(GatewayProbeResult {
        ok: true,
        base_url: base,
        profile: profile.unwrap_or_else(|| "default".to_string()),
        message: "Hermes Gateway 可用".to_string(),
        capabilities,
    })
}

#[tauri::command]
async fn run_hermes_agent(input: RunHermesAgentInput) -> Result<RunHermesAgentOutput, String> {
    let task_id = input.task_id.clone();
    if is_task_cancelled(task_id.as_deref()) {
        return Err("任务已取消。".to_string());
    }
    let endpoint =
        resolve_connection_endpoint(input.profile.as_deref(), input.base_url.as_deref())?;
    let mut messages = vec![json!({
        "role": "system",
        "content": input.system_prompt,
    })];
    if let Some(message) = context_folder_system_message(input.context_folder.as_deref()) {
        messages.push(message);
    }
    for item in input.history {
        let role = if item.role == "assistant" {
            "assistant"
        } else {
            "user"
        };
        messages.push(json!({
            "role": role,
            "content": item.content,
        }));
    }
    messages.push(json!({
        "role": "user",
        "content": build_user_message_content(&input.agent_name, &input.instruction, &input.attachments)?,
    }));

    let mut body = json!({
        "model": input.model.unwrap_or_else(|| "hermes-agent".to_string()),
        "messages": messages,
        "stream": false,
    });
    if let Some(reasoning_effort) = reasoning_effort_for_profile(input.profile.as_deref())? {
        if let Some(body_obj) = body.as_object_mut() {
            body_obj.insert("reasoning_effort".to_string(), json!(reasoning_effort));
        }
    }

    let response = http_request_with_cancel(
        &endpoint.base_url,
        "POST",
        "/v1/chat/completions",
        Some(&body.to_string()),
        endpoint.auth.as_deref(),
        task_id.as_deref(),
    )
    .map_err(|error| format!("Hermes Runtime 请求失败：{error}"))?;

    if is_task_cancelled(task_id.as_deref()) {
        return Err("任务已取消。".to_string());
    }

    if !(200..300).contains(&response.status) {
        return Err(format!(
            "Hermes Runtime 返回 HTTP {}：{}",
            response.status,
            truncate(&response.body, 500)
        ));
    }

    let value = serde_json::from_str::<serde_json::Value>(&response.body)
        .map_err(|error| format!("Hermes Runtime 返回非 JSON 响应：{error}"))?;
    let content = value
        .pointer("/choices/0/message/content")
        .and_then(|item| item.as_str())
        .or_else(|| {
            value
                .pointer("/choices/0/text")
                .and_then(|item| item.as_str())
        })
        .unwrap_or("")
        .trim()
        .to_string();

    if content.is_empty() {
        return Err(format!(
            "Hermes Runtime 响应中没有可显示内容：{}",
            truncate(&response.body, 500)
        ));
    }

    Ok(RunHermesAgentOutput { content })
}

#[tauri::command]
async fn run_hermes_agent_stream(
    app: AppHandle,
    input: RunHermesAgentInput,
) -> Result<RunHermesAgentOutput, String> {
    let task_id = input
        .task_id
        .clone()
        .unwrap_or_else(|| "unknown".to_string());
    if is_task_cancelled(Some(&task_id)) {
        return Err("任务已取消。".to_string());
    }
    let endpoint =
        resolve_connection_endpoint(input.profile.as_deref(), input.base_url.as_deref())?;
    let mut messages = vec![json!({
        "role": "system",
        "content": input.system_prompt,
    })];
    if let Some(message) = context_folder_system_message(input.context_folder.as_deref()) {
        messages.push(message);
    }
    for item in input.history {
        let role = if item.role == "assistant" {
            "assistant"
        } else {
            "user"
        };
        messages.push(json!({
            "role": role,
            "content": item.content,
        }));
    }
    messages.push(json!({
        "role": "user",
        "content": build_user_message_content(&input.agent_name, &input.instruction, &input.attachments)?,
    }));

    let mut body = json!({
        "model": input.model.unwrap_or_else(|| "hermes-agent".to_string()),
        "messages": messages,
        "stream": true,
    });
    if let Some(reasoning_effort) = reasoning_effort_for_profile(input.profile.as_deref())? {
        if let Some(body_obj) = body.as_object_mut() {
            body_obj.insert("reasoning_effort".to_string(), json!(reasoning_effort));
        }
    }

    emit_stream_event(
        &app,
        RuntimeStreamEvent {
            task_id: task_id.clone(),
            kind: "start".to_string(),
            delta: String::new(),
            content: String::new(),
            message: "Hermes stream started".to_string(),
        },
    )?;
    match http_stream_chat_completion(
        &app,
        &task_id,
        &endpoint.base_url,
        Some(&body.to_string()),
        endpoint.auth.as_deref(),
    ) {
        Ok(content) => {
            emit_stream_event(
                &app,
                RuntimeStreamEvent {
                    task_id,
                    kind: "done".to_string(),
                    delta: String::new(),
                    content: content.clone(),
                    message: "Hermes stream completed".to_string(),
                },
            )?;
            if content.trim().is_empty() {
                Err("Hermes Runtime 流式响应中没有可显示内容。".to_string())
            } else {
                Ok(RunHermesAgentOutput { content })
            }
        }
        Err(error) => {
            let _ = emit_stream_event(
                &app,
                RuntimeStreamEvent {
                    task_id,
                    kind: "error".to_string(),
                    delta: String::new(),
                    content: String::new(),
                    message: error.clone(),
                },
            );
            Err(error)
        }
    }
}

#[tauri::command]
async fn cancel_hermes_task(task_id: String) -> Result<bool, String> {
    let id = task_id.trim();
    if id.is_empty() {
        return Err("缺少 taskId。".to_string());
    }
    cancelled_tasks()
        .lock()
        .map_err(|_| "取消任务状态锁已损坏。".to_string())?
        .insert(id.to_string());
    Ok(true)
}

fn cancelled_tasks() -> &'static Mutex<HashSet<String>> {
    CANCELLED_TASKS.get_or_init(|| Mutex::new(HashSet::new()))
}

fn is_task_cancelled(task_id: Option<&str>) -> bool {
    let Some(id) = task_id.map(str::trim).filter(|value| !value.is_empty()) else {
        return false;
    };
    cancelled_tasks()
        .lock()
        .map(|tasks| tasks.contains(id))
        .unwrap_or(false)
}

fn build_user_message_content(
    agent_name: &str,
    instruction: &str,
    attachments: &[RuntimeAttachment],
) -> Result<serde_json::Value, String> {
    let attachment_context = read_attachment_context(attachments)?;
    let text = if attachment_context.is_empty() {
        format!("请以 {agent_name} 的身份完成任务：\n{instruction}")
    } else {
        format!(
            "请以 {agent_name} 的身份完成任务：\n{instruction}\n\n附件内容：\n{attachment_context}"
        )
    };
    let image_urls: Vec<&str> = attachments
        .iter()
        .filter(|attachment| attachment.kind.as_deref() == Some("image"))
        .filter_map(|attachment| attachment.data_url.as_deref())
        .map(str::trim)
        .filter(|value| value.starts_with("data:image/"))
        .collect();
    if image_urls.is_empty() {
        return Ok(json!(text));
    }

    let mut parts = vec![json!({
        "type": "text",
        "text": text,
    })];
    for url in image_urls {
        parts.push(json!({
            "type": "image_url",
            "image_url": {
                "url": url,
            },
        }));
    }
    Ok(json!(parts))
}

fn read_attachment_context(attachments: &[RuntimeAttachment]) -> Result<String, String> {
    if attachments.is_empty() {
        return Ok(String::new());
    }
    let mut sections = Vec::new();
    for attachment in attachments.iter().take(8) {
        let title = attachment
            .name
            .as_deref()
            .filter(|value| !value.trim().is_empty())
            .or(attachment.path.as_deref())
            .unwrap_or("attachment");
        let kind = attachment.kind.as_deref().unwrap_or("path-ref");
        if kind == "text-file" {
            let content = attachment.text.as_deref().unwrap_or("");
            sections.push(format!(
                "## {title}\n类型：text-file\nMIME：{}\n大小：{} bytes\n内容：\n{}",
                attachment.mime.as_deref().unwrap_or("text/plain"),
                attachment.size.unwrap_or(content.len() as u64),
                truncate(content, 12000)
            ));
            continue;
        }
        if kind == "image" {
            let data_url = attachment.data_url.as_deref().unwrap_or("");
            let original = attachment
                .original_size
                .map(|value| format!("\n原始大小：{value} bytes"))
                .unwrap_or_default();
            let status = if data_url.trim().starts_with("data:image/") {
                "图片已作为 image_url 视觉 payload 随消息附加。".to_string()
            } else {
                format!(
                    "图片缺少有效 data URL；无法作为视觉 payload 附加。data URL 前缀：{}",
                    truncate(data_url, 180)
                )
            };
            sections.push(format!(
                "## {title}\n类型：image\nMIME：{}\n大小：{} bytes{original}\n状态：{status}",
                attachment.mime.as_deref().unwrap_or("image/*"),
                attachment.size.unwrap_or(0),
            ));
            continue;
        }
        let Some(raw_path) = attachment
            .path
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        else {
            sections.push(format!(
                "## {title}\n类型：{kind}\n状态：附件缺少可读取路径"
            ));
            continue;
        };
        let path = PathBuf::from(raw_path);
        let title = attachment
            .name
            .as_deref()
            .filter(|value| !value.trim().is_empty())
            .or_else(|| path.file_name().and_then(|value| value.to_str()))
            .unwrap_or("attachment");
        if !path.exists() {
            sections.push(format!(
                "## {title}\n路径：{}\n状态：文件不存在",
                path.to_string_lossy()
            ));
            continue;
        }
        if !path.is_file() {
            sections.push(format!(
                "## {title}\n路径：{}\n状态：不是普通文件",
                path.to_string_lossy()
            ));
            continue;
        }
        let metadata = fs::metadata(&path)
            .map_err(|error| format!("读取附件元数据 {} 失败：{error}", path.to_string_lossy()))?;
        if metadata.len() > 256 * 1024 {
            sections.push(format!(
                "## {title}\n路径：{}\n大小：{} bytes\n状态：文件过大，未内联内容",
                path.to_string_lossy(),
                metadata.len()
            ));
            continue;
        }
        match fs::read_to_string(&path) {
            Ok(content) => sections.push(format!(
                "## {title}\n路径：{}\n内容：\n{}",
                path.to_string_lossy(),
                truncate(&content, 12000)
            )),
            Err(error) => sections.push(format!(
                "## {title}\n路径：{}\n状态：无法作为文本读取：{error}",
                path.to_string_lossy()
            )),
        }
    }
    Ok(sections.join("\n\n"))
}

fn selected_path_info(path: PathBuf) -> Result<SelectedPathInfo, String> {
    let metadata = fs::metadata(&path)
        .map_err(|error| format!("读取路径元数据 {} 失败：{error}", path.to_string_lossy()))?;
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .map(str::to_string)
        .unwrap_or_else(|| path.to_string_lossy().to_string());
    Ok(SelectedPathInfo {
        path: path.to_string_lossy().to_string(),
        name,
        is_file: metadata.is_file(),
        is_dir: metadata.is_dir(),
        size_bytes: metadata.is_file().then_some(metadata.len()),
    })
}

fn directory_entry_info(path: PathBuf) -> Result<DirectoryEntryInfo, String> {
    let metadata = fs::metadata(&path)
        .map_err(|error| format!("读取路径元数据 {} 失败：{error}", path.to_string_lossy()))?;
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .map(str::to_string)
        .unwrap_or_else(|| path.to_string_lossy().to_string());
    Ok(DirectoryEntryInfo {
        name,
        path: path.to_string_lossy().to_string(),
        is_file: metadata.is_file(),
        is_dir: metadata.is_dir(),
        size_bytes: metadata.is_file().then_some(metadata.len()),
    })
}

fn sanitize_filename(value: &str) -> String {
    let cleaned = value
        .chars()
        .map(|ch| match ch {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            ch if ch.is_control() => '_',
            ch => ch,
        })
        .collect::<String>()
        .trim()
        .trim_matches('.')
        .to_string();
    if cleaned.is_empty() {
        "attachment".to_string()
    } else {
        cleaned.chars().take(120).collect()
    }
}

fn unique_staged_path(dir: &Path, filename: &str) -> PathBuf {
    let candidate = dir.join(filename);
    if !candidate.exists() {
        return candidate;
    }
    let path = Path::new(filename);
    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("attachment");
    let ext = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("");
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis())
        .unwrap_or(0);
    if ext.is_empty() {
        dir.join(format!("{stem}-{millis}"))
    } else {
        dir.join(format!("{stem}-{millis}.{ext}"))
    }
}

#[tauri::command]
fn read_directory(path: String) -> Result<Vec<DirectoryEntryInfo>, String> {
    let root = PathBuf::from(path.trim());
    if !root.exists() {
        return Err(format!("目录不存在：{}", root.to_string_lossy()));
    }
    if !root.is_dir() {
        return Err(format!("不是目录：{}", root.to_string_lossy()));
    }
    let mut entries = Vec::new();
    for entry in fs::read_dir(&root)
        .map_err(|error| format!("读取目录 {} 失败：{error}", root.to_string_lossy()))?
    {
        let entry = entry.map_err(|error| format!("读取目录项失败：{error}"))?;
        let file_name = entry.file_name().to_string_lossy().to_string();
        if file_name == ".DS_Store" {
            continue;
        }
        if let Ok(info) = directory_entry_info(entry.path()) {
            entries.push(info);
        }
        if entries.len() >= 500 {
            break;
        }
    }
    entries.sort_by(|left, right| {
        right
            .is_dir
            .cmp(&left.is_dir)
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });
    Ok(entries)
}

#[tauri::command]
fn read_file(path: String, max_bytes: Option<usize>) -> Result<FileReadResult, String> {
    let file_path = PathBuf::from(path.trim());
    if !file_path.exists() {
        return Err(format!("文件不存在：{}", file_path.to_string_lossy()));
    }
    if !file_path.is_file() {
        return Err(format!("不是文件：{}", file_path.to_string_lossy()));
    }
    let limit = max_bytes.unwrap_or(102_400).max(1);
    let bytes = fs::read(&file_path)
        .map_err(|error| format!("读取文件 {} 失败：{error}", file_path.to_string_lossy()))?;
    let truncated = bytes.len() > limit;
    let slice = if truncated { &bytes[..limit] } else { &bytes };
    let content = String::from_utf8_lossy(slice).to_string();
    Ok(FileReadResult { content, truncated })
}

#[tauri::command]
fn read_image_file(path: String) -> Result<String, String> {
    let file_path = PathBuf::from(path.trim());
    if !file_path.exists() {
        return Err(format!("文件不存在：{}", file_path.to_string_lossy()));
    }
    if !file_path.is_file() {
        return Err(format!("不是文件：{}", file_path.to_string_lossy()));
    }
    let bytes = fs::read(&file_path)
        .map_err(|error| format!("读取图片 {} 失败：{error}", file_path.to_string_lossy()))?;
    let ext = file_path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_lowercase();
    let mime = match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "bmp" => "image/bmp",
        "ico" => "image/x-icon",
        _ => "application/octet-stream",
    };
    use base64::Engine;
    let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
    Ok(format!("data:{mime};base64,{encoded}"))
}

#[tauri::command]
fn open_file_in_editor(path: String) -> Result<bool, String> {
    let file_path = PathBuf::from(path.trim());
    if !file_path.exists() {
        return Err(format!("文件不存在：{}", file_path.to_string_lossy()));
    }
    #[cfg(target_os = "macos")]
    {
        let status = Command::new("open")
            .arg(&file_path)
            .status()
            .map_err(|error| format!("打开文件失败：{error}"))?;
        return Ok(status.success());
    }
    #[cfg(target_os = "windows")]
    {
        let status = Command::new("cmd")
            .args(["/C", "start", ""])
            .arg(&file_path)
            .status()
            .map_err(|error| format!("打开文件失败：{error}"))?;
        return Ok(status.success());
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let status = Command::new("xdg-open")
            .arg(&file_path)
            .status()
            .map_err(|error| format!("打开文件失败：{error}"))?;
        return Ok(status.success());
    }
}

#[cfg(target_os = "macos")]
fn run_osascript(script: &str) -> Result<String, String> {
    let output = Command::new("osascript")
        .arg("-e")
        .arg(script)
        .output()
        .map_err(|error| format!("调用系统选择器失败：{error}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        if stderr.contains("User canceled") || stderr.contains("-128") {
            return Ok(String::new());
        }
        return Err(if stderr.is_empty() {
            "系统选择器返回失败。".to_string()
        } else {
            stderr
        });
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[tauri::command]
fn select_attachment_files() -> Result<Vec<SelectedPathInfo>, String> {
    #[cfg(target_os = "macos")]
    {
        let script = r#"
set chosenFiles to choose file with multiple selections allowed
set output to ""
repeat with itemPath in chosenFiles
  set output to output & POSIX path of itemPath & linefeed
end repeat
return output
"#;
        let output = run_osascript(script)?;
        let mut items = Vec::new();
        for line in output
            .lines()
            .map(str::trim)
            .filter(|line| !line.is_empty())
        {
            let path = PathBuf::from(line);
            if path.exists() {
                items.push(selected_path_info(path)?);
            }
        }
        return Ok(items);
    }
    #[allow(unreachable_code)]
    Err("当前平台暂未实现系统文件选择器。".to_string())
}

#[tauri::command]
fn select_context_folder() -> Result<Option<SelectedPathInfo>, String> {
    #[cfg(target_os = "macos")]
    {
        let script = r#"
set chosenFolder to choose folder
return POSIX path of chosenFolder
"#;
        let output = run_osascript(script)?;
        let path = output.trim();
        if path.is_empty() {
            return Ok(None);
        }
        let info = selected_path_info(PathBuf::from(path))?;
        if !info.is_dir {
            return Err("请选择文件夹。".to_string());
        }
        return Ok(Some(info));
    }
    #[allow(unreachable_code)]
    Err("当前平台暂未实现系统文件夹选择器。".to_string())
}

#[tauri::command]
fn stage_attachment_file(input: StageAttachmentInput) -> Result<SelectedPathInfo, String> {
    use base64::Engine;
    let filename = sanitize_filename(&input.filename);
    let session_id = input
        .session_id
        .as_deref()
        .map(sanitize_filename)
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "default".to_string());
    let target_dir = app_home()?.join("attachments").join(session_id);
    fs::create_dir_all(&target_dir).map_err(|error| {
        format!(
            "创建附件暂存目录 {} 失败：{error}",
            target_dir.to_string_lossy()
        )
    })?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(input.base64_bytes.trim())
        .map_err(|error| format!("解析附件 base64 失败：{error}"))?;
    let target = unique_staged_path(&target_dir, &filename);
    fs::write(&target, bytes)
        .map_err(|error| format!("写入暂存附件 {} 失败：{error}", target.to_string_lossy()))?;
    selected_path_info(target)
}

fn context_folder_system_message(context_folder: Option<&str>) -> Option<serde_json::Value> {
    let folder = context_folder
        .map(str::trim)
        .filter(|value| !value.is_empty())?;
    Some(json!({
        "role": "system",
        "content": format!(
            "The working folder for this conversation is {folder}. When the user asks you to read, create, modify, or run project files, use the file, terminal, and code-execution tools with absolute paths under this folder."
        ),
    }))
}

fn emit_stream_event(app: &AppHandle, event: RuntimeStreamEvent) -> Result<(), String> {
    app.emit("hermes-agent-stream", event)
        .map_err(|error| format!("发送 Hermes 流式事件失败：{error}"))
}

fn http_stream_chat_completion(
    app: &AppHandle,
    task_id: &str,
    base_url: &str,
    body: Option<&str>,
    bearer_token: Option<&str>,
) -> Result<String, String> {
    let target = parse_http_base(base_url)?;
    let request_path = format!("{}{}", target.path_prefix, "/v1/chat/completions");
    let body = body.unwrap_or("");
    let mut stream = TcpStream::connect((&*target.host, target.port))
        .map_err(|error| format!("连接 {}:{} 失败：{error}", target.host, target.port))?;
    stream
        .set_read_timeout(Some(Duration::from_secs(1)))
        .map_err(|error| format!("设置读取超时失败：{error}"))?;
    stream
        .set_write_timeout(Some(Duration::from_secs(30)))
        .map_err(|error| format!("设置写入超时失败：{error}"))?;

    let auth_header = bearer_token
        .filter(|value| !value.trim().is_empty())
        .map(|value| format!("Authorization: Bearer {}\r\n", value.trim()))
        .unwrap_or_default();
    let request = format!(
        "POST {request_path} HTTP/1.1\r\nHost: {host}\r\n{auth_header}Content-Type: application/json\r\nAccept: text/event-stream\r\nContent-Length: {length}\r\nConnection: close\r\n\r\n{body}",
        host = target.host_header,
        length = body.as_bytes().len(),
    );
    stream
        .write_all(request.as_bytes())
        .map_err(|error| format!("写入 HTTP 请求失败：{error}"))?;

    let mut raw = Vec::new();
    let mut headers: Option<String> = None;
    let mut status = 0_u16;
    let mut is_chunked = false;
    let mut pending_body = Vec::new();
    let mut plain_body = Vec::new();
    let mut sse_buffer = String::new();
    let mut full_content = String::new();
    let mut full_reasoning = String::new();
    let mut buffer = [0_u8; 8192];

    loop {
        if is_task_cancelled(Some(task_id)) {
            return Err("任务已取消。".to_string());
        }
        match stream.read(&mut buffer) {
            Ok(0) => break,
            Ok(size) => {
                if headers.is_none() {
                    raw.extend_from_slice(&buffer[..size]);
                    if let Some(index) = find_header_end(&raw) {
                        let head = String::from_utf8_lossy(&raw[..index]).to_string();
                        status = parse_http_status(&head)?;
                        is_chunked = head.lines().any(|line| {
                            line.to_ascii_lowercase().starts_with("transfer-encoding:")
                                && line.to_ascii_lowercase().contains("chunked")
                        });
                        pending_body.extend_from_slice(&raw[index + 4..]);
                        headers = Some(head);
                    }
                } else {
                    pending_body.extend_from_slice(&buffer[..size]);
                }

                if headers.is_some() && (200..300).contains(&status) {
                    if is_chunked {
                        let done = drain_chunked_sse(
                            app,
                            task_id,
                            &mut pending_body,
                            &mut sse_buffer,
                            &mut full_content,
                            &mut full_reasoning,
                        )?;
                        if done {
                            return Ok(full_content);
                        }
                    } else {
                        plain_body.extend_from_slice(&pending_body);
                        pending_body.clear();
                    }
                }
            }
            Err(error) if matches!(error.kind(), ErrorKind::WouldBlock | ErrorKind::TimedOut) => {
                continue
            }
            Err(error) => return Err(format!("读取 HTTP 响应失败：{error}")),
        }
    }

    let Some(head) = headers else {
        return Err("Hermes Gateway 返回了无效 HTTP 响应".to_string());
    };
    if !(200..300).contains(&status) {
        let mut response_body = pending_body;
        response_body.extend_from_slice(&plain_body);
        let body = String::from_utf8_lossy(&response_body).to_string();
        return Err(format!(
            "Hermes Runtime 返回 HTTP {}：{}",
            status,
            truncate(&body, 500)
        ));
    }

    if is_chunked {
        let _ = drain_chunked_sse(
            app,
            task_id,
            &mut pending_body,
            &mut sse_buffer,
            &mut full_content,
            &mut full_reasoning,
        )?;
        return Ok(full_content);
    }

    let body = String::from_utf8_lossy(&plain_body).to_string();
    if head.to_ascii_lowercase().contains("text/event-stream") || body.contains("data:") {
        process_sse_text(
            app,
            task_id,
            &(body + "\n\n"),
            &mut sse_buffer,
            &mut full_content,
            &mut full_reasoning,
        )?;
        return Ok(full_content);
    }
    let content = parse_completion_content(&body)?;
    if !content.is_empty() {
        emit_stream_event(
            app,
            RuntimeStreamEvent {
                task_id: task_id.to_string(),
                kind: "delta".to_string(),
                delta: content.clone(),
                content: content.clone(),
                message: String::new(),
            },
        )?;
    }
    Ok(content)
}

fn find_header_end(raw: &[u8]) -> Option<usize> {
    raw.windows(4).position(|window| window == b"\r\n\r\n")
}

fn parse_http_status(headers: &str) -> Result<u16, String> {
    headers
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .and_then(|value| value.parse::<u16>().ok())
        .ok_or_else(|| "Hermes Gateway 响应缺少 HTTP 状态码".to_string())
}

fn drain_chunked_sse(
    app: &AppHandle,
    task_id: &str,
    pending: &mut Vec<u8>,
    sse_buffer: &mut String,
    full_content: &mut String,
    full_reasoning: &mut String,
) -> Result<bool, String> {
    loop {
        let Some(line_end) = pending.windows(2).position(|window| window == b"\r\n") else {
            return Ok(false);
        };
        let size_line = String::from_utf8_lossy(&pending[..line_end]).to_string();
        let size_hex = size_line.split(';').next().unwrap_or("").trim();
        let size = usize::from_str_radix(size_hex, 16)
            .map_err(|_| format!("Hermes Gateway 返回了无效 chunk 大小：{size_hex}"))?;
        let data_start = line_end + 2;
        if pending.len() < data_start + size + 2 {
            return Ok(false);
        }
        if size == 0 {
            pending.drain(..data_start + 2);
            return Ok(true);
        }
        let chunk = pending[data_start..data_start + size].to_vec();
        pending.drain(..data_start + size + 2);
        let text = String::from_utf8_lossy(&chunk).to_string();
        if process_sse_text(
            app,
            task_id,
            &text,
            sse_buffer,
            full_content,
            full_reasoning,
        )? {
            return Ok(true);
        }
    }
}

fn process_sse_text(
    app: &AppHandle,
    task_id: &str,
    text: &str,
    sse_buffer: &mut String,
    full_content: &mut String,
    full_reasoning: &mut String,
) -> Result<bool, String> {
    sse_buffer.push_str(&text.replace("\r\n", "\n"));
    while let Some(index) = sse_buffer.find("\n\n") {
        let event = sse_buffer[..index].to_string();
        *sse_buffer = sse_buffer[index + 2..].to_string();
        let data = event
            .lines()
            .filter_map(|line| line.strip_prefix("data:").map(str::trim))
            .collect::<Vec<_>>()
            .join("\n");
        if data.is_empty() {
            continue;
        }
        if data == "[DONE]" {
            return Ok(true);
        }
        let event_type = event
            .lines()
            .filter_map(|line| line.strip_prefix("event:").map(str::trim))
            .last()
            .unwrap_or("")
            .to_string();
        let delta = parse_stream_delta(&event_type, &data)?;
        if !delta.reasoning_delta.is_empty() {
            full_reasoning.push_str(&delta.reasoning_delta);
            emit_stream_event(
                app,
                RuntimeStreamEvent {
                    task_id: task_id.to_string(),
                    kind: "reasoning".to_string(),
                    delta: delta.reasoning_delta,
                    content: full_reasoning.clone(),
                    message: String::new(),
                },
            )?;
        }
        if let Some(tool_event) = delta.tool_event {
            emit_stream_event(
                app,
                RuntimeStreamEvent {
                    task_id: task_id.to_string(),
                    kind: "tool".to_string(),
                    delta: tool_event.status.clone(),
                    content: format_tool_event_content(&tool_event),
                    message: tool_event.call_id,
                },
            )?;
        }
        if !delta.message_delta.is_empty() {
            full_content.push_str(&delta.message_delta);
            emit_stream_event(
                app,
                RuntimeStreamEvent {
                    task_id: task_id.to_string(),
                    kind: "delta".to_string(),
                    delta: delta.message_delta,
                    content: full_content.clone(),
                    message: String::new(),
                },
            )?;
        }
    }
    Ok(false)
}

fn parse_stream_delta(event_type: &str, data: &str) -> Result<ParsedStreamDelta, String> {
    let value = serde_json::from_str::<serde_json::Value>(data)
        .map_err(|error| format!("Hermes Runtime 流式事件不是 JSON：{error}"))?;
    let message_delta = value
        .pointer("/choices/0/delta/content")
        .and_then(|item| item.as_str())
        .or_else(|| {
            value
                .pointer("/choices/0/message/content")
                .and_then(|item| item.as_str())
        })
        .or_else(|| {
            value
                .pointer("/choices/0/text")
                .and_then(|item| item.as_str())
        })
        .unwrap_or("")
        .to_string();
    let reasoning_delta = value
        .pointer("/choices/0/delta/reasoning_content")
        .and_then(|item| item.as_str())
        .or_else(|| {
            value
                .pointer("/choices/0/delta/reasoning")
                .and_then(|item| item.as_str())
        })
        .or_else(|| {
            if value.get("type").and_then(|item| item.as_str()) == Some("reasoning.delta") {
                value
                    .pointer("/payload/text")
                    .and_then(|item| item.as_str())
            } else {
                None
            }
        })
        .unwrap_or("")
        .to_string();
    let gateway_message_delta =
        if value.get("type").and_then(|item| item.as_str()) == Some("message.delta") {
            value
                .pointer("/payload/text")
                .and_then(|item| item.as_str())
                .unwrap_or("")
                .to_string()
        } else {
            String::new()
        };
    Ok(ParsedStreamDelta {
        message_delta: if message_delta.is_empty() {
            gateway_message_delta
        } else {
            message_delta
        },
        reasoning_delta,
        tool_event: parse_tool_stream_event(event_type, &value),
    })
}

fn parse_tool_stream_event(event_type: &str, value: &serde_json::Value) -> Option<ParsedToolEvent> {
    if event_type == "hermes.tool.progress" {
        return Some(tool_event_from_payload(event_type, value, "running"));
    }

    if let Some(tool_call) = first_tool_call(value) {
        let name = stream_json_string(tool_call.pointer("/function/name"))
            .or_else(|| stream_json_string(tool_call.get("name")))
            .unwrap_or_else(|| "tool".to_string());
        let preview = stream_json_string(tool_call.pointer("/function/arguments"))
            .or_else(|| stream_json_string(tool_call.get("arguments")))
            .unwrap_or_default();
        let call_id = stream_json_string(tool_call.get("id"))
            .unwrap_or_else(|| format!("openai:{name}:{preview}"));
        return Some(ParsedToolEvent {
            call_id,
            name,
            status: "running".to_string(),
            preview,
            result: String::new(),
        });
    }

    let event_name = stream_json_string(value.get("type"))
        .or_else(|| stream_json_string(value.get("event")))
        .unwrap_or_else(|| event_type.to_string());
    if !is_tool_event_name(&event_name) {
        return None;
    }
    let payload = value.get("payload").unwrap_or(value);
    let status = tool_event_status(&event_name);
    Some(tool_event_from_payload(&event_name, payload, &status))
}

fn first_tool_call(value: &serde_json::Value) -> Option<&serde_json::Value> {
    value
        .pointer("/choices/0/delta/tool_calls/0")
        .or_else(|| value.pointer("/choices/0/message/tool_calls/0"))
        .or_else(|| value.pointer("/tool_calls/0"))
}

fn is_tool_event_name(value: &str) -> bool {
    let name = value.to_ascii_lowercase();
    name.starts_with("tool.")
        || name.starts_with("tool_")
        || name.contains(".tool.")
        || name.contains("_tool_")
}

fn tool_event_status(event_name: &str) -> String {
    let name = event_name.to_ascii_lowercase();
    if name.contains("fail") || name.contains("error") {
        "failed".to_string()
    } else if name.contains("complete") || name.contains("done") || name.contains("result") {
        "completed".to_string()
    } else {
        "running".to_string()
    }
}

fn tool_event_from_payload(
    event_name: &str,
    payload: &serde_json::Value,
    fallback_status: &str,
) -> ParsedToolEvent {
    let name = stream_json_string(payload.get("tool"))
        .or_else(|| stream_json_string(payload.get("tool_name")))
        .or_else(|| stream_json_string(payload.get("name")))
        .or_else(|| stream_json_string(payload.pointer("/function/name")))
        .or_else(|| stream_json_string(payload.get("label")))
        .unwrap_or_else(|| "tool".to_string());
    let preview = stream_json_string(payload.get("preview"))
        .or_else(|| stream_json_string(payload.get("label")))
        .or_else(|| stream_json_string(payload.get("input")))
        .or_else(|| stream_json_string(payload.get("arguments")))
        .or_else(|| stream_json_string(payload.get("args")))
        .unwrap_or_default();
    let result = stream_json_string(payload.get("result_text"))
        .or_else(|| stream_json_string(payload.get("output")))
        .or_else(|| stream_json_string(payload.get("result")))
        .or_else(|| stream_json_string(payload.get("content")))
        .or_else(|| stream_json_string(payload.get("text")))
        .unwrap_or_default();
    let explicit_call_id = stream_json_string(payload.get("toolCallId"))
        .or_else(|| stream_json_string(payload.get("tool_call_id")))
        .or_else(|| stream_json_string(payload.get("tool_id")))
        .or_else(|| stream_json_string(payload.get("callId")))
        .or_else(|| stream_json_string(payload.get("id")));
    ParsedToolEvent {
        call_id: explicit_call_id.unwrap_or_else(|| format!("{event_name}:{name}:{preview}")),
        name,
        status: stream_json_string(payload.get("status"))
            .unwrap_or_else(|| fallback_status.to_string()),
        preview,
        result,
    }
}

fn stream_json_string(value: Option<&serde_json::Value>) -> Option<String> {
    let item = value?;
    if let Some(text) = item.as_str() {
        let trimmed = text.trim();
        return (!trimmed.is_empty()).then(|| trimmed.to_string());
    }
    if item.is_null() {
        return None;
    }
    if item.is_number() || item.is_boolean() {
        return Some(item.to_string());
    }
    Some(truncate(&item.to_string(), 2000))
}

fn format_tool_event_content(event: &ParsedToolEvent) -> String {
    let status = match event.status.as_str() {
        "completed" => "completed",
        "failed" => "failed",
        _ => "running",
    };
    let mut lines = vec![format!("{status} · {}", event.name)];
    if !event.preview.trim().is_empty() && event.preview.trim() != event.name {
        lines.push(event.preview.trim().to_string());
    }
    if !event.result.trim().is_empty() {
        lines.push(event.result.trim().to_string());
    }
    lines.join("\n")
}

fn parse_completion_content(body: &str) -> Result<String, String> {
    let value = serde_json::from_str::<serde_json::Value>(body)
        .map_err(|error| format!("Hermes Runtime 返回非 JSON 响应：{error}"))?;
    Ok(value
        .pointer("/choices/0/message/content")
        .and_then(|item| item.as_str())
        .or_else(|| {
            value
                .pointer("/choices/0/text")
                .and_then(|item| item.as_str())
        })
        .unwrap_or("")
        .trim()
        .to_string())
}

struct HttpResponse {
    status: u16,
    body: String,
}

fn http_request(
    base_url: &str,
    method: &str,
    path: &str,
    body: Option<&str>,
    bearer_token: Option<&str>,
) -> Result<HttpResponse, String> {
    http_request_with_cancel(base_url, method, path, body, bearer_token, None)
}

fn http_request_with_cancel(
    base_url: &str,
    method: &str,
    path: &str,
    body: Option<&str>,
    bearer_token: Option<&str>,
    task_id: Option<&str>,
) -> Result<HttpResponse, String> {
    if is_task_cancelled(task_id) {
        return Err("任务已取消。".to_string());
    }
    let target = parse_http_base(base_url)?;
    let request_path = format!("{}{}", target.path_prefix, path);
    let body = body.unwrap_or("");
    let mut stream = TcpStream::connect((&*target.host, target.port))
        .map_err(|error| format!("连接 {}:{} 失败：{error}", target.host, target.port))?;
    stream
        .set_read_timeout(Some(if task_id.is_some() {
            Duration::from_secs(1)
        } else {
            Duration::from_secs(180)
        }))
        .map_err(|error| format!("设置读取超时失败：{error}"))?;
    stream
        .set_write_timeout(Some(Duration::from_secs(30)))
        .map_err(|error| format!("设置写入超时失败：{error}"))?;

    let auth_header = bearer_token
        .filter(|value| !value.trim().is_empty())
        .map(|value| format!("Authorization: Bearer {}\r\n", value.trim()))
        .unwrap_or_default();
    let request = format!(
        "{method} {request_path} HTTP/1.1\r\nHost: {host}\r\n{auth_header}Content-Type: application/json\r\nContent-Length: {length}\r\nConnection: close\r\n\r\n{body}",
        host = target.host_header,
        length = body.as_bytes().len(),
    );
    stream
        .write_all(request.as_bytes())
        .map_err(|error| format!("写入 HTTP 请求失败：{error}"))?;

    let mut raw_bytes = Vec::new();
    let mut buffer = [0_u8; 8192];
    loop {
        if is_task_cancelled(task_id) {
            return Err("任务已取消。".to_string());
        }
        match stream.read(&mut buffer) {
            Ok(0) => break,
            Ok(size) => raw_bytes.extend_from_slice(&buffer[..size]),
            Err(error)
                if task_id.is_some()
                    && matches!(error.kind(), ErrorKind::WouldBlock | ErrorKind::TimedOut) =>
            {
                continue;
            }
            Err(error) => return Err(format!("读取 HTTP 响应失败：{error}")),
        }
    }
    let raw = String::from_utf8_lossy(&raw_bytes).to_string();

    let (head, response_body) = raw
        .split_once("\r\n\r\n")
        .ok_or_else(|| "Hermes Gateway 返回了无效 HTTP 响应".to_string())?;
    let status = head
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .and_then(|value| value.parse::<u16>().ok())
        .ok_or_else(|| "Hermes Gateway 响应缺少 HTTP 状态码".to_string())?;

    Ok(HttpResponse {
        status,
        body: decode_http_body(head, response_body)?,
    })
}

fn decode_http_body(headers: &str, body: &str) -> Result<String, String> {
    let is_chunked = headers.lines().any(|line| {
        line.to_ascii_lowercase().starts_with("transfer-encoding:")
            && line.to_ascii_lowercase().contains("chunked")
    });
    if !is_chunked {
        return Ok(body.to_string());
    }

    let mut rest = body;
    let mut decoded = String::new();
    loop {
        let (size_line, after_size) = rest
            .split_once("\r\n")
            .ok_or_else(|| "Hermes Gateway 返回了不完整的 chunked 响应".to_string())?;
        let size_hex = size_line.split(';').next().unwrap_or("").trim();
        let size = usize::from_str_radix(size_hex, 16)
            .map_err(|_| format!("Hermes Gateway 返回了无效 chunk 大小：{size_hex}"))?;
        if size == 0 {
            break;
        }
        if after_size.len() < size + 2 {
            return Err("Hermes Gateway chunked 响应体被截断".to_string());
        }
        decoded.push_str(&after_size[..size]);
        rest = &after_size[size + 2..];
    }
    Ok(decoded)
}

fn gateway_is_ready(base_url: &str, bearer_token: Option<&str>) -> bool {
    http_request(base_url, "GET", "/health", None, bearer_token)
        .map(|response| (200..300).contains(&response.status))
        .unwrap_or_else(|_| {
            http_request(base_url, "GET", "/v1/capabilities", None, bearer_token)
                .map(|response| (200..300).contains(&response.status))
                .unwrap_or(false)
        })
}

struct HttpTarget {
    host: String,
    host_header: String,
    port: u16,
    path_prefix: String,
}

fn parse_http_base(base_url: &str) -> Result<HttpTarget, String> {
    let without_scheme = base_url
        .strip_prefix("http://")
        .ok_or_else(|| "当前 Hermes Runtime Adapter 只支持本地 http:// Gateway".to_string())?;
    if without_scheme.starts_with("https://") {
        return Err("当前 Hermes Runtime Adapter 只支持本地 http:// Gateway".to_string());
    }
    let (host_port, path_prefix) = match without_scheme.split_once('/') {
        Some((host_port, path)) => (host_port, format!("/{}", path.trim_end_matches('/'))),
        None => (without_scheme, String::new()),
    };
    let (host, port) = match host_port.rsplit_once(':') {
        Some((host, port)) => (
            host.to_string(),
            port.parse::<u16>()
                .map_err(|_| format!("无效端口：{port}"))?,
        ),
        None => (host_port.to_string(), 80),
    };
    if host.is_empty() {
        return Err("Hermes Gateway host 不能为空".to_string());
    }
    Ok(HttpTarget {
        host,
        host_header: host_port.to_string(),
        port,
        path_prefix,
    })
}

fn normalize_base_url(raw: Option<&str>) -> String {
    let value = raw
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("http://127.0.0.1:8642");
    value
        .trim_end_matches('/')
        .strip_suffix("/v1")
        .unwrap_or_else(|| value.trim_end_matches('/'))
        .to_string()
}

fn hermes_home() -> Result<PathBuf, String> {
    if let Ok(value) = std::env::var("HERMES_HOME") {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            return Ok(PathBuf::from(trimmed));
        }
    }
    Ok(PathBuf::from(home_dir()?).join(".hermes"))
}

fn home_dir() -> Result<String, String> {
    std::env::var("HOME").map_err(|_| "无法读取 HOME 环境变量".to_string())
}

fn app_home() -> Result<PathBuf, String> {
    Ok(PathBuf::from(home_dir()?).join(".hermes-team"))
}

fn app_state_path() -> Result<PathBuf, String> {
    Ok(app_home()?.join("state.json"))
}

fn app_sessions_path() -> Result<PathBuf, String> {
    Ok(app_home()?.join("sessions.json"))
}

fn app_connection_path() -> Result<PathBuf, String> {
    Ok(app_home()?.join("connection.json"))
}

fn app_settings_path() -> Result<PathBuf, String> {
    Ok(app_home()?.join("settings.json"))
}

fn update_preferences_path() -> Result<PathBuf, String> {
    Ok(app_home()?.join("update-preferences.json"))
}

fn updater_log_path() -> Result<PathBuf, String> {
    Ok(app_home()?.join("logs").join("updater.log"))
}

fn hermes_log_dirs() -> Result<Vec<PathBuf>, String> {
    Ok(vec![app_home()?.join("logs"), hermes_home()?.join("logs")])
}

fn is_log_file(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|value| value.to_str()),
        Some("log") | Some("txt") | Some("out") | Some("err")
    )
}

fn modified_millis(metadata: &fs::Metadata) -> u64 {
    metadata
        .modified()
        .ok()
        .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn ensure_allowed_log_path(path: &Path) -> Result<(), String> {
    if !is_log_file(path) {
        return Err("只能读取 Hermes 日志文件。".to_string());
    }
    let canonical = path
        .canonicalize()
        .map_err(|error| format!("解析 {} 失败：{error}", path.to_string_lossy()))?;
    for dir in hermes_log_dirs()? {
        let Ok(canonical_dir) = dir.canonicalize() else {
            continue;
        };
        if canonical.starts_with(canonical_dir) {
            return Ok(());
        }
    }
    Err("日志路径不在 Hermes Team/Hermes 日志目录内。".to_string())
}

fn default_connection_config() -> RemoteConnectionConfig {
    RemoteConnectionConfig {
        mode: "local".to_string(),
        remote_url: "http://127.0.0.1:8642".to_string(),
        api_key: String::new(),
        ssh: SshConnectionConfig {
            host: String::new(),
            port: 22,
            username: String::new(),
            key_path: format!(
                "{}/.ssh/id_rsa",
                home_dir().unwrap_or_else(|_| "~".to_string())
            ),
            remote_port: 8642,
            local_port: 18642,
        },
    }
}

fn default_app_settings() -> AppSettings {
    AppSettings {
        theme: "light".to_string(),
        rounded_corners: true,
        font: "system".to_string(),
    }
}

fn normalize_app_settings(settings: AppSettings) -> AppSettings {
    let theme = match settings.theme.trim() {
        "light" | "dark" | "dracula" | "nord" | "one-dark" | "github-dark" | "github-light" => {
            settings.theme.trim().to_string()
        }
        _ => "light".to_string(),
    };
    let font = match settings.font.trim() {
        "system" | "serif" | "mono" => settings.font.trim().to_string(),
        _ => "system".to_string(),
    };
    AppSettings {
        theme,
        rounded_corners: settings.rounded_corners,
        font,
    }
}

fn read_app_settings() -> Result<AppSettings, String> {
    let path = app_settings_path()?;
    if !path.exists() {
        return Ok(default_app_settings());
    }
    let content = fs::read_to_string(&path)
        .map_err(|error| format!("读取 {} 失败：{error}", path.to_string_lossy()))?;
    let parsed = serde_json::from_str(&content)
        .map_err(|error| format!("解析 {} 失败：{error}", path.to_string_lossy()))?;
    Ok(normalize_app_settings(parsed))
}

fn write_app_settings(settings: &AppSettings) -> Result<(), String> {
    let path = app_settings_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("创建 {} 失败：{error}", parent.to_string_lossy()))?;
    }
    let body = serde_json::to_string_pretty(settings)
        .map_err(|error| format!("序列化应用设置失败：{error}"))?;
    fs::write(&path, body).map_err(|error| format!("写入 {} 失败：{error}", path.to_string_lossy()))
}

fn default_update_preferences() -> UpdatePreferences {
    UpdatePreferences { auto_upgrade: true }
}

fn read_update_preferences() -> Result<UpdatePreferences, String> {
    let path = update_preferences_path()?;
    if !path.exists() {
        return Ok(default_update_preferences());
    }
    let content = fs::read_to_string(&path)
        .map_err(|error| format!("读取 {} 失败：{error}", path.to_string_lossy()))?;
    serde_json::from_str(&content)
        .map_err(|error| format!("解析 {} 失败：{error}", path.to_string_lossy()))
}

fn write_update_preferences(preferences: &UpdatePreferences) -> Result<(), String> {
    let path = update_preferences_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("创建 {} 失败：{error}", parent.to_string_lossy()))?;
    }
    let body = serde_json::to_string_pretty(preferences)
        .map_err(|error| format!("序列化更新偏好失败：{error}"))?;
    fs::write(&path, body).map_err(|error| format!("写入 {} 失败：{error}", path.to_string_lossy()))
}

fn build_update_status(
    message: String,
    update_available: Option<String>,
) -> Result<UpdateStatus, String> {
    let preferences = read_update_preferences()?;
    let hermes_version = find_hermes_command()
        .ok()
        .and_then(|path| hermes_version(&path).ok());
    let log_path = updater_log_path()?;
    Ok(UpdateStatus {
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        hermes_version,
        auto_upgrade: preferences.auto_upgrade,
        last_checked_at: unix_millis(),
        update_available,
        message,
        log_path: log_path.to_string_lossy().to_string(),
    })
}

fn append_update_log(message: &str) -> Result<(), String> {
    let path = updater_log_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("创建 {} 失败：{error}", parent.to_string_lossy()))?;
    }
    let line = format!("{} [updater] {}\n", unix_millis(), message);
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|error| format!("打开 {} 失败：{error}", path.to_string_lossy()))?;
    file.write_all(line.as_bytes())
        .map_err(|error| format!("写入 {} 失败：{error}", path.to_string_lossy()))
}

fn read_connection_config() -> Result<RemoteConnectionConfig, String> {
    let path = app_connection_path()?;
    if !path.exists() {
        return Ok(default_connection_config());
    }
    let content = fs::read_to_string(&path)
        .map_err(|error| format!("读取 {} 失败：{error}", path.to_string_lossy()))?;
    serde_json::from_str(&content)
        .map_err(|error| format!("解析 {} 失败：{error}", path.to_string_lossy()))
}

fn write_connection_config(config: &RemoteConnectionConfig) -> Result<(), String> {
    let path = app_connection_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("创建 {} 失败：{error}", parent.to_string_lossy()))?;
    }
    let body = serde_json::to_string_pretty(config)
        .map_err(|error| format!("序列化远程连接配置失败：{error}"))?;
    fs::write(&path, body).map_err(|error| format!("写入 {} 失败：{error}", path.to_string_lossy()))
}

fn validate_connection_config(config: &RemoteConnectionConfig) -> Result<(), String> {
    match config.mode.as_str() {
        "local" => Ok(()),
        "remote" => {
            let url = config.remote_url.trim();
            if url.is_empty() {
                Err("Remote URL 不能为空。".to_string())
            } else if !url.starts_with("http://") {
                Err("当前远程 Gateway 只支持 http:// URL。".to_string())
            } else {
                Ok(())
            }
        }
        "ssh" => validate_ssh_config(&config.ssh),
        other => Err(format!("未知连接模式：{other}")),
    }
}

fn validate_ssh_config(config: &SshConnectionConfig) -> Result<(), String> {
    if config.host.trim().is_empty() {
        return Err("SSH host 不能为空。".to_string());
    }
    if config.username.trim().is_empty() {
        return Err("SSH username 不能为空。".to_string());
    }
    if config.port == 0 || config.remote_port == 0 || config.local_port == 0 {
        return Err("SSH 端口必须大于 0。".to_string());
    }
    Ok(())
}

fn resolve_connection_endpoint(
    profile: Option<&str>,
    explicit_base_url: Option<&str>,
) -> Result<RuntimeEndpoint, String> {
    if let Some(value) = explicit_base_url
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        return Ok(RuntimeEndpoint {
            base_url: normalize_base_url(Some(value)),
            auth: read_api_server_key(normalize_profile(profile).as_deref())?,
            message: "显式 baseUrl".to_string(),
        });
    }
    let config = read_connection_config()?;
    match config.mode.as_str() {
        "local" => {
            let profile = normalize_profile(profile);
            Ok(RuntimeEndpoint {
                base_url: resolve_gateway_url(profile.as_deref())?,
                auth: read_api_server_key(profile.as_deref())?,
                message: "local profile gateway".to_string(),
            })
        }
        "remote" => Ok(RuntimeEndpoint {
            base_url: normalize_base_url(Some(&config.remote_url)),
            auth: optional_api_key(&config.api_key),
            message: "remote gateway".to_string(),
        }),
        "ssh" => {
            let base_url = current_ssh_tunnel_url()
                .unwrap_or_else(|| format!("http://127.0.0.1:{}", config.ssh.local_port));
            Ok(RuntimeEndpoint {
                base_url,
                auth: optional_api_key(&config.api_key),
                message: "ssh tunnel gateway".to_string(),
            })
        }
        other => Err(format!("未知连接模式：{other}")),
    }
}

fn optional_api_key(value: &str) -> Option<String> {
    value
        .trim()
        .to_string()
        .split_whitespace()
        .next()
        .map(str::to_string)
        .filter(|value| !value.is_empty())
}

fn ssh_tunnel_process() -> &'static Mutex<Option<Child>> {
    SSH_TUNNEL_PROCESS.get_or_init(|| Mutex::new(None))
}

fn ssh_tunnel_url_store() -> &'static Mutex<Option<String>> {
    SSH_TUNNEL_URL.get_or_init(|| Mutex::new(None))
}

fn current_ssh_tunnel_url() -> Option<String> {
    ssh_tunnel_url_store()
        .lock()
        .ok()
        .and_then(|value| value.clone())
}

fn is_ssh_tunnel_active() -> bool {
    current_ssh_tunnel_url().is_some()
}

fn stop_ssh_tunnel_process() {
    if let Ok(mut child) = ssh_tunnel_process().lock() {
        if let Some(mut process) = child.take() {
            let _ = process.kill();
            let _ = process.wait();
        }
    }
    if let Ok(mut url) = ssh_tunnel_url_store().lock() {
        *url = None;
    }
}

fn start_ssh_tunnel_for_config(
    config: &SshConnectionConfig,
    bearer_token: Option<&str>,
) -> Result<String, String> {
    validate_ssh_config(config)?;
    stop_ssh_tunnel_process();
    let local_port = find_free_port(config.local_port)?;
    let key_path = if config.key_path.trim().is_empty() {
        format!("{}/.ssh/id_rsa", home_dir()?)
    } else {
        config.key_path.trim().to_string()
    };
    if !PathBuf::from(&key_path).exists() {
        return Err(format!("SSH private key 不存在：{key_path}"));
    }
    let local_forward = format!("{local_port}:127.0.0.1:{}", config.remote_port);
    let target = format!("{}@{}", config.username.trim(), config.host.trim());
    let mut command = Command::new("ssh");
    command
        .arg("-N")
        .arg("-L")
        .arg(local_forward)
        .arg("-p")
        .arg(config.port.to_string())
        .arg("-i")
        .arg(key_path)
        .arg("-o")
        .arg("StrictHostKeyChecking=accept-new")
        .arg("-o")
        .arg("BatchMode=yes")
        .arg("-o")
        .arg("ExitOnForwardFailure=yes")
        .arg("-o")
        .arg("ServerAliveInterval=30")
        .arg("-o")
        .arg("ServerAliveCountMax=3")
        .arg(target)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    let child = command
        .spawn()
        .map_err(|error| format!("启动 SSH 隧道失败：{error}"))?;
    let base_url = format!("http://127.0.0.1:{local_port}");
    if let Ok(mut store) = ssh_tunnel_process().lock() {
        *store = Some(child);
    }
    if let Ok(mut url) = ssh_tunnel_url_store().lock() {
        *url = Some(base_url.clone());
    }
    wait_for_gateway_health(&base_url, bearer_token, Duration::from_secs(20)).map_err(|error| {
        stop_ssh_tunnel_process();
        error
    })?;
    Ok(base_url)
}

fn find_free_port(preferred: u16) -> Result<u16, String> {
    match TcpListener::bind(("127.0.0.1", preferred)) {
        Ok(listener) => {
            let port = listener
                .local_addr()
                .map_err(|error| format!("读取本地端口失败：{error}"))?
                .port();
            drop(listener);
            Ok(port)
        }
        Err(_) => {
            let listener = TcpListener::bind(("127.0.0.1", 0))
                .map_err(|error| format!("分配本地端口失败：{error}"))?;
            let port = listener
                .local_addr()
                .map_err(|error| format!("读取本地端口失败：{error}"))?
                .port();
            drop(listener);
            Ok(port)
        }
    }
}

fn wait_for_gateway_health(
    base_url: &str,
    bearer_token: Option<&str>,
    timeout: Duration,
) -> Result<(), String> {
    let start = SystemTime::now();
    loop {
        if gateway_is_ready(base_url, bearer_token) {
            return Ok(());
        }
        if SystemTime::now().duration_since(start).unwrap_or_default() > timeout {
            return Err("SSH 隧道已启动，但远端 Hermes Gateway 健康检查超时。".to_string());
        }
        sleep(Duration::from_millis(500));
    }
}

fn normalize_profile(raw: Option<&str>) -> Option<String> {
    match raw.map(str::trim).filter(|value| !value.is_empty()) {
        Some("default") | None => None,
        Some(value) => Some(value.to_string()),
    }
}

fn is_valid_profile_name(name: &str) -> bool {
    let mut chars = name.chars();
    match chars.next() {
        Some(ch) if ch.is_ascii_lowercase() || ch.is_ascii_digit() || ch == '_' => {}
        _ => return false,
    }
    name.len() <= 64
        && chars.all(|ch| ch.is_ascii_lowercase() || ch.is_ascii_digit() || ch == '_' || ch == '-')
}

fn active_profile_name() -> String {
    let path = match hermes_home() {
        Ok(home) => home.join("active_profile"),
        Err(_) => return "default".to_string(),
    };
    fs::read_to_string(path)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "default".to_string())
}

fn profile_home(profile: Option<&str>) -> Result<PathBuf, String> {
    let root = hermes_home()?;
    Ok(match profile {
        Some(name) => root.join("profiles").join(name),
        None => root,
    })
}

fn state_db_path_for_profile(profile: &str) -> Result<PathBuf, String> {
    let trimmed = profile.trim();
    if trimmed.is_empty() || trimmed == "default" {
        Ok(hermes_home()?.join("state.db"))
    } else {
        Ok(profile_home(Some(trimmed))?.join("state.db"))
    }
}

fn resolve_gateway_url(profile: Option<&str>) -> Result<String, String> {
    let port = match profile {
        None => read_configured_port(None)?.unwrap_or(8642),
        Some(name) => {
            read_configured_port(Some(name))?.unwrap_or(inferred_named_profile_port(name)?)
        }
    };
    Ok(format!("http://127.0.0.1:{port}"))
}

fn inferred_named_profile_port(profile: &str) -> Result<u16, String> {
    let profiles_dir = hermes_home()?.join("profiles");
    let mut names = Vec::new();
    if let Ok(entries) = fs::read_dir(profiles_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                if let Some(name) = path.file_name().and_then(|item| item.to_str()) {
                    if is_valid_profile_name(name) {
                        names.push(name.to_string());
                    }
                }
            }
        }
    }
    names.sort();
    let index = names.iter().position(|name| name == profile).unwrap_or(0);
    Ok(8643_u16.saturating_add(index as u16))
}

fn gateway_port_from_base_url(base_url: &str) -> u16 {
    parse_http_base(base_url)
        .map(|target| target.port)
        .unwrap_or(8642)
}

fn gateway_log_path(profile: Option<&str>) -> Result<PathBuf, String> {
    let name = profile.unwrap_or("default");
    Ok(app_home()?.join("logs").join(format!("gateway-{name}.log")))
}

fn ensure_api_server_config(profile: Option<&str>, port: u16) -> Result<(), String> {
    let home = profile_home(profile)?;
    fs::create_dir_all(&home)
        .map_err(|error| format!("创建 {} 失败：{error}", home.to_string_lossy()))?;
    let path = home.join("config.yaml");
    let content = fs::read_to_string(&path).unwrap_or_default();
    if content.to_ascii_lowercase().contains("api_server") {
        return Ok(());
    }
    let addition = format!(
        "\n# Hermes Team API server (auto-configured)\nplatforms:\n  api_server:\n    enabled: true\n    extra:\n      port: {port}\n      host: \"127.0.0.1\"\n"
    );
    fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .and_then(|mut file| file.write_all(addition.as_bytes()))
        .map_err(|error| format!("写入 {} 失败：{error}", path.to_string_lossy()))
}

fn find_hermes_command() -> Result<PathBuf, String> {
    if let Ok(value) = std::env::var("HERMES_CLI") {
        let path = PathBuf::from(value.trim());
        if path.exists() {
            return Ok(path);
        }
    }
    let home = std::env::var("HOME").map_err(|_| "无法读取 HOME 环境变量".to_string())?;
    let candidates = [
        PathBuf::from(&home).join(".local/bin/hermes"),
        PathBuf::from(&home).join(".hermes/hermes-agent/hermes"),
        PathBuf::from("/opt/homebrew/bin/hermes"),
        PathBuf::from("/usr/local/bin/hermes"),
    ];
    for path in candidates {
        if path.exists() {
            return Ok(path);
        }
    }
    Err("未找到 hermes 命令。请确认 Hermes 已安装，或设置 HERMES_CLI。".to_string())
}

fn run_hermes_cli(args: &[String], timeout: Duration) -> Result<String, String> {
    let command = find_hermes_command()?;
    let mut process = Command::new(command);
    process
        .args(args)
        .env("HOME", home_dir()?)
        .env("PATH", enhanced_path())
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let repo_dir = hermes_home()?.join("hermes-agent");
    if repo_dir.exists() {
        process.current_dir(repo_dir);
    }
    let started = SystemTime::now();
    let mut child = process
        .spawn()
        .map_err(|error| format!("启动 hermes 命令失败：{error}"))?;
    loop {
        if let Some(status) = child
            .try_wait()
            .map_err(|error| format!("等待 hermes 命令失败：{error}"))?
        {
            let mut stdout = String::new();
            let mut stderr = String::new();
            if let Some(mut pipe) = child.stdout.take() {
                let _ = pipe.read_to_string(&mut stdout);
            }
            if let Some(mut pipe) = child.stderr.take() {
                let _ = pipe.read_to_string(&mut stderr);
            }
            if status.success() {
                return Ok(stdout.trim().to_string());
            }
            let message = if !stderr.trim().is_empty() {
                stderr.trim().to_string()
            } else if !stdout.trim().is_empty() {
                stdout.trim().to_string()
            } else {
                format!("hermes 命令退出：{status}")
            };
            return Err(message);
        }
        if SystemTime::now()
            .duration_since(started)
            .unwrap_or_default()
            > timeout
        {
            let _ = child.kill();
            let _ = child.wait();
            return Err("hermes 命令执行超时。".to_string());
        }
        sleep(Duration::from_millis(100));
    }
}

fn count_profile_skills(profile_home: &Path) -> usize {
    let root = profile_home.join("skills");
    let Ok(categories) = fs::read_dir(root) else {
        return 0;
    };
    let mut count = 0;
    for category in categories.flatten() {
        let category_path = category.path();
        if !category_path.is_dir() {
            continue;
        }
        let Ok(entries) = fs::read_dir(category_path) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() && path.join("SKILL.md").exists() {
                count += 1;
            }
        }
    }
    count
}

fn hermes_version(path: &PathBuf) -> Result<String, String> {
    let output = Command::new(path)
        .arg("--version")
        .env("HOME", home_dir()?)
        .env("PATH", enhanced_path())
        .output()
        .map_err(|error| format!("执行 hermes --version 失败：{error}"))?;
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let value = if stdout.is_empty() { stderr } else { stdout };
    if value.is_empty() {
        return Err("hermes --version 未返回版本信息".to_string());
    }
    Ok(value)
}

fn enhanced_path() -> String {
    let current = std::env::var("PATH").unwrap_or_default();
    let home = std::env::var("HOME").unwrap_or_default();
    let prefix =
        format!("{home}/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin");
    if current.is_empty() {
        prefix
    } else {
        format!("{prefix}:{current}")
    }
}

fn read_configured_port(profile: Option<&str>) -> Result<Option<u16>, String> {
    let config = read_profile_file(profile, "config.yaml")?.unwrap_or_default();
    Ok(
        read_nested_yaml_scalar(&config, &["platforms", "api_server", "extra", "port"])
            .or_else(|| read_nested_yaml_scalar(&config, &["api_server", "extra", "port"]))
            .and_then(|value| value.parse::<u16>().ok())
            .filter(|port| *port > 0),
    )
}

#[derive(Debug, Clone)]
struct ApiServerKeySource {
    location: String,
    value: String,
    canonical: bool,
}

fn build_config_health_report(profile: Option<&str>) -> Result<ConfigHealthReport, String> {
    let profile_name = profile.unwrap_or("default").to_string();
    let mut issues = Vec::new();
    let profile_home_path = profile_home(profile)?;
    let config_path = profile_home_path.join("config.yaml");
    let env_path = profile_home_path.join(".env");
    let config = read_profile_file(profile, "config.yaml")?.unwrap_or_default();
    let env = read_env_map(profile)?;
    let sources = api_server_key_sources(profile)?;

    if !sources.is_empty() {
        let unique_values = sources
            .iter()
            .map(|source| source.value.trim())
            .filter(|value| !value.is_empty())
            .collect::<std::collections::HashSet<_>>();
        if unique_values.len() > 1 {
            issues.push(config_health_issue(
                "API_SERVER_KEY_MULTIPLE_VALUES",
                "error",
                "API_SERVER_KEY 在多个位置存在且值不一致。",
                Some("Hermes Gateway 鉴权可能读取到不同 token。请人工确认保留哪一个值。"),
                sources
                    .iter()
                    .map(|source| source.location.clone())
                    .collect(),
                false,
                None,
                None,
                None,
            ));
        } else if !sources.iter().any(|source| source.canonical) {
            let mut context = std::collections::BTreeMap::new();
            if let Some(source) = sources.first() {
                context.insert("value".to_string(), source.value.clone());
                context.insert("source".to_string(), source.location.clone());
            }
            issues.push(config_health_issue(
                "API_SERVER_KEY_NON_CANONICAL",
                "warning",
                "API_SERVER_KEY 不在当前 profile 的 .env 中。",
                Some("Hermes Desktop 将 .env 作为本地 Gateway token 的规范位置。"),
                sources
                    .iter()
                    .map(|source| source.location.clone())
                    .collect(),
                true,
                Some("复制到当前 profile 的 .env"),
                Some(env_path.to_string_lossy().to_string()),
                Some(context),
            ));
        }
    } else if config_path.exists() || env_path.exists() {
        issues.push(config_health_issue(
            "EMPTY_API_SERVER_KEY",
            "warning",
            "未发现 API_SERVER_KEY。",
            Some("本地 Gateway 启动后无法通过 Hermes Team 探测命令鉴权。"),
            vec![env_path.to_string_lossy().to_string()],
            false,
            None,
            None,
            None,
        ));
    }

    let model = read_model_config(profile)?;
    let provider = model.provider.trim();
    let base_url = model.base_url.trim();
    if !provider.is_empty()
        && provider != "auto"
        && !provider_can_discover_without_key(provider, base_url)
    {
        if let Some(env_key) = provider_env_key(provider, base_url) {
            let key_value = env.get(env_key).cloned().unwrap_or_default();
            if key_value.trim().is_empty() {
                let mut context = std::collections::BTreeMap::new();
                context.insert("provider".to_string(), provider.to_string());
                context.insert("envKey".to_string(), env_key.to_string());
                issues.push(config_health_issue(
                    "MODEL_KEY_MISSING",
                    "warning",
                    "当前模型 Provider 缺少 API key。",
                    Some(&format!(
                        "Provider `{provider}` 需要 `{env_key}`，否则模型发现和聊天请求会失败。"
                    )),
                    vec![
                        config_path.to_string_lossy().to_string(),
                        env_path.to_string_lossy().to_string(),
                    ],
                    false,
                    None,
                    None,
                    Some(context),
                ));
            }
        }
    }

    for (key, value) in env.iter() {
        if is_sensitive_env_key(key) && !value.is_ascii() {
            issues.push(config_health_issue(
                "NON_ASCII_CREDENTIAL",
                "warning",
                "凭据字段包含非 ASCII 字符。",
                Some(&format!(
                    "`{key}` 可能包含复制粘贴引入的不可见字符，请人工核对。"
                )),
                vec![env_path.to_string_lossy().to_string()],
                false,
                None,
                None,
                None,
            ));
        }
    }

    if config.contains("code-execution") {
        issues.push(config_health_issue(
            "LEGACY_TOOLSET_NAME",
            "warning",
            "配置中仍使用旧 toolset 名称 code-execution。",
            Some("当前 Hermes toolset 名称为 code_execution。"),
            vec![config_path.to_string_lossy().to_string()],
            true,
            Some("替换为 code_execution"),
            Some(config_path.to_string_lossy().to_string()),
            None,
        ));
    }

    let summary = ConfigHealthSummary {
        errors: issues
            .iter()
            .filter(|issue| issue.severity == "error")
            .count(),
        warnings: issues
            .iter()
            .filter(|issue| issue.severity == "warning")
            .count(),
        infos: issues
            .iter()
            .filter(|issue| issue.severity == "info")
            .count(),
    };

    Ok(ConfigHealthReport {
        ran_at: unix_millis(),
        profile: profile_name,
        issues,
        summary,
    })
}

fn config_health_issue(
    code: &str,
    severity: &str,
    message: &str,
    detail: Option<&str>,
    locations: Vec<String>,
    auto_fixable: bool,
    fix_description: Option<&str>,
    fix_location: Option<String>,
    context: Option<std::collections::BTreeMap<String, String>>,
) -> ConfigHealthIssue {
    ConfigHealthIssue {
        code: code.to_string(),
        severity: severity.to_string(),
        message: message.to_string(),
        detail: detail.map(str::to_string),
        locations,
        auto_fixable,
        fix_description: fix_description.map(str::to_string),
        fix_location,
        context,
    }
}

fn api_server_key_sources(profile: Option<&str>) -> Result<Vec<ApiServerKeySource>, String> {
    let mut sources = Vec::new();
    collect_api_server_key_sources(profile, true, &mut sources)?;
    if profile.is_some() {
        collect_api_server_key_sources(None, false, &mut sources)?;
    }
    Ok(sources)
}

fn collect_api_server_key_sources(
    profile: Option<&str>,
    current_profile: bool,
    sources: &mut Vec<ApiServerKeySource>,
) -> Result<(), String> {
    let home = profile_home(profile)?;
    let label = profile.unwrap_or("default");
    let config = read_profile_file(profile, "config.yaml")?.unwrap_or_default();
    let env = read_profile_file(profile, ".env")?.unwrap_or_default();
    let config_path = home.join("config.yaml").to_string_lossy().to_string();
    let env_path = home.join(".env").to_string_lossy().to_string();

    if let Some(value) =
        read_env_value(&env, "API_SERVER_KEY").filter(|value| !value.trim().is_empty())
    {
        sources.push(ApiServerKeySource {
            location: format!("{env_path} · {label} .env"),
            value,
            canonical: current_profile,
        });
    }
    if let Some(value) = read_top_level_yaml_scalar(&config, "API_SERVER_KEY")
        .filter(|value| !value.trim().is_empty())
    {
        sources.push(ApiServerKeySource {
            location: format!("{config_path} · {label} top-level API_SERVER_KEY"),
            value,
            canonical: false,
        });
    }
    if let Some(value) = read_nested_yaml_scalar(&config, &["api_server", "token"])
        .filter(|value| !value.trim().is_empty())
    {
        sources.push(ApiServerKeySource {
            location: format!("{config_path} · {label} api_server.token"),
            value,
            canonical: false,
        });
    }
    Ok(())
}

fn first_api_server_key_source(profile: Option<&str>) -> Option<ApiServerKeySource> {
    api_server_key_sources(profile)
        .ok()
        .and_then(|sources| sources.into_iter().next())
}

fn is_sensitive_env_key(key: &str) -> bool {
    let upper = key.to_ascii_uppercase();
    upper.ends_with("_API_KEY")
        || upper.ends_with("_TOKEN")
        || upper.ends_with("_SECRET")
        || upper.ends_with("_PASSWORD")
        || upper == "API_SERVER_KEY"
        || upper == "HF_TOKEN"
}

fn append_config_health_log(profile: Option<&str>, code: &str, action: &str) -> Result<(), String> {
    let dir = app_home()?.join("logs");
    fs::create_dir_all(&dir)
        .map_err(|error| format!("创建 {} 失败：{error}", dir.to_string_lossy()))?;
    let path = dir.join("config-health.log");
    let line = format!(
        "{} profile={} code={} action={}\n",
        unix_millis(),
        profile.unwrap_or("default"),
        code,
        action
    );
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|error| format!("打开 {} 失败：{error}", path.to_string_lossy()))?;
    file.write_all(line.as_bytes())
        .map_err(|error| format!("写入 {} 失败：{error}", path.to_string_lossy()))
}

fn read_api_server_key(profile: Option<&str>) -> Result<Option<String>, String> {
    let profile_config = read_profile_file(profile, "config.yaml")?.unwrap_or_default();
    let default_config = if profile.is_some() {
        read_profile_file(None, "config.yaml")?.unwrap_or_default()
    } else {
        String::new()
    };
    let profile_env = read_profile_file(profile, ".env")?.unwrap_or_default();
    let default_env = if profile.is_some() {
        read_profile_file(None, ".env")?.unwrap_or_default()
    } else {
        String::new()
    };

    Ok([
        read_top_level_yaml_scalar(&profile_config, "API_SERVER_KEY"),
        read_top_level_yaml_scalar(&default_config, "API_SERVER_KEY"),
        read_env_value(&profile_env, "API_SERVER_KEY"),
        read_env_value(&default_env, "API_SERVER_KEY"),
        read_nested_yaml_scalar(&profile_config, &["api_server", "token"]),
        read_nested_yaml_scalar(&default_config, &["api_server", "token"]),
    ]
    .into_iter()
    .flatten()
    .map(|value| value.trim().to_string())
    .find(|value| !value.is_empty()))
}

fn read_profile_file(profile: Option<&str>, file_name: &str) -> Result<Option<String>, String> {
    let path = profile_home(profile)?.join(file_name);
    if !path.exists() {
        return Ok(None);
    }
    fs::read_to_string(&path)
        .map(Some)
        .map_err(|error| format!("读取 {} 失败：{error}", path.to_string_lossy()))
}

fn write_profile_file(profile: Option<&str>, file_name: &str, content: &str) -> Result<(), String> {
    let home = profile_home(profile)?;
    fs::create_dir_all(&home)
        .map_err(|error| format!("创建 {} 失败：{error}", home.to_string_lossy()))?;
    let path = home.join(file_name);
    fs::write(&path, content)
        .map_err(|error| format!("写入 {} 失败：{error}", path.to_string_lossy()))
}

fn read_env_value(content: &str, key: &str) -> Option<String> {
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let (line_key, value) = trimmed.split_once('=')?;
        if line_key.trim() == key {
            return Some(unquote(value.trim()).to_string());
        }
    }
    None
}

fn upsert_env_value(profile: Option<&str>, key: &str, value: &str) -> Result<(), String> {
    let mut found = false;
    let existing = read_profile_file(profile, ".env")?.unwrap_or_default();
    let mut lines = Vec::new();
    for line in existing.lines() {
        let trimmed = line.trim_start();
        if !trimmed.starts_with('#')
            && trimmed
                .split_once('=')
                .map(|(line_key, _)| line_key.trim() == key)
                .unwrap_or(false)
        {
            lines.push(format!("{key}={value}"));
            found = true;
        } else {
            lines.push(line.to_string());
        }
    }
    if !found {
        if !lines.is_empty() && lines.last().is_some_and(|line| !line.trim().is_empty()) {
            lines.push(String::new());
        }
        lines.push(format!("{key}={value}"));
    }
    let mut content = lines.join("\n");
    content.push('\n');
    write_profile_file(profile, ".env", &content)
}

fn random_hex(bytes_len: usize) -> Result<String, String> {
    let mut file =
        fs::File::open("/dev/urandom").map_err(|error| format!("无法打开系统随机源：{error}"))?;
    let mut bytes = vec![0_u8; bytes_len];
    file.read_exact(&mut bytes)
        .map_err(|error| format!("读取系统随机源失败：{error}"))?;
    Ok(bytes
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>())
}

fn read_top_level_yaml_scalar(content: &str, key: &str) -> Option<String> {
    for line in content.lines() {
        if line.starts_with(' ') || line.starts_with('\t') {
            continue;
        }
        let (line_key, value) = line.split_once(':')?;
        if line_key.trim() == key {
            return Some(unquote(value.trim()).to_string());
        }
    }
    None
}

fn read_nested_yaml_scalar(content: &str, path: &[&str]) -> Option<String> {
    let mut stack: Vec<(usize, String)> = Vec::new();
    for line in content.lines() {
        if line.trim().is_empty() || line.trim_start().starts_with('#') {
            continue;
        }
        let indent = line.chars().take_while(|ch| *ch == ' ').count();
        let trimmed = line.trim();
        let (key, value) = trimmed.split_once(':')?;
        while stack.last().is_some_and(|(level, _)| *level >= indent) {
            stack.pop();
        }
        stack.push((indent, key.trim().to_string()));
        if stack.len() == path.len()
            && stack
                .iter()
                .zip(path.iter())
                .all(|((_, actual), expected)| actual == expected)
        {
            let value = value.trim();
            if !value.is_empty() {
                return Some(unquote(value).to_string());
            }
        }
    }
    None
}

fn models_file_path() -> Result<PathBuf, String> {
    Ok(hermes_home()?.join("models.json"))
}

fn read_models() -> Result<Vec<SavedModel>, String> {
    let path = models_file_path()?;
    if !path.exists() {
        return Ok(default_models());
    }
    let content = fs::read_to_string(&path)
        .map_err(|error| format!("读取 {} 失败：{error}", path.to_string_lossy()))?;
    serde_json::from_str::<Vec<SavedModel>>(&content)
        .map_err(|error| format!("解析 {} 失败：{error}", path.to_string_lossy()))
}

fn write_models(models: &[SavedModel]) -> Result<(), String> {
    let path = models_file_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("创建 {} 失败：{error}", parent.to_string_lossy()))?;
    }
    let content = serde_json::to_string_pretty(models)
        .map_err(|error| format!("序列化模型库失败：{error}"))?;
    fs::write(&path, format!("{content}\n"))
        .map_err(|error| format!("写入 {} 失败：{error}", path.to_string_lossy()))
}

fn default_models() -> Vec<SavedModel> {
    let now = unix_millis();
    vec![
        saved_model(
            "default-openrouter-claude-sonnet-4",
            "Claude Sonnet 4",
            "openrouter",
            "anthropic/claude-sonnet-4-20250514",
            "",
            now,
        ),
        saved_model(
            "default-anthropic-claude-sonnet-4",
            "Claude Sonnet 4",
            "anthropic",
            "claude-sonnet-4-20250514",
            "",
            now,
        ),
        saved_model(
            "default-openai-gpt-4-1",
            "GPT-4.1",
            "openai",
            "gpt-4.1",
            "",
            now,
        ),
        saved_model(
            "default-ollama-cloud-glm-5-1",
            "glm-5.1",
            "ollama-cloud",
            "glm-5.1",
            "https://ollama.com/v1",
            now,
        ),
        saved_model(
            "default-atlascloud-deepseek-v4-pro",
            "DeepSeek V4 Pro (Atlas Cloud)",
            "atlascloud",
            "deepseek-ai/deepseek-v4-pro",
            "",
            now,
        ),
        saved_model(
            "default-atlascloud-deepseek-v4-flash",
            "DeepSeek V4 Flash (Atlas Cloud)",
            "atlascloud",
            "deepseek-ai/deepseek-v4-flash",
            "",
            now,
        ),
        saved_model(
            "default-atlascloud-qwen3-235b",
            "Qwen3-235B Instruct (Atlas Cloud)",
            "atlascloud",
            "Qwen/Qwen3-235B-A22B-Instruct-2507",
            "",
            now,
        ),
    ]
}

fn saved_model(
    id: &str,
    name: &str,
    provider: &str,
    model: &str,
    base_url: &str,
    created_at: u64,
) -> SavedModel {
    SavedModel {
        id: id.to_string(),
        name: name.to_string(),
        provider: provider.to_string(),
        model: model.to_string(),
        base_url: base_url.to_string(),
        api_mode: None,
        context_length: None,
        created_at,
    }
}

fn validate_model_input(input: &SaveModelInput) -> Result<(), String> {
    if input.name.trim().is_empty() {
        return Err("模型名称不能为空".to_string());
    }
    if input.provider.trim().is_empty() {
        return Err("provider 不能为空".to_string());
    }
    if input.model.trim().is_empty() {
        return Err("model 不能为空".to_string());
    }
    Ok(())
}

fn read_model_config(profile: Option<&str>) -> Result<ActiveModelConfig, String> {
    let config = read_profile_file(profile, "config.yaml")?.unwrap_or_default();
    Ok(ActiveModelConfig {
        provider: read_nested_yaml_scalar(&config, &["model", "provider"])
            .unwrap_or_else(|| "auto".to_string()),
        model: read_nested_yaml_scalar(&config, &["model", "default"]).unwrap_or_default(),
        base_url: read_nested_yaml_scalar(&config, &["model", "base_url"]).unwrap_or_default(),
        context_length: read_nested_yaml_scalar(&config, &["model", "context_length"])
            .and_then(|value| value.parse::<u64>().ok())
            .filter(|value| *value > 0),
    })
}

fn normalize_reasoning_effort(value: &str) -> String {
    match value.trim().to_lowercase().as_str() {
        "minimal" => "minimal".to_string(),
        "low" => "low".to_string(),
        "medium" => "medium".to_string(),
        "high" => "high".to_string(),
        "xhigh" => "xhigh".to_string(),
        _ => "auto".to_string(),
    }
}

fn read_reasoning_effort_config(profile: Option<&str>) -> Result<String, String> {
    let config = read_profile_file(profile, "config.yaml")?.unwrap_or_default();
    Ok(
        read_nested_yaml_scalar(&config, &["agent", "reasoning_effort"])
            .map(|value| normalize_reasoning_effort(&value))
            .unwrap_or_else(|| "auto".to_string()),
    )
}

fn write_reasoning_effort_config(profile: Option<&str>, value: &str) -> Result<(), String> {
    let home = profile_home(profile)?;
    fs::create_dir_all(&home)
        .map_err(|error| format!("创建 {} 失败：{error}", home.to_string_lossy()))?;
    let path = home.join("config.yaml");
    let mut content = fs::read_to_string(&path).unwrap_or_default();
    content = upsert_block_child(
        &content,
        "agent",
        "reasoning_effort",
        &quote_yaml(&normalize_reasoning_effort(value)),
    );
    fs::write(&path, ensure_trailing_newline(&content))
        .map_err(|error| format!("写入 {} 失败：{error}", path.to_string_lossy()))
}

fn reasoning_effort_for_profile(profile: Option<&str>) -> Result<Option<String>, String> {
    let value = read_reasoning_effort_config(profile)?;
    Ok(match value.as_str() {
        "minimal" | "low" | "medium" | "high" | "xhigh" => Some(value),
        _ => None,
    })
}

fn write_model_config(
    profile: Option<&str>,
    provider: &str,
    model: &str,
    base_url: &str,
    context_length: Option<u64>,
) -> Result<(), String> {
    let home = profile_home(profile)?;
    fs::create_dir_all(&home)
        .map_err(|error| format!("创建 {} 失败：{error}", home.to_string_lossy()))?;
    let path = home.join("config.yaml");
    let mut content = fs::read_to_string(&path).unwrap_or_default();
    content = upsert_block_child(&content, "model", "provider", &quote_yaml(provider));
    content = upsert_block_child(&content, "model", "default", &quote_yaml(model));
    if base_url.trim().is_empty() {
        content = remove_block_child(&content, "model", "base_url");
    } else {
        content = upsert_block_child(&content, "model", "base_url", &quote_yaml(base_url));
    }
    content = match context_length {
        Some(value) => upsert_block_child(&content, "model", "context_length", &value.to_string()),
        None => remove_block_child(&content, "model", "context_length"),
    };
    fs::write(&path, ensure_trailing_newline(&content))
        .map_err(|error| format!("写入 {} 失败：{error}", path.to_string_lossy()))
}

fn upsert_block_child(content: &str, block: &str, key: &str, rendered_value: &str) -> String {
    let lines: Vec<&str> = content.lines().collect();
    let header = format!("{block}:");
    let Some(block_index) = lines
        .iter()
        .position(|line| line.trim_end() == header && !line.starts_with(' '))
    else {
        let sep = if content.is_empty() || content.ends_with('\n') {
            ""
        } else {
            "\n"
        };
        return format!("{content}{sep}{block}:\n  {key}: {rendered_value}\n");
    };

    let mut end = lines.len();
    for (index, line) in lines.iter().enumerate().skip(block_index + 1) {
        if !line.trim().is_empty() && !line.starts_with(' ') {
            end = index;
            break;
        }
    }

    let child_prefix = format!("  {key}:");
    let mut output = Vec::with_capacity(lines.len() + 1);
    let mut inserted = false;
    for (index, line) in lines.iter().enumerate() {
        if index > block_index && index < end && line.starts_with(&child_prefix) {
            output.push(format!("  {key}: {rendered_value}"));
            inserted = true;
        } else {
            output.push((*line).to_string());
        }
        if index == block_index && !inserted {
            let has_child = lines[block_index + 1..end]
                .iter()
                .any(|line| line.starts_with(&child_prefix));
            if !has_child {
                output.push(format!("  {key}: {rendered_value}"));
                inserted = true;
            }
        }
    }
    output.join("\n")
}

fn remove_block_child(content: &str, block: &str, key: &str) -> String {
    let lines: Vec<&str> = content.lines().collect();
    let header = format!("{block}:");
    let Some(block_index) = lines
        .iter()
        .position(|line| line.trim_end() == header && !line.starts_with(' '))
    else {
        return content.to_string();
    };
    let mut end = lines.len();
    for (index, line) in lines.iter().enumerate().skip(block_index + 1) {
        if !line.trim().is_empty() && !line.starts_with(' ') {
            end = index;
            break;
        }
    }
    let child_prefix = format!("  {key}:");
    lines
        .into_iter()
        .enumerate()
        .filter_map(|(index, line)| {
            if index > block_index && index < end && line.starts_with(&child_prefix) {
                None
            } else {
                Some(line.to_string())
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn quote_yaml(value: &str) -> String {
    format!("\"{}\"", value.replace('\\', "\\\\").replace('"', "\\\""))
}

fn ensure_trailing_newline(content: &str) -> String {
    if content.ends_with('\n') {
        content.to_string()
    } else {
        format!("{content}\n")
    }
}

fn canonical_provider_base_url(provider: &str) -> Option<&'static str> {
    match provider.to_ascii_lowercase().as_str() {
        "openai" => Some("https://api.openai.com/v1"),
        "openrouter" => Some("https://openrouter.ai/api/v1"),
        "ollama-cloud" => Some("https://ollama.com/v1"),
        "aimlapi" => Some("https://api.aimlapi.com/v1"),
        "deepseek" => Some("https://api.deepseek.com/v1"),
        "groq" => Some("https://api.groq.com/openai/v1"),
        "mistral" => Some("https://api.mistral.ai/v1"),
        "together" => Some("https://api.together.xyz/v1"),
        "fireworks" => Some("https://api.fireworks.ai/inference/v1"),
        "atlascloud" => Some("https://api.atlascloud.ai/v1"),
        "cerebras" => Some("https://api.cerebras.ai/v1"),
        "perplexity" => Some("https://api.perplexity.ai"),
        "huggingface" => Some("https://router.huggingface.co/v1"),
        "xiaomi" => Some("https://api.xiaomimimo.com/v1"),
        "zai" => Some("https://api.z.ai/api/paas/v4"),
        "anthropic" => Some("https://api.anthropic.com/v1"),
        "lmstudio" => Some("http://localhost:1234/v1"),
        "atomicchat" => Some("http://localhost:1337/v1"),
        "ollama" => Some("http://localhost:11434/v1"),
        "vllm" => Some("http://localhost:8000/v1"),
        "llamacpp" => Some("http://localhost:8080/v1"),
        _ => None,
    }
}

fn provider_key_defs() -> Vec<(&'static str, &'static str, &'static str)> {
    vec![
        ("openrouter", "OpenRouter", "OPENROUTER_API_KEY"),
        ("anthropic", "Anthropic", "ANTHROPIC_API_KEY"),
        ("openai", "OpenAI", "OPENAI_API_KEY"),
        ("ollama-cloud", "Ollama Cloud", "OLLAMA_API_KEY"),
        ("aimlapi", "AIMLAPI", "AIMLAPI_API_KEY"),
        ("huggingface", "Hugging Face", "HF_TOKEN"),
        ("groq", "Groq", "GROQ_API_KEY"),
        ("deepseek", "DeepSeek", "DEEPSEEK_API_KEY"),
        ("together", "Together", "TOGETHER_API_KEY"),
        ("fireworks", "Fireworks", "FIREWORKS_API_KEY"),
        ("cerebras", "Cerebras", "CEREBRAS_API_KEY"),
        ("atlascloud", "Atlas Cloud", "ATLASCLOUD_API_KEY"),
        ("mistral", "Mistral", "MISTRAL_API_KEY"),
        ("perplexity", "Perplexity", "PERPLEXITY_API_KEY"),
        ("xiaomi", "Xiaomi", "XIAOMI_API_KEY"),
        ("custom", "Custom", "CUSTOM_API_KEY"),
    ]
}

fn provider_discovery_result(
    ok: bool,
    provider: &str,
    base_url: &str,
    env_key: &str,
    key_present: bool,
    status: &str,
    message: &str,
    models: Vec<DiscoveredModel>,
) -> ProviderDiscoveryResult {
    ProviderDiscoveryResult {
        ok,
        provider: provider.to_string(),
        base_url: base_url.to_string(),
        env_key: env_key.to_string(),
        key_present,
        status: status.to_string(),
        message: message.to_string(),
        model_count: models.len(),
        models,
    }
}

fn list_remote_cron_jobs(
    include_disabled: bool,
    profile: Option<&str>,
) -> Result<Vec<CronJobInfo>, String> {
    let query = if include_disabled {
        "?include_disabled=true"
    } else {
        ""
    };
    let endpoint = resolve_connection_endpoint(profile, None)?;
    let response = http_request(
        &endpoint.base_url,
        "GET",
        &format!("/api/jobs{query}"),
        None,
        endpoint.auth.as_deref(),
    )?;
    if !(200..300).contains(&response.status) {
        return Err(format!(
            "读取远程 Cron Jobs 失败：HTTP {}：{}",
            response.status,
            truncate(&response.body, 240)
        ));
    }
    let parsed = serde_json::from_str::<serde_json::Value>(&response.body)
        .map_err(|error| format!("解析远程 Cron Jobs 响应失败：{error}"))?;
    let jobs = parsed
        .get("jobs")
        .and_then(|value| value.as_array())
        .cloned()
        .unwrap_or_default();
    Ok(jobs
        .iter()
        .filter_map(normalize_cron_job)
        .filter(|job| include_disabled || job.enabled)
        .collect())
}

fn normalize_cron_job(job: &serde_json::Value) -> Option<CronJobInfo> {
    let id = json_string(job.get("id"))?;
    let enabled = job
        .get("enabled")
        .and_then(|value| value.as_bool())
        .unwrap_or(true);
    let raw_state = json_string(job.get("state")).unwrap_or_default();
    let state = if raw_state == "completed" {
        "completed"
    } else if raw_state == "paused" || !enabled {
        "paused"
    } else {
        "active"
    };
    Some(CronJobInfo {
        id,
        name: json_string(job.get("name")).unwrap_or_else(|| "(unnamed)".to_string()),
        schedule: json_string(job.get("schedule_display"))
            .or_else(|| schedule_value(job.get("schedule")))
            .unwrap_or_else(|| "?".to_string()),
        prompt: json_string(job.get("prompt")).unwrap_or_default(),
        state: state.to_string(),
        enabled,
        next_run_at: json_string(job.get("next_run_at")),
        last_run_at: json_string(job.get("last_run_at")),
        last_status: json_string(job.get("last_status")),
        last_error: json_string(job.get("last_error")),
        repeat: normalize_cron_repeat(job.get("repeat")),
        deliver: json_string_array(job.get("deliver"))
            .or_else(|| json_string(job.get("deliver")).map(|value| vec![value]))
            .unwrap_or_else(|| vec!["local".to_string()]),
        skills: json_string_array(job.get("skills"))
            .or_else(|| json_string(job.get("skill")).map(|value| vec![value]))
            .unwrap_or_default(),
        script: json_string(job.get("script")),
    })
}

fn normalize_cron_repeat(value: Option<&serde_json::Value>) -> Option<CronRepeat> {
    let value = value?;
    if !value.is_object() {
        return None;
    }
    Some(CronRepeat {
        times: value.get("times").and_then(|item| item.as_u64()),
        completed: value
            .get("completed")
            .and_then(|item| item.as_u64())
            .unwrap_or(0),
    })
}

fn schedule_value(value: Option<&serde_json::Value>) -> Option<String> {
    let value = value?;
    if let Some(text) = value.as_str() {
        return Some(text.to_string());
    }
    value
        .get("value")
        .and_then(|item| item.as_str())
        .map(str::to_string)
}

fn json_string(value: Option<&serde_json::Value>) -> Option<String> {
    value
        .and_then(|item| item.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn json_string_array(value: Option<&serde_json::Value>) -> Option<Vec<String>> {
    value.and_then(|item| {
        item.as_array().map(|items| {
            items
                .iter()
                .filter_map(|entry| entry.as_str())
                .map(str::trim)
                .filter(|entry| !entry.is_empty())
                .map(str::to_string)
                .collect::<Vec<_>>()
        })
    })
}

async fn run_cron_action(
    input: CronJobActionInput,
    local_action: &str,
    remote_method: &str,
    remote_action: Option<&str>,
) -> Result<CronJobActionResult, String> {
    let job_id = input.job_id.trim();
    if job_id.is_empty() {
        return Ok(cron_action_error("job id 不能为空。"));
    }
    let config = read_connection_config()?;
    if config.mode == "remote" || config.mode == "ssh" {
        let encoded = encode_path_segment(job_id);
        let path = match remote_action {
            Some(action) => format!("/api/jobs/{encoded}/{action}"),
            None => format!("/api/jobs/{encoded}"),
        };
        return remote_cron_request(remote_method, &path, None, input.profile.as_deref());
    }
    run_cron_command(
        &[local_action.to_string(), job_id.to_string()],
        input.profile.as_deref(),
    )
}

fn remote_cron_request(
    method: &str,
    path: &str,
    body: Option<serde_json::Value>,
    profile: Option<&str>,
) -> Result<CronJobActionResult, String> {
    let endpoint = resolve_connection_endpoint(profile, None)?;
    let body_text = body
        .map(|value| serde_json::to_string(&value))
        .transpose()
        .map_err(|error| format!("序列化 Cron 请求失败：{error}"))?;
    let response = http_request(
        &endpoint.base_url,
        method,
        path,
        body_text.as_deref(),
        endpoint.auth.as_deref(),
    )?;
    if (200..300).contains(&response.status) {
        Ok(CronJobActionResult {
            success: true,
            error: None,
        })
    } else {
        Ok(cron_action_error(&format!(
            "HTTP {}：{}",
            response.status,
            truncate(&response.body, 240)
        )))
    }
}

fn run_cron_command(args: &[String], profile: Option<&str>) -> Result<CronJobActionResult, String> {
    let command = find_hermes_command()?;
    let mut process = Command::new(command);
    if let Some(profile_name) = normalize_profile(profile) {
        process.arg("-p").arg(profile_name);
    }
    process
        .arg("cron")
        .args(args)
        .env("HOME", home_dir()?)
        .env("PATH", enhanced_path())
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let repo_dir = hermes_home()?.join("hermes-agent");
    if repo_dir.exists() {
        process.current_dir(repo_dir);
    }
    let output = process
        .output()
        .map_err(|error| format!("执行 hermes cron 失败：{error}"))?;
    if output.status.success() {
        Ok(CronJobActionResult {
            success: true,
            error: None,
        })
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Ok(cron_action_error(if stderr.is_empty() {
            &stdout
        } else {
            &stderr
        }))
    }
}

fn cron_action_error(message: &str) -> CronJobActionResult {
    CronJobActionResult {
        success: false,
        error: Some(if message.trim().is_empty() {
            "Cron 命令执行失败。".to_string()
        } else {
            message.trim().to_string()
        }),
    }
}

fn encode_path_segment(value: &str) -> String {
    let mut encoded = String::new();
    for byte in value.as_bytes() {
        match *byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                encoded.push(*byte as char)
            }
            other => encoded.push_str(&format!("%{other:02X}")),
        }
    }
    encoded
}

struct MessagingPlatformDef {
    id: &'static str,
    name: &'static str,
    description: &'static str,
    docs_slug: &'static str,
    env_vars: &'static [&'static str],
    required_env: &'static [&'static str],
}

struct MessagingEnvDef {
    prompt: String,
    description: String,
    is_password: bool,
    advanced: bool,
    url: Option<&'static str>,
}

fn messaging_platform_defs() -> Vec<MessagingPlatformDef> {
    vec![
        MessagingPlatformDef {
            id: "telegram",
            name: "Telegram",
            description: "Run Hermes from Telegram DMs, groups, and topics.",
            docs_slug: "telegram",
            env_vars: &[
                "TELEGRAM_BOT_TOKEN",
                "TELEGRAM_ALLOWED_USERS",
                "TELEGRAM_PROXY",
            ],
            required_env: &["TELEGRAM_BOT_TOKEN"],
        },
        MessagingPlatformDef {
            id: "discord",
            name: "Discord",
            description: "Connect Hermes to Discord DMs, channels, and threads.",
            docs_slug: "discord",
            env_vars: &[
                "DISCORD_BOT_TOKEN",
                "DISCORD_ALLOWED_USERS",
                "DISCORD_ALLOWED_CHANNELS",
            ],
            required_env: &["DISCORD_BOT_TOKEN"],
        },
        MessagingPlatformDef {
            id: "slack",
            name: "Slack",
            description: "Use Hermes from Slack via Socket Mode.",
            docs_slug: "slack",
            env_vars: &["SLACK_BOT_TOKEN", "SLACK_APP_TOKEN"],
            required_env: &["SLACK_BOT_TOKEN", "SLACK_APP_TOKEN"],
        },
        MessagingPlatformDef {
            id: "whatsapp",
            name: "WhatsApp",
            description: "Use Hermes through the bundled WhatsApp bridge.",
            docs_slug: "whatsapp",
            env_vars: &[
                "WHATSAPP_ENABLED",
                "WHATSAPP_MODE",
                "WHATSAPP_ALLOWED_USERS",
            ],
            required_env: &[],
        },
        MessagingPlatformDef {
            id: "signal",
            name: "Signal",
            description: "Connect through a signal-cli REST bridge.",
            docs_slug: "signal",
            env_vars: &["SIGNAL_HTTP_URL", "SIGNAL_ACCOUNT", "SIGNAL_ALLOWED_USERS"],
            required_env: &["SIGNAL_HTTP_URL", "SIGNAL_ACCOUNT"],
        },
        MessagingPlatformDef {
            id: "matrix",
            name: "Matrix",
            description: "Use Hermes in Matrix rooms and direct messages.",
            docs_slug: "matrix",
            env_vars: &[
                "MATRIX_HOMESERVER",
                "MATRIX_ACCESS_TOKEN",
                "MATRIX_USER_ID",
                "MATRIX_ALLOWED_USERS",
            ],
            required_env: &["MATRIX_HOMESERVER", "MATRIX_ACCESS_TOKEN", "MATRIX_USER_ID"],
        },
        MessagingPlatformDef {
            id: "mattermost",
            name: "Mattermost",
            description: "Connect Hermes to Mattermost channels and direct messages.",
            docs_slug: "mattermost",
            env_vars: &[
                "MATTERMOST_URL",
                "MATTERMOST_TOKEN",
                "MATTERMOST_ALLOWED_USERS",
            ],
            required_env: &["MATTERMOST_URL", "MATTERMOST_TOKEN"],
        },
        MessagingPlatformDef {
            id: "email",
            name: "Email",
            description: "Talk to Hermes through an IMAP/SMTP mailbox.",
            docs_slug: "email",
            env_vars: &[
                "EMAIL_ADDRESS",
                "EMAIL_PASSWORD",
                "EMAIL_IMAP_HOST",
                "EMAIL_SMTP_HOST",
            ],
            required_env: &[
                "EMAIL_ADDRESS",
                "EMAIL_PASSWORD",
                "EMAIL_IMAP_HOST",
                "EMAIL_SMTP_HOST",
            ],
        },
        MessagingPlatformDef {
            id: "sms",
            name: "SMS (Twilio)",
            description: "Send and receive text messages via Twilio.",
            docs_slug: "sms",
            env_vars: &[
                "TWILIO_ACCOUNT_SID",
                "TWILIO_AUTH_TOKEN",
                "TWILIO_PHONE_NUMBER",
            ],
            required_env: &["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"],
        },
        MessagingPlatformDef {
            id: "bluebubbles",
            name: "BlueBubbles (iMessage)",
            description: "Use Hermes through iMessage via a BlueBubbles server.",
            docs_slug: "bluebubbles",
            env_vars: &[
                "BLUEBUBBLES_SERVER_URL",
                "BLUEBUBBLES_PASSWORD",
                "BLUEBUBBLES_ALLOWED_USERS",
            ],
            required_env: &["BLUEBUBBLES_SERVER_URL", "BLUEBUBBLES_PASSWORD"],
        },
        MessagingPlatformDef {
            id: "dingtalk",
            name: "DingTalk",
            description: "Connect Hermes to DingTalk groups.",
            docs_slug: "dingtalk",
            env_vars: &["DINGTALK_CLIENT_ID", "DINGTALK_CLIENT_SECRET"],
            required_env: &["DINGTALK_CLIENT_ID", "DINGTALK_CLIENT_SECRET"],
        },
        MessagingPlatformDef {
            id: "feishu",
            name: "Feishu / Lark",
            description: "Use Hermes inside Feishu / Lark.",
            docs_slug: "feishu",
            env_vars: &[
                "FEISHU_APP_ID",
                "FEISHU_APP_SECRET",
                "FEISHU_ENCRYPT_KEY",
                "FEISHU_VERIFICATION_TOKEN",
            ],
            required_env: &["FEISHU_APP_ID", "FEISHU_APP_SECRET"],
        },
        MessagingPlatformDef {
            id: "wecom",
            name: "WeCom",
            description: "Send-only WeCom group bot via webhook.",
            docs_slug: "wecom",
            env_vars: &["WECOM_BOT_ID", "WECOM_SECRET"],
            required_env: &["WECOM_BOT_ID"],
        },
        MessagingPlatformDef {
            id: "weixin",
            name: "WeChat",
            description: "Connect a WeChat Official Account.",
            docs_slug: "weixin",
            env_vars: &["WEIXIN_ACCOUNT_ID", "WEIXIN_TOKEN", "WEIXIN_BASE_URL"],
            required_env: &["WEIXIN_ACCOUNT_ID", "WEIXIN_TOKEN"],
        },
        MessagingPlatformDef {
            id: "webhook",
            name: "Webhooks",
            description: "Receive events from GitHub, GitLab, and other webhook sources.",
            docs_slug: "webhooks",
            env_vars: &["WEBHOOK_ENABLED", "WEBHOOK_PORT", "WEBHOOK_SECRET"],
            required_env: &[],
        },
        MessagingPlatformDef {
            id: "homeassistant",
            name: "Home Assistant",
            description: "Control your smart home from Hermes via Home Assistant.",
            docs_slug: "homeassistant",
            env_vars: &["HASS_URL", "HASS_TOKEN"],
            required_env: &["HASS_URL", "HASS_TOKEN"],
        },
    ]
}

fn messaging_toolset_defs() -> Vec<(&'static str, &'static str, &'static str, &'static str)> {
    vec![
        (
            "web",
            "Web search",
            "Use the configured Hermes web/search backend.",
            "normal",
        ),
        (
            "browser",
            "Browser",
            "Use a local browser session for live web pages.",
            "normal",
        ),
        (
            "terminal",
            "Terminal",
            "Run shell commands from the messaging platform.",
            "high",
        ),
        (
            "file",
            "Files",
            "Read and write files reachable by Hermes.",
            "high",
        ),
        (
            "code_execution",
            "Code execution",
            "Run local code execution tools.",
            "high",
        ),
        (
            "vision",
            "Vision",
            "Analyze images sent through the messaging platform.",
            "normal",
        ),
        (
            "image_gen",
            "Image generation",
            "Generate images from the messaging platform.",
            "normal",
        ),
        (
            "tts",
            "Text to speech",
            "Create speech/audio responses from messages.",
            "normal",
        ),
        (
            "skills",
            "Skills",
            "List, inspect, and manage Hermes skills.",
            "normal",
        ),
        (
            "memory",
            "Memory",
            "Read and update Hermes memory.",
            "normal",
        ),
        (
            "session_search",
            "Session search",
            "Search previous Hermes sessions.",
            "normal",
        ),
        (
            "clarify",
            "Clarify",
            "Ask clarification questions before acting.",
            "normal",
        ),
        (
            "cronjob",
            "Schedules",
            "Create and manage scheduled jobs.",
            "normal",
        ),
        (
            "todo",
            "Todos",
            "Manage task lists and temporary todos.",
            "normal",
        ),
        (
            "messaging",
            "Messaging",
            "Send messages through configured platforms.",
            "normal",
        ),
        (
            "kanban",
            "Kanban",
            "Read and manage Hermes kanban tasks.",
            "normal",
        ),
        (
            "delegation",
            "Delegation",
            "Delegate work to other agents.",
            "normal",
        ),
        (
            "moa",
            "Mixture of agents",
            "Use multiple agents for consensus.",
            "normal",
        ),
    ]
}

fn default_messaging_toolsets() -> Vec<String> {
    [
        "clarify",
        "cronjob",
        "kanban",
        "memory",
        "messaging",
        "session_search",
        "skills",
        "todo",
        "tts",
        "vision",
        "web",
    ]
    .into_iter()
    .map(str::to_string)
    .collect()
}

fn build_messaging_platform(
    platform: MessagingPlatformDef,
    env: &std::collections::BTreeMap<String, String>,
    config: &str,
    gateway_running: bool,
) -> MessagingPlatformInfo {
    let configured = messaging_platform_configured(&platform, env);
    let enabled = read_platform_enabled(config, platform.id).unwrap_or(configured);
    let state = if !enabled {
        "disabled"
    } else if !configured {
        "not_configured"
    } else if gateway_running {
        "configured"
    } else {
        "gateway_stopped"
    };
    let toolsets =
        parse_platform_toolsets(config, platform.id).unwrap_or_else(default_messaging_toolsets);
    MessagingPlatformInfo {
        configured,
        description: platform.description.to_string(),
        docs_url: format!(
            "https://hermes-agent.nousresearch.com/docs/user-guide/messaging/{}/",
            platform.docs_slug
        ),
        enabled,
        env_vars: platform
            .env_vars
            .iter()
            .map(|key| {
                let value = env.get(*key).map(String::as_str).unwrap_or("");
                build_messaging_env_var(key, value, platform.required_env.contains(key))
            })
            .collect(),
        error_code: None,
        error_message: None,
        gateway_running,
        id: platform.id.to_string(),
        name: platform.name.to_string(),
        state: Some(state.to_string()),
        toolsets: messaging_toolset_defs()
            .into_iter()
            .map(|(key, label, description, risk)| MessagingToolsetInfo {
                description: description.to_string(),
                enabled: toolsets.iter().any(|item| item == key),
                key: key.to_string(),
                label: label.to_string(),
                risk: risk.to_string(),
            })
            .collect(),
        updated_at: None,
    }
}

fn build_messaging_env_var(key: &str, value: &str, required: bool) -> MessagingEnvVarInfo {
    let meta = messaging_env_def(key);
    let trimmed = value.trim();
    MessagingEnvVarInfo {
        advanced: meta.advanced,
        description: meta.description.to_string(),
        is_password: meta.is_password,
        is_set: !trimmed.is_empty(),
        key: key.to_string(),
        prompt: meta.prompt.to_string(),
        redacted_value: if trimmed.is_empty() {
            None
        } else {
            Some(mask_secret(trimmed))
        },
        required,
        url: meta.url.map(str::to_string),
    }
}

fn messaging_env_def(key: &str) -> MessagingEnvDef {
    let is_password = key.contains("TOKEN")
        || key.contains("SECRET")
        || key.contains("PASSWORD")
        || key.contains("KEY");
    let prompt = key
        .strip_suffix("_TOKEN")
        .or_else(|| key.strip_suffix("_SECRET"))
        .or_else(|| key.strip_suffix("_PASSWORD"))
        .unwrap_or(key);
    MessagingEnvDef {
        prompt: prompt.to_string(),
        description: key.to_string(),
        is_password,
        advanced: key.contains("PROXY")
            || key.contains("PORT")
            || key.contains("MODE")
            || key.contains("ALLOWED"),
        url: None,
    }
}

fn messaging_platform_configured(
    platform: &MessagingPlatformDef,
    env: &std::collections::BTreeMap<String, String>,
) -> bool {
    let has = |key: &str| env.get(key).is_some_and(|value| !value.trim().is_empty());
    match platform.id {
        "bluebubbles" => has("BLUEBUBBLES_SERVER_URL") && has("BLUEBUBBLES_PASSWORD"),
        "email" => {
            has("EMAIL_ADDRESS")
                && has("EMAIL_PASSWORD")
                && has("EMAIL_IMAP_HOST")
                && has("EMAIL_SMTP_HOST")
        }
        "signal" => has("SIGNAL_HTTP_URL") && has("SIGNAL_ACCOUNT"),
        "wecom" => has("WECOM_BOT_ID"),
        "weixin" => has("WEIXIN_ACCOUNT_ID") && has("WEIXIN_TOKEN"),
        _ => platform.required_env.iter().all(|key| has(key)),
    }
}

fn validate_messaging_platform_update(
    platform_id: &str,
    update: &MessagingPlatformUpdate,
) -> Result<(), String> {
    let Some(platform) = messaging_platform_defs()
        .into_iter()
        .find(|item| item.id == platform_id)
    else {
        return Err(format!("未知 Messaging Platform：{platform_id}"));
    };
    for key in update
        .env
        .as_ref()
        .map(|items| items.keys().cloned().collect::<Vec<_>>())
        .unwrap_or_default()
        .into_iter()
        .chain(update.clear_env.clone().unwrap_or_default())
    {
        if !platform.env_vars.contains(&key.as_str()) {
            return Err(format!(
                "{key} 不属于 {name} 的配置项。",
                name = platform.name
            ));
        }
    }
    for key in update
        .toolsets
        .as_ref()
        .map(|items| items.keys().cloned().collect::<Vec<_>>())
        .unwrap_or_default()
    {
        if !messaging_toolset_defs()
            .iter()
            .any(|(toolset, _, _, _)| *toolset == key)
        {
            return Err(format!("未知 Messaging toolset：{key}"));
        }
    }
    Ok(())
}

fn read_env_map(
    profile: Option<&str>,
) -> Result<std::collections::BTreeMap<String, String>, String> {
    let content = read_profile_file(profile, ".env")?.unwrap_or_default();
    let mut env = std::collections::BTreeMap::new();
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        if let Some((key, value)) = trimmed.split_once('=') {
            env.insert(key.trim().to_string(), unquote(value.trim()).to_string());
        }
    }
    Ok(env)
}

fn remove_env_value(profile: Option<&str>, key: &str) -> Result<(), String> {
    let existing = read_profile_file(profile, ".env")?.unwrap_or_default();
    let mut lines = Vec::new();
    for line in existing.lines() {
        let trimmed = line.trim_start();
        let matches_key = !trimmed.starts_with('#')
            && trimmed
                .split_once('=')
                .map(|(line_key, _)| line_key.trim() == key)
                .unwrap_or(false);
        if !matches_key {
            lines.push(line.to_string());
        }
    }
    let mut content = lines.join("\n");
    if !content.is_empty() {
        content.push('\n');
    }
    write_profile_file(profile, ".env", &content)
}

fn read_platform_enabled(config: &str, platform_id: &str) -> Option<bool> {
    read_nested_yaml_scalar(config, &["platforms", platform_id, "enabled"])
        .map(|value| value != "false")
}

fn set_platform_enabled(config: &str, platform_id: &str, enabled: bool) -> String {
    set_nested_platform_bool(config, "platforms", platform_id, "enabled", enabled)
}

fn set_nested_platform_bool(
    config: &str,
    root: &str,
    platform_id: &str,
    key: &str,
    value: bool,
) -> String {
    let lines: Vec<&str> = config.lines().collect();
    let root_header = format!("{root}:");
    let rendered_value = format!("    {key}: {}", if value { "true" } else { "false" });
    let Some(root_start) = lines
        .iter()
        .position(|line| line.trim_end() == root_header && !line.starts_with(' '))
    else {
        let sep = if config.is_empty() || config.ends_with('\n') {
            ""
        } else {
            "\n"
        };
        return format!("{config}{sep}{root}:\n  {platform_id}:\n{rendered_value}\n");
    };
    let mut root_end = lines.len();
    for (index, line) in lines.iter().enumerate().skip(root_start + 1) {
        if !line.trim().is_empty() && !line.starts_with(' ') {
            root_end = index;
            break;
        }
    }
    let platform_header = format!("  {platform_id}:");
    let platform_start = lines[root_start + 1..root_end]
        .iter()
        .position(|line| line.trim_end() == platform_header)
        .map(|index| root_start + 1 + index);
    let Some(platform_start) = platform_start else {
        let mut output = Vec::new();
        output.extend(lines[..root_end].iter().map(|line| (*line).to_string()));
        output.push(format!("  {platform_id}:"));
        output.push(rendered_value);
        output.extend(lines[root_end..].iter().map(|line| (*line).to_string()));
        return output.join("\n");
    };
    let mut platform_end = root_end;
    for (index, line) in lines
        .iter()
        .enumerate()
        .take(root_end)
        .skip(platform_start + 1)
    {
        if line.starts_with("  ") && !line.starts_with("    ") && !line.trim().is_empty() {
            platform_end = index;
            break;
        }
    }
    let field_prefix = format!("    {key}:");
    let field_index = lines[platform_start + 1..platform_end]
        .iter()
        .position(|line| line.trim_start().starts_with(&field_prefix))
        .map(|index| platform_start + 1 + index);
    let mut output = Vec::new();
    if let Some(field_index) = field_index {
        output.extend(lines[..field_index].iter().map(|line| (*line).to_string()));
        output.push(rendered_value);
        output.extend(
            lines[field_index + 1..]
                .iter()
                .map(|line| (*line).to_string()),
        );
    } else {
        output.extend(
            lines[..platform_start + 1]
                .iter()
                .map(|line| (*line).to_string()),
        );
        output.push(rendered_value);
        output.extend(
            lines[platform_start + 1..]
                .iter()
                .map(|line| (*line).to_string()),
        );
    }
    output.join("\n")
}

fn parse_platform_toolsets(config: &str, platform_id: &str) -> Option<Vec<String>> {
    parse_platform_toolsets_map(config).remove(platform_id)
}

fn parse_platform_toolsets_map(config: &str) -> std::collections::BTreeMap<String, Vec<String>> {
    let mut map = std::collections::BTreeMap::new();
    let mut in_root = false;
    let mut current_platform: Option<String> = None;
    for line in config.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        if trimmed == "platform_toolsets:" && !line.starts_with(' ') {
            in_root = true;
            current_platform = None;
            continue;
        }
        if in_root && !line.starts_with(' ') {
            break;
        }
        if !in_root {
            continue;
        }
        if line.starts_with("  ") && !line.starts_with("    ") && trimmed.ends_with(':') {
            let name = trimmed.trim_end_matches(':').to_string();
            map.entry(name.clone()).or_insert_with(Vec::new);
            current_platform = Some(name);
            continue;
        }
        if line.starts_with("    ") {
            if let (Some(platform), Some(value)) =
                (current_platform.as_ref(), trimmed.strip_prefix("- "))
            {
                map.entry(platform.clone())
                    .or_insert_with(Vec::new)
                    .push(unquote(value.trim()).to_string());
            }
        }
    }
    map
}

fn set_platform_toolset_enabled(
    config: &str,
    platform_id: &str,
    toolset: &str,
    enabled: bool,
) -> String {
    let mut map = parse_platform_toolsets_map(config);
    let values = map
        .entry(platform_id.to_string())
        .or_insert_with(default_messaging_toolsets);
    if enabled && !values.iter().any(|item| item == toolset) {
        values.push(toolset.to_string());
    }
    if !enabled {
        values.retain(|item| item != toolset);
    }
    values.sort();
    values.dedup();
    replace_top_level_block(config, "platform_toolsets", &render_platform_toolsets(&map))
}

fn render_platform_toolsets(map: &std::collections::BTreeMap<String, Vec<String>>) -> String {
    let mut lines = vec!["platform_toolsets:".to_string()];
    for (platform, values) in map {
        lines.push(format!("  {platform}:"));
        for value in values {
            lines.push(format!("    - {value}"));
        }
    }
    lines.join("\n")
}

fn test_local_messaging_platform_status(
    platform: &MessagingPlatformInfo,
) -> MessagingPlatformTestResponse {
    if !platform.enabled {
        return MessagingPlatformTestResponse {
            ok: false,
            state: platform.state.clone(),
            message: format!("{} 已禁用。启用后需要重启 Gateway。", platform.name),
        };
    }
    if !platform.configured {
        let missing = platform
            .env_vars
            .iter()
            .filter(|field| field.required && !field.is_set)
            .map(|field| field.key.clone())
            .collect::<Vec<_>>();
        return MessagingPlatformTestResponse {
            ok: false,
            state: platform.state.clone(),
            message: if missing.is_empty() {
                "平台配置未完成。".to_string()
            } else {
                format!("缺少必要配置：{}", missing.join(", "))
            },
        };
    }
    if !platform.gateway_running {
        return MessagingPlatformTestResponse {
            ok: false,
            state: platform.state.clone(),
            message: "Gateway 未运行。启动 Gateway 后平台配置才会被加载。".to_string(),
        };
    }
    MessagingPlatformTestResponse {
        ok: true,
        state: platform.state.clone(),
        message: format!("{} 配置完整，Gateway 已运行。", platform.name),
    }
}

fn remote_messaging_platforms(
    method: &str,
    path: &str,
    body: Option<serde_json::Value>,
    profile: Option<&str>,
) -> Result<MessagingPlatformsResponse, String> {
    let endpoint = resolve_connection_endpoint(profile, None)?;
    let body_text = body
        .map(|value| serde_json::to_string(&value))
        .transpose()
        .map_err(|error| format!("序列化 Messaging 请求失败：{error}"))?;
    let response = http_request(
        &endpoint.base_url,
        method,
        path,
        body_text.as_deref(),
        endpoint.auth.as_deref(),
    )?;
    if !(200..300).contains(&response.status) {
        return Err(format!(
            "Messaging Platform API 返回 HTTP {}：{}",
            response.status,
            truncate(&response.body, 240)
        ));
    }
    serde_json::from_str::<MessagingPlatformsResponse>(&response.body)
        .map_err(|error| format!("解析 Messaging Platform API 响应失败：{error}"))
}

fn remote_messaging_action(
    method: &str,
    path: &str,
    body: Option<serde_json::Value>,
    profile: Option<&str>,
) -> Result<serde_json::Value, String> {
    let endpoint = resolve_connection_endpoint(profile, None)?;
    let body_text = body
        .map(|value| serde_json::to_string(&value))
        .transpose()
        .map_err(|error| format!("序列化 Messaging 请求失败：{error}"))?;
    let response = http_request(
        &endpoint.base_url,
        method,
        path,
        body_text.as_deref(),
        endpoint.auth.as_deref(),
    )?;
    if !(200..300).contains(&response.status) {
        return Err(format!(
            "Messaging Platform API 返回 HTTP {}：{}",
            response.status,
            truncate(&response.body, 240)
        ));
    }
    serde_json::from_str::<serde_json::Value>(&response.body)
        .map_err(|error| format!("解析 Messaging Platform API 响应失败：{error}"))
}

fn remote_messaging_test(
    method: &str,
    path: &str,
    profile: Option<&str>,
) -> Result<MessagingPlatformTestResponse, String> {
    let value = remote_messaging_action(method, path, None, profile)?;
    serde_json::from_value::<MessagingPlatformTestResponse>(value)
        .map_err(|error| format!("解析 Messaging Platform 测试响应失败：{error}"))
}

fn provider_discovery_unsupported(provider: &str) -> bool {
    matches!(
        provider,
        "auto"
            | "google"
            | "xai"
            | "qwen"
            | "minimax"
            | "kimi-coding"
            | "openai-codex"
            | "xai-oauth"
            | "qwen-oauth"
            | "google-gemini-cli"
            | "minimax-oauth"
            | "nous"
    )
}

fn provider_can_discover_without_key(provider: &str, base_url: &str) -> bool {
    matches!(
        provider,
        "lmstudio" | "atomicchat" | "ollama" | "vllm" | "llamacpp"
    ) || (provider == "custom" && is_loopback_base_url(base_url))
}

fn is_loopback_base_url(base_url: &str) -> bool {
    let without_scheme = base_url
        .strip_prefix("http://")
        .or_else(|| base_url.strip_prefix("https://"))
        .unwrap_or(base_url);
    let host = without_scheme
        .split('/')
        .next()
        .unwrap_or("")
        .split(':')
        .next()
        .unwrap_or("")
        .to_ascii_lowercase();
    matches!(
        host.as_str(),
        "localhost" | "127.0.0.1" | "0.0.0.0" | "[::1]"
    )
}

fn provider_env_key(provider: &str, base_url: &str) -> Option<&'static str> {
    match provider {
        "openrouter" => Some("OPENROUTER_API_KEY"),
        "anthropic" => Some("ANTHROPIC_API_KEY"),
        "openai" => Some("OPENAI_API_KEY"),
        "ollama-cloud" => Some("OLLAMA_API_KEY"),
        "aimlapi" => Some("AIMLAPI_API_KEY"),
        "huggingface" => Some("HF_TOKEN"),
        "groq" => Some("GROQ_API_KEY"),
        "deepseek" => Some("DEEPSEEK_API_KEY"),
        "together" => Some("TOGETHER_API_KEY"),
        "fireworks" => Some("FIREWORKS_API_KEY"),
        "cerebras" => Some("CEREBRAS_API_KEY"),
        "atlascloud" => Some("ATLASCLOUD_API_KEY"),
        "mistral" => Some("MISTRAL_API_KEY"),
        "perplexity" => Some("PERPLEXITY_API_KEY"),
        "xiaomi" => Some("XIAOMI_API_KEY"),
        _ => env_key_for_url(base_url),
    }
}

fn env_key_for_url(base_url: &str) -> Option<&'static str> {
    let lower = base_url.to_ascii_lowercase();
    if lower.contains("openrouter.ai") {
        Some("OPENROUTER_API_KEY")
    } else if lower.contains("anthropic.com") {
        Some("ANTHROPIC_API_KEY")
    } else if lower.contains("openai.com") {
        Some("OPENAI_API_KEY")
    } else if lower.contains("ollama.com") {
        Some("OLLAMA_API_KEY")
    } else if lower.contains("api.aimlapi.com") {
        Some("AIMLAPI_API_KEY")
    } else if lower.contains("huggingface.co") {
        Some("HF_TOKEN")
    } else if lower.contains("api.groq.com") {
        Some("GROQ_API_KEY")
    } else if lower.contains("api.deepseek.com") {
        Some("DEEPSEEK_API_KEY")
    } else if lower.contains("api.together.xyz") {
        Some("TOGETHER_API_KEY")
    } else if lower.contains("api.fireworks.ai") {
        Some("FIREWORKS_API_KEY")
    } else if lower.contains("api.cerebras.ai") {
        Some("CEREBRAS_API_KEY")
    } else if lower.contains("atlascloud.ai") {
        Some("ATLASCLOUD_API_KEY")
    } else if lower.contains("api.mistral.ai") {
        Some("MISTRAL_API_KEY")
    } else if lower.contains("api.perplexity.ai") {
        Some("PERPLEXITY_API_KEY")
    } else if lower.contains("api.xiaomimimo.com") {
        Some("XIAOMI_API_KEY")
    } else {
        Some("CUSTOM_API_KEY")
    }
}

fn curl_json_get(url: &str, provider: &str, api_key: &str) -> Result<(u16, String), String> {
    let mut child = Command::new("curl")
        .arg("--config")
        .arg("-")
        .arg("--write-out")
        .arg("\n__HERMES_TEAM_STATUS__:%{http_code}")
        .env("PATH", enhanced_path())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("启动 curl 失败：{error}"))?;

    let mut config = vec![
        format!("url = \"{}\"", curl_escape(url)),
        "request = \"GET\"".to_string(),
        "max-time = 15".to_string(),
        "silent".to_string(),
        "show-error".to_string(),
        "location".to_string(),
        "header = \"Accept: application/json\"".to_string(),
    ];
    if !api_key.trim().is_empty() {
        if provider == "anthropic" {
            config.push(format!(
                "header = \"x-api-key: {}\"",
                curl_escape(api_key.trim())
            ));
            config.push("header = \"anthropic-version: 2023-06-01\"".to_string());
        } else {
            config.push(format!(
                "header = \"Authorization: Bearer {}\"",
                curl_escape(api_key.trim())
            ));
        }
    }
    {
        let stdin = child
            .stdin
            .as_mut()
            .ok_or_else(|| "无法写入 curl 配置".to_string())?;
        stdin
            .write_all(config.join("\n").as_bytes())
            .map_err(|error| format!("写入 curl 配置失败：{error}"))?;
    }

    let output = child
        .wait_with_output()
        .map_err(|error| format!("等待 curl 失败：{error}"))?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if !output.status.success() && stdout.is_empty() {
        return Err(if stderr.is_empty() {
            "curl 请求失败。".to_string()
        } else {
            stderr
        });
    }
    let marker = "\n__HERMES_TEAM_STATUS__:";
    let Some((body, raw_status)) = stdout.rsplit_once(marker) else {
        return Err("Provider 返回了无法解析的 curl 响应。".to_string());
    };
    let status = raw_status
        .trim()
        .parse::<u16>()
        .map_err(|_| format!("无法解析 Provider HTTP 状态：{raw_status}"))?;
    Ok((status, body.to_string()))
}

fn curl_escape(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}

fn parse_provider_models(body: &str) -> Vec<DiscoveredModel> {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(body) else {
        return Vec::new();
    };
    let items = value
        .get("data")
        .and_then(|item| item.as_array())
        .or_else(|| value.get("models").and_then(|item| item.as_array()));
    let mut models = items
        .into_iter()
        .flatten()
        .filter_map(|item| {
            let id = item
                .get("id")
                .or_else(|| item.get("name"))
                .and_then(|item| item.as_str())
                .map(str::trim)
                .filter(|value| !value.is_empty())?
                .to_string();
            Some(DiscoveredModel {
                id,
                context_length: extract_context_length(item),
            })
        })
        .collect::<Vec<_>>();
    models.sort_by(|left, right| left.id.cmp(&right.id));
    models.dedup_by(|left, right| left.id == right.id);
    models
}

fn extract_context_length(item: &serde_json::Value) -> Option<u64> {
    [
        item.get("context_length"),
        item.get("context_window"),
        item.get("max_context_length"),
        item.get("max_context_window_tokens"),
        item.pointer("/top_provider/context_length"),
    ]
    .into_iter()
    .flatten()
    .find_map(json_positive_u64)
}

fn json_positive_u64(value: &serde_json::Value) -> Option<u64> {
    value
        .as_u64()
        .or_else(|| {
            value
                .as_str()
                .and_then(|raw| raw.trim().parse::<u64>().ok())
        })
        .filter(|value| *value > 0)
}

fn auth_file_path(profile: Option<&str>) -> Result<PathBuf, String> {
    Ok(profile_home(profile)?.join("auth.json"))
}

fn read_auth_store(
    profile: Option<&str>,
) -> Result<serde_json::Map<String, serde_json::Value>, String> {
    let path = auth_file_path(profile)?;
    if !path.exists() {
        return Ok(serde_json::Map::new());
    }
    let content = fs::read_to_string(&path)
        .map_err(|error| format!("读取 {} 失败：{error}", path.to_string_lossy()))?;
    let value = serde_json::from_str::<serde_json::Value>(&content)
        .map_err(|error| format!("解析 {} 失败：{error}", path.to_string_lossy()))?;
    Ok(value.as_object().cloned().unwrap_or_default())
}

fn write_auth_store(
    profile: Option<&str>,
    store: &serde_json::Map<String, serde_json::Value>,
) -> Result<(), String> {
    let path = auth_file_path(profile)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("创建 {} 失败：{error}", parent.to_string_lossy()))?;
    }
    let content = serde_json::to_string_pretty(&serde_json::Value::Object(store.clone()))
        .map_err(|error| format!("序列化 auth.json 失败：{error}"))?;
    fs::write(&path, format!("{content}\n"))
        .map_err(|error| format!("写入 {} 失败：{error}", path.to_string_lossy()))
}

fn read_credential_pool(
    profile: Option<&str>,
) -> Result<std::collections::BTreeMap<String, Vec<CredentialPoolEntry>>, String> {
    Ok(auth_store_pool(&read_auth_store(profile)?))
}

fn auth_store_pool(
    store: &serde_json::Map<String, serde_json::Value>,
) -> std::collections::BTreeMap<String, Vec<CredentialPoolEntry>> {
    let mut pool = std::collections::BTreeMap::new();
    let Some(value) = store
        .get("credential_pool")
        .and_then(|value| value.as_object())
    else {
        return pool;
    };
    for (provider, entries) in value {
        let parsed =
            serde_json::from_value::<Vec<CredentialPoolEntry>>(entries.clone()).unwrap_or_default();
        pool.insert(provider.clone(), parsed);
    }
    pool
}

fn write_auth_store_pool(
    store: &mut serde_json::Map<String, serde_json::Value>,
    pool: std::collections::BTreeMap<String, Vec<CredentialPoolEntry>>,
) {
    let mut object = serde_json::Map::new();
    for (provider, entries) in pool {
        object.insert(
            provider,
            serde_json::to_value(entries).unwrap_or_else(|_| serde_json::Value::Array(Vec::new())),
        );
    }
    store.insert(
        "credential_pool".to_string(),
        serde_json::Value::Object(object),
    );
}

fn build_credential_pool_entry(
    provider: &str,
    api_key: &str,
    label: &str,
    existing: &[CredentialPoolEntry],
) -> Result<CredentialPoolEntry, String> {
    let priority = existing
        .iter()
        .filter_map(|entry| entry.priority)
        .max()
        .map(|value| value.saturating_add(1))
        .unwrap_or(0);
    Ok(CredentialPoolEntry {
        id: Some(random_hex(4)?),
        label: Some(
            label
                .trim()
                .to_string()
                .if_empty(format!("Key {}", existing.len() + 1)),
        ),
        auth_type: Some("api_key".to_string()),
        priority: Some(priority),
        source: Some("manual".to_string()),
        access_token: Some(api_key.trim().to_string()),
        refresh_token: None,
        api_key: None,
        base_url: canonical_provider_base_url(provider)
            .map(str::to_string)
            .or_else(|| Some(String::new())),
        request_count: Some(0),
        key: None,
    })
}

fn display_credential_entry(entry: CredentialPoolEntry) -> CredentialPoolDisplayEntry {
    let secret = entry
        .access_token
        .as_deref()
        .or(entry.api_key.as_deref())
        .or(entry.key.as_deref())
        .unwrap_or("");
    let id = entry_id(&entry);
    CredentialPoolDisplayEntry {
        id,
        label: entry.label.unwrap_or_else(|| "Key".to_string()),
        masked: mask_secret(secret),
        auth_type: entry.auth_type.unwrap_or_else(|| "api_key".to_string()),
        source: entry.source.unwrap_or_else(|| "manual".to_string()),
        base_url: entry.base_url.unwrap_or_default(),
    }
}

fn entry_id(entry: &CredentialPoolEntry) -> String {
    entry
        .id
        .clone()
        .or_else(|| entry.label.clone())
        .or_else(|| entry.access_token.as_ref().map(|value| mask_secret(value)))
        .unwrap_or_else(|| "entry".to_string())
}

trait EmptyStringExt {
    fn if_empty(self, fallback: String) -> String;
}

impl EmptyStringExt for String {
    fn if_empty(self, fallback: String) -> String {
        if self.is_empty() {
            fallback
        } else {
            self
        }
    }
}

fn mask_secret(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    let chars = trimmed.chars().collect::<Vec<_>>();
    if chars.len() <= 8 {
        return "••••".to_string();
    }
    let head = chars.iter().take(4).collect::<String>();
    let tail = chars
        .iter()
        .skip(chars.len().saturating_sub(4))
        .collect::<String>();
    format!("{head}••••{tail}")
}

fn is_valid_env_key(key: &str) -> bool {
    let mut chars = key.chars();
    match chars.next() {
        Some(ch) if ch.is_ascii_alphabetic() || ch == '_' => {}
        _ => return false,
    }
    chars.all(|ch| ch.is_ascii_alphanumeric() || ch == '_')
}

fn unix_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn toolset_defs() -> Vec<(&'static str, &'static str, &'static str)> {
    vec![
        ("web", "Web", "联网检索与网页内容读取"),
        ("x_search", "X Search", "X/Twitter 搜索"),
        ("browser", "Browser", "浏览器自动化"),
        ("terminal", "Terminal", "终端命令执行"),
        ("file", "File", "文件读写"),
        ("code_execution", "Code Execution", "代码执行"),
        ("computer_use", "Computer Use", "桌面应用操作"),
        ("vision", "Vision", "图像理解"),
        ("image_gen", "Image Generation", "图像生成"),
        ("video_gen", "Video Generation", "视频生成"),
        ("tts", "TTS", "语音合成"),
        ("skills", "Skills", "技能调用"),
        ("memory", "Memory", "长期记忆"),
        ("session_search", "Session Search", "历史会话检索"),
        ("clarify", "Clarify", "澄清问题"),
        ("delegation", "Delegation", "任务委派"),
        ("cronjob", "Cronjob", "定时任务"),
        ("moa", "MoA", "多模型协同"),
        ("todo", "Todo", "任务清单"),
    ]
}

fn toolset_enabled(config: &str, key: &str) -> bool {
    match parse_cli_toolsets(config) {
        Some(values) => values.iter().any(|value| value == key),
        None => true,
    }
}

fn parse_cli_toolsets(config: &str) -> Option<Vec<String>> {
    let mut saw_platform_toolsets = false;
    let mut in_platform_toolsets = false;
    let mut in_cli = false;
    let mut values = Vec::new();

    for line in config.lines() {
        let trimmed = line.trim_end();
        if trimmed.trim_start().starts_with('#') || trimmed.trim().is_empty() {
            continue;
        }
        if trimmed.trim() == "platform_toolsets:" {
            saw_platform_toolsets = true;
            in_platform_toolsets = true;
            in_cli = false;
            continue;
        }
        if in_platform_toolsets && !line.starts_with(' ') {
            break;
        }
        if !in_platform_toolsets {
            continue;
        }
        let stripped = trimmed.trim_start();
        if line.starts_with("  ") && !line.starts_with("    ") && stripped.starts_with("cli:") {
            in_cli = true;
            if stripped.contains("[]") {
                return Some(values);
            }
            continue;
        }
        if in_cli && line.starts_with("  ") && !line.starts_with("    ") && stripped.ends_with(':')
        {
            in_cli = false;
        }
        if in_cli {
            if let Some(value) = stripped.strip_prefix("- ") {
                values.push(unquote(value.trim()).to_string());
            }
        }
    }

    if saw_platform_toolsets {
        Some(values)
    } else {
        None
    }
}

fn set_cli_toolset_enabled(config: &str, key: &str, enabled: bool) -> String {
    let mut current = parse_cli_toolsets(config).unwrap_or_else(|| {
        toolset_defs()
            .into_iter()
            .map(|(item_key, _, _)| item_key.to_string())
            .collect()
    });
    if enabled && !current.iter().any(|item| item == key) {
        current.push(key.to_string());
    }
    if !enabled {
        current.retain(|item| item != key);
    }
    current.sort();
    current.dedup();
    let block = render_platform_toolsets_cli(&current);
    replace_top_level_block(config, "platform_toolsets", &block)
}

fn render_platform_toolsets_cli(keys: &[String]) -> String {
    let mut lines = vec!["platform_toolsets:".to_string(), "  cli:".to_string()];
    for key in keys {
        lines.push(format!("    - {key}"));
    }
    lines.join("\n")
}

fn replace_top_level_block(content: &str, block_name: &str, rendered: &str) -> String {
    let lines: Vec<&str> = content.lines().collect();
    let header = format!("{block_name}:");
    let Some(start) = lines
        .iter()
        .position(|line| line.trim_end() == header && !line.starts_with(' '))
    else {
        let sep = if content.is_empty() || content.ends_with('\n') {
            ""
        } else {
            "\n"
        };
        return format!("{content}{sep}{rendered}\n");
    };
    let mut end = lines.len();
    for (index, line) in lines.iter().enumerate().skip(start + 1) {
        if !line.trim().is_empty() && !line.starts_with(' ') {
            end = index;
            break;
        }
    }
    let mut output = Vec::new();
    output.extend(lines[..start].iter().map(|line| (*line).to_string()));
    output.extend(rendered.lines().map(str::to_string));
    output.extend(lines[end..].iter().map(|line| (*line).to_string()));
    output.join("\n")
}

fn parse_mcp_servers(config: &str) -> Vec<McpServerInfo> {
    let lines: Vec<&str> = config.lines().collect();
    let start = match lines.iter().position(|line| line.trim() == "mcp_servers:") {
        Some(index) => index,
        None => return Vec::new(),
    };
    let mut end = lines.len();
    for (index, line) in lines.iter().enumerate().skip(start + 1) {
        if !line.trim().is_empty() && !line.starts_with(' ') && line.contains(':') {
            end = index;
            break;
        }
    }

    let mut servers = Vec::new();
    let mut current_name = String::new();
    let mut current_lines: Vec<&str> = Vec::new();
    for line in &lines[start + 1..end] {
        let stripped = line.trim();
        let is_server = line.starts_with("  ")
            && !line.starts_with("    ")
            && stripped.ends_with(':')
            && stripped.len() > 1;
        if is_server {
            if !current_name.is_empty() {
                servers.push(parse_mcp_server_block(&current_name, &current_lines));
            }
            current_name = stripped.trim_end_matches(':').to_string();
            current_lines.clear();
            continue;
        }
        if !current_name.is_empty() {
            current_lines.push(line);
        }
    }
    if !current_name.is_empty() {
        servers.push(parse_mcp_server_block(&current_name, &current_lines));
    }
    servers
}

fn validate_mcp_input(input: &SaveMcpServerInput) -> Result<(), String> {
    let name = input.name.trim();
    if !is_valid_mcp_name(name) {
        return Err(
            "MCP server 名称只能包含字母、数字、下划线和中划线，并且必须以字母或数字开头。"
                .to_string(),
        );
    }
    match input.transport.trim() {
        "http" => {
            let url = input.url.as_deref().unwrap_or("").trim();
            if !(url.starts_with("http://") || url.starts_with("https://")) {
                return Err("HTTP MCP server 需要 http:// 或 https:// URL。".to_string());
            }
        }
        "stdio" => {
            if input.command.as_deref().unwrap_or("").trim().is_empty() {
                return Err("stdio MCP server 需要 command。".to_string());
            }
            for key in parse_env_lines(input.env.as_deref().unwrap_or("")).keys() {
                if !is_valid_env_key(key) {
                    return Err(format!("无效 env 变量名：{key}"));
                }
            }
        }
        other => return Err(format!("未知 MCP transport：{other}")),
    }
    Ok(())
}

fn is_valid_mcp_name(name: &str) -> bool {
    let mut chars = name.chars();
    match chars.next() {
        Some(ch) if ch.is_ascii_alphanumeric() => {}
        _ => return false,
    }
    chars.all(|ch| ch.is_ascii_alphanumeric() || ch == '_' || ch == '-')
}

fn upsert_mcp_server_config(content: &str, input: &SaveMcpServerInput) -> Result<String, String> {
    let rendered = render_mcp_server(input)?;
    let block = mcp_block_bounds(content);
    let lines: Vec<&str> = content.lines().collect();
    let Some((start, end)) = block else {
        let sep = if content.is_empty() || content.ends_with('\n') {
            ""
        } else {
            "\n"
        };
        return Ok(format!(
            "{content}{sep}mcp_servers:\n{}\n",
            rendered.join("\n")
        ));
    };
    let mut output = Vec::new();
    output.extend(lines[..=start].iter().map(|line| (*line).to_string()));
    let mut replaced = false;
    let servers = mcp_server_blocks(&lines[start + 1..end]);
    for (name, server_lines) in servers {
        if name == input.name.trim() {
            output.extend(rendered.clone());
            replaced = true;
        } else {
            output.extend(server_lines.into_iter().map(str::to_string));
        }
    }
    if !replaced {
        output.extend(rendered);
    }
    output.extend(lines[end..].iter().map(|line| (*line).to_string()));
    Ok(output.join("\n"))
}

fn remove_mcp_server_config(content: &str, name: &str) -> String {
    let lines: Vec<&str> = content.lines().collect();
    let Some((start, end)) = mcp_block_bounds(content) else {
        return content.to_string();
    };
    let servers = mcp_server_blocks(&lines[start + 1..end]);
    let remaining = servers
        .into_iter()
        .filter(|(server_name, _)| server_name != name)
        .collect::<Vec<_>>();
    let mut output = Vec::new();
    output.extend(lines[..start].iter().map(|line| (*line).to_string()));
    if !remaining.is_empty() {
        output.push("mcp_servers:".to_string());
        for (_, server_lines) in remaining {
            output.extend(server_lines.into_iter().map(str::to_string));
        }
    }
    output.extend(lines[end..].iter().map(|line| (*line).to_string()));
    output.join("\n").replace("\n\n\n", "\n\n")
}

fn mcp_block_bounds(content: &str) -> Option<(usize, usize)> {
    let lines: Vec<&str> = content.lines().collect();
    let start = lines
        .iter()
        .position(|line| line.trim() == "mcp_servers:")?;
    let mut end = lines.len();
    for (index, line) in lines.iter().enumerate().skip(start + 1) {
        if !line.trim().is_empty() && !line.starts_with(' ') && line.contains(':') {
            end = index;
            break;
        }
    }
    Some((start, end))
}

fn mcp_server_blocks<'a>(lines: &'a [&'a str]) -> Vec<(String, Vec<&'a str>)> {
    let mut result = Vec::new();
    let mut current_name = String::new();
    let mut current_lines = Vec::new();
    for line in lines {
        let stripped = line.trim();
        let is_server = line.starts_with("  ")
            && !line.starts_with("    ")
            && stripped.ends_with(':')
            && stripped.len() > 1;
        if is_server {
            if !current_name.is_empty() {
                result.push((current_name, current_lines));
            }
            current_name = stripped.trim_end_matches(':').to_string();
            current_lines = vec![*line];
        } else if !current_name.is_empty() {
            current_lines.push(*line);
        }
    }
    if !current_name.is_empty() {
        result.push((current_name, current_lines));
    }
    result
}

fn render_mcp_server(input: &SaveMcpServerInput) -> Result<Vec<String>, String> {
    let mut lines = vec![format!("  {}:", input.name.trim())];
    match input.transport.trim() {
        "http" => {
            lines.push(format!(
                "    url: {}",
                quote_yaml(input.url.as_deref().unwrap_or("").trim())
            ));
            if let Some(auth) = input
                .auth
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
            {
                lines.push(format!("    auth: {}", quote_yaml(auth)));
            }
        }
        "stdio" => {
            lines.push(format!(
                "    command: {}",
                quote_yaml(input.command.as_deref().unwrap_or("").trim())
            ));
            let args = parse_arg_lines(input.args.as_deref().unwrap_or(""));
            if !args.is_empty() {
                lines.push("    args:".to_string());
                for arg in args {
                    lines.push(format!("      - {}", quote_yaml(&arg)));
                }
            }
            let env = parse_env_lines(input.env.as_deref().unwrap_or(""));
            if !env.is_empty() {
                lines.push("    env:".to_string());
                for (key, value) in env {
                    lines.push(format!("      {key}: {}", quote_yaml(&value)));
                }
            }
        }
        other => return Err(format!("未知 MCP transport：{other}")),
    }
    if let Some(enabled) = input.enabled {
        lines.push(format!(
            "    enabled: {}",
            if enabled { "true" } else { "false" }
        ));
    }
    Ok(lines)
}

fn parse_arg_lines(value: &str) -> Vec<String> {
    value
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(str::to_string)
        .collect()
}

fn parse_env_lines(value: &str) -> std::collections::BTreeMap<String, String> {
    let mut env = std::collections::BTreeMap::new();
    for line in value.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if let Some((key, value)) = trimmed.split_once('=') {
            env.insert(key.trim().to_string(), value.trim().to_string());
        } else if let Some((key, value)) = trimmed.split_once(':') {
            env.insert(key.trim().to_string(), value.trim().to_string());
        }
    }
    env
}

fn parse_mcp_server_block(name: &str, lines: &[&str]) -> McpServerInfo {
    let mut url = None;
    let mut command = None;
    let mut args = Vec::new();
    let mut env = Vec::new();
    let mut enabled = true;
    let mut in_args = false;
    let mut in_env = false;

    for line in lines {
        let stripped = line.trim();
        if stripped.is_empty() || stripped.starts_with('#') {
            continue;
        }
        if line.starts_with("    ") && !line.starts_with("      ") {
            in_args = false;
            in_env = false;
            if let Some((key, raw)) = stripped.split_once(':') {
                let value = unquote(raw.trim()).to_string();
                match key.trim() {
                    "url" if !value.is_empty() => url = Some(value),
                    "command" if !value.is_empty() => command = Some(value),
                    "enabled" => enabled = value != "false",
                    "args" => {
                        in_args = true;
                        args.extend(parse_inline_list(&value));
                    }
                    "env" => in_env = true,
                    _ => {}
                }
            }
            continue;
        }
        if in_args && line.starts_with("      ") {
            if let Some(value) = stripped.strip_prefix("- ") {
                args.push(unquote(value.trim()).to_string());
            }
        }
        if in_env && line.starts_with("      ") {
            if let Some((key, _)) = stripped.split_once(':') {
                env.push(key.trim().to_string());
            }
        }
    }

    let transport = if url.is_some() {
        "http"
    } else if command.is_some() {
        "stdio"
    } else {
        "unknown"
    };
    let detail = url.clone().or_else(|| command.clone()).unwrap_or_default();
    McpServerInfo {
        name: name.to_string(),
        transport: transport.to_string(),
        enabled,
        detail,
        url,
        command,
        args,
        env,
    }
}

fn parse_inline_list(raw: &str) -> Vec<String> {
    let value = raw.trim();
    if !value.starts_with('[') || !value.ends_with(']') {
        return Vec::new();
    }
    value[1..value.len() - 1]
        .split(',')
        .map(|item| unquote(item.trim()).to_string())
        .filter(|item| !item.is_empty())
        .collect()
}

fn parse_skill_metadata(content: &str) -> (String, String) {
    if content.starts_with("---") {
        if let Some(end) = content[3..].find("---") {
            let frontmatter = &content[3..end + 3];
            return (
                frontmatter_value(frontmatter, "name").unwrap_or_default(),
                frontmatter_value(frontmatter, "description").unwrap_or_default(),
            );
        }
    }
    let name = content
        .lines()
        .find_map(|line| line.strip_prefix("# ").map(str::trim))
        .unwrap_or("")
        .to_string();
    let description = content
        .lines()
        .find(|line| {
            let trimmed = line.trim();
            !trimmed.is_empty() && !trimmed.starts_with('#') && !trimmed.starts_with("---")
        })
        .map(|line| line.trim().chars().take(160).collect())
        .unwrap_or_default();
    (name, description)
}

fn is_valid_skill_segment(value: &str) -> bool {
    let mut chars = value.chars();
    match chars.next() {
        Some(ch) if ch.is_ascii_alphanumeric() => {}
        _ => return false,
    }
    value.len() <= 96
        && chars.all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' || ch == '.')
}

fn copy_dir_recursive(source: &Path, target: &Path) -> Result<(), std::io::Error> {
    fs::create_dir_all(target)?;
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let source_path = entry.path();
        let target_path = target.join(entry.file_name());
        let file_type = entry.file_type()?;
        if file_type.is_dir() {
            copy_dir_recursive(&source_path, &target_path)?;
        } else if file_type.is_file() {
            fs::copy(&source_path, &target_path)?;
        }
    }
    Ok(())
}

fn frontmatter_value(content: &str, key: &str) -> Option<String> {
    for line in content.lines() {
        if let Some((line_key, value)) = line.split_once(':') {
            if line_key.trim() == key {
                return Some(unquote(value.trim()).to_string());
            }
        }
    }
    None
}

fn parse_memory_entries(content: &str) -> usize {
    let trimmed = content.trim();
    if trimmed.is_empty() {
        return 0;
    }
    trimmed
        .split("\n§\n")
        .filter(|entry| !entry.trim().is_empty())
        .count()
}

fn unquote(value: &str) -> &str {
    value.trim().trim_matches('"').trim_matches('\'')
}

fn truncate(value: &str, max_chars: usize) -> String {
    value.chars().take(max_chars).collect()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            app_ready,
            open_external_url,
            inspect_hermes_install,
            get_config_health,
            rerun_config_health,
            autofix_config_issue,
            list_hermes_profiles,
            create_hermes_profile,
            delete_hermes_profile,
            set_active_hermes_profile,
            list_hermes_toolsets,
            set_hermes_toolset_enabled,
            list_hermes_mcp_servers,
            save_hermes_mcp_server,
            remove_hermes_mcp_server,
            list_hermes_skills,
            search_hermes_skills,
            install_hermes_skill,
            remove_hermes_skill,
            read_hermes_memory_summary,
            read_hermes_memory_content,
            write_hermes_memory_content,
            get_app_settings,
            save_app_settings,
            get_update_status,
            set_auto_upgrade_enabled,
            check_for_app_updates,
            run_hermes_update,
            get_hermes_model_config,
            get_hermes_reasoning_effort,
            set_hermes_reasoning_effort,
            list_hermes_models,
            save_hermes_model,
            remove_hermes_model,
            activate_hermes_model,
            list_provider_keys,
            save_provider_key,
            list_credential_pool,
            add_credential_pool_entry,
            remove_credential_pool_entry,
            discover_provider_models,
            list_hermes_cron_jobs,
            create_hermes_cron_job,
            remove_hermes_cron_job,
            pause_hermes_cron_job,
            resume_hermes_cron_job,
            trigger_hermes_cron_job,
            list_messaging_platforms,
            update_messaging_platform,
            test_messaging_platform,
            load_hermes_team_state,
            save_hermes_team_state,
            load_hermes_team_sessions,
            save_hermes_team_session,
            update_hermes_team_session_title,
            delete_hermes_team_session,
            list_hermes_state_sessions,
            load_hermes_state_session,
            create_hermes_debug_dump,
            create_hermes_backup_file,
            restore_hermes_backup_file,
            list_hermes_logs,
            read_hermes_log,
            get_remote_connection_config,
            save_remote_connection_config,
            get_remote_connection_status,
            test_remote_connection,
            start_ssh_tunnel,
            stop_ssh_tunnel,
            generate_api_server_key,
            ensure_hermes_gateway,
            stop_hermes_gateway,
            probe_hermes_gateway,
            select_attachment_files,
            select_context_folder,
            stage_attachment_file,
            read_directory,
            read_file,
            read_image_file,
            open_file_in_editor,
            run_hermes_agent,
            run_hermes_agent_stream,
            cancel_hermes_task
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Hermes Team");
}
