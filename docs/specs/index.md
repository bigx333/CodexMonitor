# Specs

Canonical specifications for CodexMonitor’s current behavior and contracts.

These docs are meant to describe what the code does today (not proposals).

## Read Order

- `docs/specs/system.md`: runtime modes, process model, and end-to-end data flow.
- `docs/specs/contracts-tauri.md`: frontend <-> Tauri IPC surface (`invoke` commands).
- `docs/specs/contracts-daemon.md`: remote backend daemon protocol (line-delimited JSON-RPC).
- `docs/specs/events.md`: backend -> frontend event streams and app-server event routing.
- `docs/specs/storage.md`: persisted files and frontend `localStorage` keys.
- `docs/specs/safety.md`: sandboxing/approvals, file policy, remote auth, and safety constraints.

## Source Of Truth Anchors

- Frontend IPC wrapper: `src/services/tauri.ts`
- Frontend event hub: `src/services/events.ts`
- App-server event parsing: `src/utils/appServerEvents.ts`
- Tauri command registry: `src-tauri/src/lib.rs`
- Remote backend proxy: `src-tauri/src/remote_backend/mod.rs`
- Daemon entrypoint: `src-tauri/src/bin/codex_monitor_daemon.rs`
- Daemon RPC router: `src-tauri/src/bin/codex_monitor_daemon/rpc.rs`
- Shared cores: `src-tauri/src/shared/*`
- Type contracts:
  - TS: `src/types.ts`
  - Rust: `src-tauri/src/types.rs`

