# Safety Spec

## Turn Sandboxing / Approval Policy

When sending a user message (turn start), the backend derives sandbox + approval policies from the
selected access mode (see `send_user_message_core` in `src-tauri/src/shared/codex_core.rs`):

- Access mode `full-access`:
  - `sandboxPolicy`: `{ type: "dangerFullAccess" }`
  - `approvalPolicy`: `"never"`
- Access mode `read-only`:
  - `sandboxPolicy`: `{ type: "readOnly" }`
  - `approvalPolicy`: `"on-request"`
- Access mode `current` (default):
  - `sandboxPolicy`: `{ type: "workspaceWrite", writableRoots: [<workspace path>], networkAccess: true }`
  - `approvalPolicy`: `"on-request"`

`thread/start` uses approval policy `"on-request"` (see `start_thread_core`).

## File Read/Write Policy

The backend only supports reading/writing a small, policy-guarded set of text files via `file_read`
and `file_write`:

- Workspace scope:
  - `AGENTS.md` at workspace root
  - Root must exist; external symlink targets are rejected
- Global scope (CODEX_HOME):
  - `AGENTS.md` (root may be missing; created on write; external symlink targets allowed)
  - `config.toml` (root may be missing; created on write; external symlink targets rejected)

Implementation:

- Policies: `src-tauri/src/files/policy.rs`
- Enforcement: `src-tauri/src/files/io.rs` + `src-tauri/src/files/ops.rs`

## Remote Backend Auth

Remote backend auth is token-based (when configured):

- App stores token in `AppSettings.remoteBackendToken`.
- TCP proxy sends `auth` with `{ token }` on connect.

Implementation:

- App proxy: `src-tauri/src/remote_backend/mod.rs`
- Daemon TCP transport: `src-tauri/src/bin/codex_monitor_daemon/transport.rs`

## Remote Disconnect Handling

If the remote connection drops:

- Pending requests are failed with `"remote backend disconnected"`.
- The app resets the cached remote client and may retry *read-only* calls.

The retry allowlist is hardcoded in `can_retry_after_disconnect` in `src-tauri/src/remote_backend/mod.rs`.

## Remote Path Normalization (WSL)

When calling remote methods that include file paths, the app normalizes WSL UNC paths to Linux
paths for the daemon:

- `\\\\wsl$\\Distro\\home\\me\\repo` -> `/home/me/repo`

Implementation:

- `normalize_path_for_remote` in `src-tauri/src/remote_backend/mod.rs`

