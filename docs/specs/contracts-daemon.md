# Remote Backend Daemon Contract (Line-Delimited JSON-RPC)

The remote backend is a separate process that runs CodexMonitor’s backend logic and exposes a
line-delimited JSON-RPC style protocol.

It is consumed by the app-side proxy in `src-tauri/src/remote_backend/*`.

## Transports

- TCP: `RemoteBackendProvider.tcp` connects to `AppSettings.remoteBackendHost` (default `127.0.0.1:4732`).
- Orbit WS: `RemoteBackendProvider.orbit` connects to `AppSettings.orbitWsUrl` (websocket).

Both transports carry the same logical message types.

## Framing

One JSON object per line.

Requests:

```json
{"id": 1, "method": "list_workspaces", "params": {"workspaceId":"..."}}
```

Responses:

```json
{"id": 1, "result": {...}}
{"id": 1, "error": {"message": "..." }}
```

Server -> client notifications (events) omit `id`:

```json
{"method":"app-server-event","params":{...}}
```

## Auth (TCP, When Token Configured)

If the daemon is started with a token, clients must authenticate before other methods:

```json
{"id": 1, "method": "auth", "params": {"token": "..." }}
```

If the token matches, the daemon responds:

```json
{"id": 1, "result": {"ok": true}}
```

In Orbit mode, `auth` is accepted but treated as a no-op OK.

## Notifications (Daemon -> Client)

These are forwarded to the UI as Tauri events by the app-side proxy:

- `app-server-event` (params are the `AppServerEvent` payload)
- `terminal-output`
- `terminal-exit`

## Method Surface

The daemon method names match the app-side remote proxy calls (not the Codex app-server methods).

Daemon dispatch entrypoint: `src-tauri/src/bin/codex_monitor_daemon/rpc/dispatcher.rs`

### Daemon / Menu / Notifications

- `auth` `{ token }` -> `{ ok: true }` (TCP only; required when token configured)
- `ping` -> `{ ok: true }`
- `daemon_info` -> `{ name, version, pid, mode, binaryPath }`
- `daemon_shutdown` -> `{ ok: true }`
- `menu_set_accelerators` `{ updates: any[] }` -> `{ ok: true }`
- `is_macos_debug_build` -> `boolean`
- `send_notification_fallback` `{ title, body }` -> `{ ok: true }`
- `presence_heartbeat` `{ clientId, clientKind, platform?, isSupported, isFocused, isAfk, activeWorkspaceIds[] }` -> `{ ok: true }`
- `push_register_device` `{ deviceId, platform, token, label? }` -> `PushDeviceRegistration`
- `push_unregister_device` `{ deviceId }` -> `{ ok: true }`
- `push_notification_config_get` -> `{ relayUrl, hasRelayAuthToken, registeredDeviceCount }`
- `push_notification_config_patch` `{ relayUrl?, relayAuthToken? }` -> `{ relayUrl, hasRelayAuthToken, registeredDeviceCount }`
- `push_notification_state` -> `{ config, devices[], presence[] }`

### Settings / Files / Remote Connectivity Helpers

- `get_app_settings` -> `AppSettings`
- `update_app_settings` `{ settings: AppSettings }` -> `AppSettings`
- `get_codex_config_path` -> `string`
- `file_read` `{ scope, kind, workspaceId? }` -> `{ exists, content, truncated }`
- `file_write` `{ scope, kind, workspaceId?, content }` -> `{ ok: true }`
- `orbit_connect_test` -> `OrbitConnectTestResult`
- `orbit_sign_in_start` -> `OrbitDeviceCodeStart`
- `orbit_sign_in_poll` `{ deviceCode }` -> `OrbitSignInPollResult`
- `orbit_sign_out` -> `OrbitSignOutResult`

### Workspaces / Worktrees

- `list_workspaces` -> `WorkspaceInfo[]`
- `is_workspace_path_dir` `{ path }` -> `boolean`
- `add_workspace` `{ path, codex_bin? }` -> `WorkspaceInfo`
- `add_worktree` `{ parentId, branch, name?, copyAgentsMd? }` -> `WorkspaceInfo`
- `worktree_setup_status` `{ workspaceId }` -> `WorktreeSetupStatus`
- `worktree_setup_mark_ran` `{ workspaceId }` -> `{ ok: true }`
- `connect_workspace` `{ id }` -> `{ ok: true }`
- `remove_workspace` `{ id }` -> `{ ok: true }`
- `remove_worktree` `{ id }` -> `{ ok: true }`
- `rename_worktree` `{ id, branch }` -> `WorkspaceInfo`
- `rename_worktree_upstream` `{ id, oldBranch, newBranch }` -> `{ ok: true }`
- `update_workspace_settings` `{ id, settings }` -> `WorkspaceInfo`
- `update_workspace_codex_bin` `{ id, codex_bin? }` -> `WorkspaceInfo`
- `list_workspace_files` `{ workspaceId }` -> `string[]`
- `read_workspace_file` `{ workspaceId, path }` -> `{ content, truncated }`

### Codex Threads / Turns / Account / Apps

- `get_config_model` `{ workspaceId }` -> `{ model?: string | null }`
- `start_thread` `{ workspaceId }` -> `any`
- `resume_thread` `{ workspaceId, threadId }` -> `any`
- `fork_thread` `{ workspaceId, threadId }` -> `any`
- `list_threads` `{ workspaceId, cursor?, limit?, sortKey? }` -> `any`
- `list_mcp_server_status` `{ workspaceId, cursor?, limit? }` -> `any`
- `archive_thread` `{ workspaceId, threadId }` -> `any`
- `compact_thread` `{ workspaceId, threadId }` -> `any`
- `set_thread_name` `{ workspaceId, threadId, name }` -> `any`
- `send_user_message` `{ workspaceId, threadId, text, model?, effort?, accessMode?, images?, appMentions?, collaborationMode? }` -> `any`
- `turn_interrupt` `{ workspaceId, threadId, turnId }` -> `any`
- `turn_steer` `{ workspaceId, threadId, turnId, text, images?, appMentions? }` -> `any`
- `start_review` `{ workspaceId, threadId, target, delivery? }` -> `any`
- `respond_to_server_request` `{ workspaceId, requestId, result }` -> `{ ok: true }`
- `remember_approval_rule` `{ workspaceId, command: string[] }` -> `{ ok: true, rulesPath }`
- `model_list` `{ workspaceId }` -> `any`
- `collaboration_mode_list` `{ workspaceId }` -> `any`
- `account_rate_limits` `{ workspaceId }` -> `any`
- `account_read` `{ workspaceId }` -> `any`
- `codex_login` `{ workspaceId }` -> `any`
- `codex_login_cancel` `{ workspaceId }` -> `any`
- `skills_list` `{ workspaceId }` -> `any`
- `apps_list` `{ workspaceId, cursor?, limit?, threadId? }` -> `any`
- `codex_doctor` `{ codexBin?, codexArgs? }` -> `CodexDoctorResult`
- `generate_run_metadata` `{ workspaceId, prompt }` -> `any`

### Git / GitHub

- `get_git_status` `{ workspaceId }` -> `GitFileStatus[]`
- `init_git_repo` `{ workspaceId, branch, force? }` -> `any`
- `create_github_repo` `{ workspaceId, repo, visibility, branch? }` -> `any`
- `list_git_roots` `{ workspaceId, depth? }` -> `string[]`
- `get_git_diffs` `{ workspaceId }` -> `GitFileDiff[]`
- `get_git_log` `{ workspaceId, limit? }` -> `GitLogResponse`
- `get_git_commit_diff` `{ workspaceId, sha }` -> `GitCommitDiff[]`
- `get_git_remote` `{ workspaceId }` -> `any`
- `stage_git_file` `{ workspaceId, path }` -> `{ ok: true }`
- `stage_git_all` `{ workspaceId }` -> `{ ok: true }`
- `unstage_git_file` `{ workspaceId, path }` -> `{ ok: true }`
- `revert_git_file` `{ workspaceId, path }` -> `{ ok: true }`
- `revert_git_all` `{ workspaceId }` -> `{ ok: true }`
- `commit_git` `{ workspaceId, message }` -> `{ ok: true }`
- `push_git` `{ workspaceId }` -> `{ ok: true }`
- `pull_git` `{ workspaceId }` -> `{ ok: true }`
- `fetch_git` `{ workspaceId }` -> `{ ok: true }`
- `sync_git` `{ workspaceId }` -> `{ ok: true }`
- `get_github_issues` `{ workspaceId }` -> `GitHubIssuesResponse`
- `get_github_pull_requests` `{ workspaceId }` -> `GitHubPullRequestsResponse`
- `get_github_pull_request_diff` `{ workspaceId, prNumber }` -> `GitHubPullRequestDiff[]`
- `get_github_pull_request_comments` `{ workspaceId, prNumber }` -> `GitHubPullRequestComment[]`
- `checkout_github_pull_request` `{ workspaceId, prNumber }` -> `{ ok: true }`
- `list_git_branches` `{ workspaceId }` -> `any`
- `checkout_git_branch` `{ workspaceId, name }` -> `{ ok: true }`
- `create_git_branch` `{ workspaceId, name }` -> `any`
- `generate_commit_message` `{ workspaceId }` -> `string`

### Prompts

- `prompts_list` `{ workspaceId }` -> `CustomPromptEntry[]`
- `prompts_workspace_dir` `{ workspaceId }` -> `string`
- `prompts_global_dir` `{ workspaceId }` -> `string`
- `prompts_create` `{ workspaceId, scope, name, description?, argumentHint?, content }` -> `CustomPromptEntry`
- `prompts_update` `{ workspaceId, path, name, description?, argumentHint?, content }` -> `CustomPromptEntry`
- `prompts_delete` `{ workspaceId, path }` -> `{ ok: true }`
- `prompts_move` `{ workspaceId, path, scope }` -> `CustomPromptEntry`

### Dictation (Remote Helpers)

- `dictation_openai_status` -> `DictationOpenAiStatus`
- `dictation_remote_config` -> `DictationRemoteConfig`
- `dictation_transcribe_wav` `{ wavBase64, language? }` -> `string`
