# Hermes Team Agent Guide

This file defines the working rules for AI coding assistants in this repository.
Read it before changing code.

## Project Purpose

Hermes Team is a Tauri desktop workspace for Hermes Agent. It keeps the real
Hermes runtime path while rebuilding the desktop experience around local
Gateway control, profile settings, chat, tools, MCP, skills, memory, session
history, attachments, context folders, and remote connections.

The current product priority is the single-agent desktop workflow. Multi-agent,
Kanban, and Office-style features may be added later as separate capabilities,
but they must not become the default chat entry or default product framing.

## Actual Capabilities

The project currently includes these implemented or partially implemented areas:

- Hermes CLI/Home/profile detection.
- Gateway probe/start/stop/log path/API key generation.
- Real Gateway chat runtime, including `/v1/runs` SSE parsing.
- Tauri event replay from backend to React for streaming UI stability.
- Reasoning, tool progress, read file, search files, skill view, terminal
  command, duration, and runtime activity display.
- Local session snapshots and active profile `state.db` history import.
- Profile create/switch/delete and profile runtime status.
- Provider/model management, API key storage, credential pools, diagnostics,
  model discovery, registry library, and auxiliary model configuration.
- Toolsets and MCP server management, MCP test, catalog browse/install.
- Installed/bundled Skills management and `SKILL.md` preview.
- Memory file editing and `state.db` memory/session statistics.
- Config Health, Appearance, Network, Gateway, Messaging, Schedules, Logs, and
  backup/diagnostic sections in Settings.
- Attachments, file preview, image preview, system-open, copy path/content, and
  add-preview-file-to-message behavior.
- Context folder binding and restoration.
- Local, remote URL, and SSH tunnel connection modes.
- Web preview via `/browse <url>`.
- Queued messages, stop, regenerate, branch, copy, and read-aloud actions.

## Migration And Product Boundaries

- Preserve real Hermes Agent behavior. Do not add mock Agent responses.
- Use the upstream desktop baseline for migrated UX/runtime behavior, but adapt
  implementation to this Tauri codebase.
- Keep single-agent chat neutral. Do not reintroduce "产品研发协作室" or product/RD
  collaboration wording as the default single-agent concept.
- Keep multi-agent orchestration behind explicit user intent or a separate
  feature surface.
- Do not copy upstream docs verbatim when they describe systems this repo does
  not have. Write the actual Hermes Team behavior.

## Source Of Truth

- Code lives in this repository.
- Design and migration documents live in `../hermes-team-design`.
- Runtime truth comes from Hermes Gateway, profile files, `state.db`, logs, and
  the desktop UI.
- If a migrated behavior is unclear, inspect the local upstream desktop checkout
  and then implement the equivalent behavior in Tauri/React/Rust.

## Before Changing Code

- Inspect existing code and nearby patterns first.
- For UI bugs, verify with Computer Use when possible.
- For runtime bugs, separate:
  - Gateway connectivity
  - `/v1/runs` or session stream behavior
  - Tauri backend parsing
  - Tauri event delivery/replay
  - React state updates
  - UI rendering
- For provider/model/MCP/settings changes, read/write real profile config files
  and preserve secrets handling.

## Runtime Rules

- Gateway-to-Tauri may be SSE; Tauri-to-React uses Tauri events. Preserve
  user-visible streaming.
- Tool/reasoning/runtime events belong under the relevant assistant response,
  not as detached standalone answers.
- Keep process details visible when available: skill names, searched patterns,
  file paths, command previews, status, errors, and durations.
- Do not hide Gateway failures behind fabricated assistant responses.
- If event delivery is flaky, preserve backend event snapshots and replay them
  into React state.
- Keep Context folder as a real runtime input, not only a UI label.

## UI Rules

- Match the migrated desktop behavior before inventing new interaction models.
- Make final answer, reasoning, tool activity, code, paths, commands, and logs
  visually distinct.
- Use real controls for real settings. Avoid placeholder panels.
- Avoid global scroll regressions in Settings and Chat.
- For long or dense responses, prefer readable Markdown rendering, code blocks,
  inline code/path chips, and stable action button placement.

## Documentation Rules

- If behavior, architecture, migration status, or verification changes, update
  `../hermes-team-design`.
- Keep code docs in this repo and design docs in `../hermes-team-design`.
- Avoid naming the upstream desktop project in document bodies. If the source
  must be referenced, put the GitHub link in a final References section.
- Keep `README.md`, `AGENTS.md`, and `CLAUDE.md` aligned with actual project
  capabilities.

## Verification

Run the smallest meaningful checks for the change.

Frontend:

```bash
npm test
npm run build
```

Rust/Tauri:

```bash
cd src-tauri
cargo test
cargo check
```

Release build:

```bash
npm run tauri:build
```

When changing chat, streaming, tool activity, reasoning display, file preview,
settings, provider/model behavior, Gateway behavior, or remote/SSH behavior,
also verify in the desktop app UI.

## Git And Safety

- Do not revert user changes unless explicitly asked.
- Keep changes scoped to the requested migration or bug fix.
- Do not commit unless the user asks.
- Do not introduce secrets into committed files.
- Do not use destructive git commands unless explicitly requested.

## References

- Hermes Agent: https://github.com/NousResearch/hermes-agent
- Upstream desktop baseline: https://github.com/fathah/hermes-desktop
