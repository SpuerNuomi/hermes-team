# Hermes Team Claude Guide

This repository uses `AGENTS.md` as the canonical project guide for AI coding
assistants. Follow `AGENTS.md` before changing code.

## Working Summary

Hermes Team is a Tauri desktop workspace for Hermes Agent. The product keeps
the real Hermes runtime path and currently focuses on the single-agent desktop
workflow: chat, streaming, reasoning/process display, tools, MCP, skills,
memory, profiles, provider/model settings, sessions, attachments, context
folders, logs, and remote/SSH connections.

Do not make multi-agent collaboration, Kanban, or Office-style views the default
chat entry unless the user explicitly asks for that scope.

## Claude-Specific Notes

- Use `AGENTS.md` as the source of truth.
- Keep code changes grounded in the existing Tauri/React/Rust implementation.
- Do not add mock Agent responses.
- Preserve visible streaming, reasoning, and tool progress.
- Keep documentation aligned with actual Hermes Team capabilities.
- Avoid naming the upstream desktop project in document bodies; keep source
  links in the final References section only.

## Common Verification

```bash
npm test
npm run build
```

For Tauri/Rust changes:

```bash
cd src-tauri
cargo test
cargo check
```

For release verification:

```bash
npm run tauri:build
```

## References

- Hermes Agent: https://github.com/NousResearch/hermes-agent
- Upstream desktop baseline: https://github.com/fathah/hermes-desktop
