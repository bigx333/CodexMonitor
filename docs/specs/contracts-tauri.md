# Tauri IPC Contract (Frontend <-> Backend)

This is the command surface invoked from the frontend (`src/services/tauri.ts`) and registered in
the backend (`src-tauri/src/lib.rs`).

Command names are the `invoke("<command>")` strings.

Types live in:

- TS: `src/types.ts`
- Rust: `src-tauri/src/types.rs`

## Settings / Config / Files

- `get_app_settings` -> `AppSettings`
- `update_app_settings` `{ settings: AppSettings }` -> `AppSettings`
- `get_codex_config_path` -> `string`
- `get_config_model` `{ workspaceId }` -> `{ model?: string | null }`
- `file_read` `{ scope, kind, workspaceId? }` -> `{ exists, content, truncated }`
  - `scope`: `"workspace" | "global"`
  - `kind`: `"agents" | "config"`
- `file_write` `{ scope, kind, workspaceId? , content }` -> `void`

## Workspaces / Worktrees / Launchers

- `list_workspaces` -> `WorkspaceInfo[]`
- `is_workspace_path_dir` `{ path }` -> `boolean`
- `add_workspace` `{ path, codex_bin? }` -> `WorkspaceInfo`
- `add_clone` `{ sourceWorkspaceId, copiesFolder, copyName }` -> `WorkspaceInfo`
- `add_worktree` `{ parentId, branch, name?, copyAgentsMd? }` -> `WorkspaceInfo`
- `worktree_setup_status` `{ workspaceId }` -> `{ shouldRun, script }`
- `worktree_setup_mark_ran` `{ workspaceId }` -> `void`
- `rename_worktree` `{ id, branch }` -> `WorkspaceInfo`
- `rename_worktree_upstream` `{ id, oldBranch, newBranch }` -> `void`
- `apply_worktree_changes` `{ workspaceId }` -> `void`
- `update_workspace_settings` `{ id, settings }` -> `WorkspaceInfo`
- `update_workspace_codex_bin` `{ id, codex_bin? }` -> `WorkspaceInfo`
- `remove_workspace` `{ id }` -> `void`
- `remove_worktree` `{ id }` -> `void`
- `connect_workspace` `{ id }` -> `void`
- `list_workspace_files` `{ workspaceId }` -> `string[]`
- `read_workspace_file` `{ workspaceId, path }` -> `{ content, truncated }`
- `open_workspace_in` `{ workspaceId, target }` -> `void`
- `get_open_app_icon` `{ workspaceId, appName }` -> `string | null` (platform-dependent)

## Threads / Turns / Reviews

- `start_thread` `{ workspaceId }` -> `any` (Codex app-server result JSON)
- `resume_thread` `{ workspaceId, threadId }` -> `any`
- `fork_thread` `{ workspaceId, threadId }` -> `any`
- `list_threads` `{ workspaceId, cursor?, limit?, sortKey? }` -> `any`
- `archive_thread` `{ workspaceId, threadId }` -> `any`
- `compact_thread` `{ workspaceId, threadId }` -> `any`
- `set_thread_name` `{ workspaceId, threadId, name }` -> `any`
- `send_user_message` `{ workspaceId, threadId, text, model?, effort?, accessMode?, images?, appMentions?, collaborationMode? }` -> `any`
- `turn_steer` `{ workspaceId, threadId, turnId, text, images?, appMentions? }` -> `any`
- `turn_interrupt` `{ workspaceId, threadId, turnId }` -> `any`
- `respond_to_server_request` `{ workspaceId, requestId, result }` -> `void`
- `start_review` `{ workspaceId, threadId, target, delivery? }` -> `any`
- `remember_approval_rule` `{ workspaceId, command: string[] }` -> `{ ok: true, rulesPath }`
- `generate_commit_message` `{ workspaceId }` -> `string`
- `generate_run_metadata` `{ workspaceId, prompt }` -> `any`

## Account / Models / Skills / Apps / MCP Status

- `model_list` `{ workspaceId }` -> `any`
- `collaboration_mode_list` `{ workspaceId }` -> `any`
- `list_mcp_server_status` `{ workspaceId, cursor?, limit? }` -> `any`
- `account_rate_limits` `{ workspaceId }` -> `any`
- `account_read` `{ workspaceId }` -> `any`
- `codex_login` `{ workspaceId }` -> `any`
- `codex_login_cancel` `{ workspaceId }` -> `any`
- `skills_list` `{ workspaceId }` -> `any`
- `apps_list` `{ workspaceId, cursor?, limit?, threadId? }` -> `any`

## Git / GitHub

- `get_git_status` `{ workspaceId }` -> `GitFileStatus[]`
- `init_git_repo` `{ workspaceId, branch, force? }` -> `void`
- `create_github_repo` `{ workspaceId, repo, visibility, branch? }` -> `void`
- `list_git_roots` `{ workspaceId, depth? }` -> `string[]`
- `get_git_diffs` `{ workspaceId }` -> `GitFileDiff[]`
- `get_git_log` `{ workspaceId, limit? }` -> `GitLogResponse`
- `get_git_commit_diff` `{ workspaceId, sha }` -> `GitCommitDiff[]`
- `get_git_remote` `{ workspaceId }` -> `{ upstream?: string | null, ahead, behind }` (shape from Rust)
- `stage_git_file` `{ workspaceId, path }` -> `void`
- `stage_git_all` `{ workspaceId }` -> `void`
- `unstage_git_file` `{ workspaceId, path }` -> `void`
- `revert_git_file` `{ workspaceId, path }` -> `void`
- `revert_git_all` `{ workspaceId }` -> `void`
- `commit_git` `{ workspaceId, message }` -> `void`
- `push_git` `{ workspaceId }` -> `void`
- `pull_git` `{ workspaceId }` -> `void`
- `fetch_git` `{ workspaceId }` -> `void`
- `sync_git` `{ workspaceId }` -> `void`
- `list_git_branches` `{ workspaceId }` -> `any`
- `checkout_git_branch` `{ workspaceId, name }` -> `void`
- `create_git_branch` `{ workspaceId, name }` -> `void`
- `get_github_issues` `{ workspaceId }` -> `GitHubIssuesResponse`
- `get_github_pull_requests` `{ workspaceId }` -> `GitHubPullRequestsResponse`
- `get_github_pull_request_diff` `{ workspaceId, prNumber }` -> `GitHubPullRequestDiff[]`
- `get_github_pull_request_comments` `{ workspaceId, prNumber }` -> `GitHubPullRequestComment[]`
- `checkout_github_pull_request` `{ workspaceId, prNumber }` -> `void`

## Prompts

- `prompts_list` `{ workspaceId }` -> `CustomPromptEntry[]`
- `prompts_create` `{ workspaceId, scope, name, description?, argumentHint?, content }` -> `CustomPromptEntry`
- `prompts_update` `{ workspaceId, path, name, description?, argumentHint?, content }` -> `CustomPromptEntry`
- `prompts_delete` `{ workspaceId, path }` -> `void`
- `prompts_move` `{ workspaceId, path, scope }` -> `CustomPromptEntry`
- `prompts_workspace_dir` `{ workspaceId }` -> `string`
- `prompts_global_dir` `{ workspaceId }` -> `string`

## Terminal (Desktop)

- `terminal_open` `{ workspaceId, terminalId, cols, rows }` -> `{ id }`
- `terminal_write` `{ workspaceId, terminalId, data }` -> `void`
- `terminal_resize` `{ workspaceId, terminalId, cols, rows }` -> `void`
- `terminal_close` `{ workspaceId, terminalId }` -> `void`

Terminal output is delivered out-of-band via events; see `docs/specs/events.md`.

## Dictation

- `dictation_model_status` -> `DictationModelStatus`
- `dictation_openai_status` -> `DictationOpenAiStatus`
- `dictation_remote_config` -> `DictationRemoteConfig`
- `dictation_download_model` `{ modelId? }` -> `DictationModelStatus` (progress via events)
- `dictation_cancel_download` `{ modelId? }` -> `DictationModelStatus`
- `dictation_remove_model` `{ modelId? }` -> `DictationModelStatus`
- `dictation_transcribe_wav` `{ wavBase64, preferredLanguage? }` -> `string`
- `dictation_request_permission` -> `boolean`
- `dictation_start` `{ preferredLanguage? }` -> `DictationSessionState` (stream via events)
- `dictation_stop` -> `DictationSessionState`
- `dictation_cancel` -> `DictationSessionState`

## Updates / Notifications / Usage

- `codex_doctor` `{ codex_bin?, codex_args? }` -> `CodexDoctorResult`
- `codex_update` `{ codex_bin?, codex_args? }` -> `CodexUpdateResult`
- `local_usage_snapshot` -> `LocalUsageSnapshot`
- `is_macos_debug_build` -> `boolean`
- `send_notification_fallback` `{ title, body }` -> `void`

## Orbit / Tailscale Helpers

- `orbit_connect_test` -> `OrbitConnectTestResult`
- `orbit_sign_in_start` -> `OrbitDeviceCodeStart`
- `orbit_sign_in_poll` `{ deviceCode }` -> `OrbitSignInPollResult`
- `orbit_sign_out` -> `OrbitSignOutResult`
- `orbit_runner_start` -> `OrbitRunnerStatus`
- `orbit_runner_stop` -> `OrbitRunnerStatus`
- `orbit_runner_status` -> `OrbitRunnerStatus`
- `tailscale_status` -> `TailscaleStatus`
- `tailscale_daemon_command_preview` -> `TailscaleDaemonCommandPreview`
- `tailscale_daemon_start` -> `TcpDaemonStatus`
- `tailscale_daemon_stop` -> `TcpDaemonStatus`
- `tailscale_daemon_status` -> `TcpDaemonStatus`

## Runtime

- `is_mobile_runtime` -> `boolean`
