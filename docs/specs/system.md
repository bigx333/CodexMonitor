# System Spec

## Product Goal

CodexMonitor is a Tauri app for orchestrating multiple Codex agent sessions across local workspaces.

Core responsibilities:

- Workspace registry (add/remove/group/sort; worktrees and clones).
- One Codex app-server session per connected workspace (local or remote-backed).
- Thread lifecycle (list/resume/fork/start/archive/compact/name).
- Turn lifecycle (start/steer/interrupt), including approvals and request-user-input.
- Secondary workflows: Git/GitHub panels, prompts library, terminal (desktop), dictation, and updates.

## Runtime Modes

CodexMonitor operates in two backend modes (configured in `AppSettings.backendMode`):

- `local`: the Tauri Rust process owns backend state and spawns local Codex app-server processes.
- `remote`: the Tauri Rust process becomes a thin proxy to a remote daemon (TCP or Orbit WS).

Mobile builds (iOS/Android) are expected to be remote-first, but the codebase keeps the same IPC shape.

## Process Model (Local Mode)

- UI: React + Vite (`src/`).
- Backend: Tauri Rust process (`src-tauri/src/lib.rs`).
- Per workspace connection:
  - Backend spawns `codex app-server` as a child process in the workspace directory.
  - Transport is stdio, with line-delimited JSON messages.
  - The backend forwards app-server notifications to the frontend via Tauri events.

Key implementation:

- Session spawn/IO + initialize handshake: `src-tauri/src/backend/app_server.rs`
- Event sink to Tauri: `src-tauri/src/event_sink.rs`

## Process Model (Remote Mode)

In `remote` backend mode:

- UI invokes the same command names (`invoke`) as in local mode.
- Backend command handlers call into `src-tauri/src/remote_backend/mod.rs` for supported methods.
- Remote backend establishes a long-lived connection to a daemon:
  - TCP: line-delimited JSON over a TCP stream, optional token auth via `auth`.
  - Orbit WS: a line-delimited JSON protocol tunneled over websocket frames.
- Remote daemon emits notifications (e.g. `app-server-event`) which the proxy re-emits as Tauri events.

Key implementation:

- Proxy connection + request/response correlation: `src-tauri/src/remote_backend/*`
- Daemon entrypoint + state + event fanout: `src-tauri/src/bin/codex_monitor_daemon.rs`

## Data Flow (Happy Path)

1. User selects a workspace.
2. UI requests workspace connect or thread list:
   - `invoke("connect_workspace")` and/or `invoke("list_threads")` via `src/services/tauri.ts`.
3. Backend ensures a workspace session exists (local) or delegates to daemon (remote).
4. UI starts/resumes a thread:
   - `invoke("start_thread")` or `invoke("resume_thread")`.
5. UI sends a user message:
   - `invoke("send_user_message")` with model/effort/access mode/images/mentions as needed.
6. Codex app-server emits notifications:
   - Backend emits `"app-server-event"` (Tauri event).
   - Frontend receives it in `src/services/events.ts` and routes it via `useAppServerEvents`.
7. Thread state updates:
   - Reducer in `src/features/threads/hooks/useThreadsReducer.ts` mutates `ThreadState`.
8. UI renders conversation items and panels.

