# Storage Spec

## Backend Persistent Files

Backend persistence uses the app data directory (`app.path().app_data_dir()` in Tauri).

### `workspaces.json`

- Path: `<app data dir>/workspaces.json`
- Written by: `src-tauri/src/storage.rs` via shared workspaces core.
- Format: pretty-printed JSON array of `WorkspaceEntry` objects (not a map).
- Loaded into memory as: `HashMap<String, WorkspaceEntry>` keyed by `WorkspaceEntry.id`.

Workspace entry contract:

- Rust: `src-tauri/src/types.rs` (`WorkspaceEntry`, `WorkspaceSettings`, `WorkspaceKind`)
- TS: `src/types.ts` (`WorkspaceInfo`, `WorkspaceSettings`, `WorkspaceKind`)

### `settings.json`

- Path: `<app data dir>/settings.json`
- Written by: `src-tauri/src/storage.rs` via `src-tauri/src/shared/settings_core.rs`.
- Format: pretty-printed JSON of `AppSettings`.

Settings are also partially mirrored into Codex config (`config.toml`) for feature flags:

- Reads/writes: `src-tauri/src/codex/config.rs` (via `src-tauri/src/shared/settings_core.rs`)

### Worktrees Folder

Worktrees created via the app live under:

- `<app data dir>/worktrees/<parent-workspace-id>/...`

Implementation:

- `src-tauri/src/shared/workspaces_core/worktree.rs`

### Worktree Setup Marker

Per-worktree marker file indicates the workspace setup script ran:

- Path: `<app data dir>/(...)/<workspace-id>/...` (see `worktree_setup_marker_path` in `src-tauri/src/shared/workspaces_core/helpers.rs`)

## Frontend `localStorage`

Local UI state is persisted in `window.localStorage`.

Keys are defined/used in:

- Panel sizes: `src/features/layout/hooks/useResizablePanels.ts`
  - `codexmonitor.sidebarWidth`
  - `codexmonitor.rightPanelWidth`
  - `codexmonitor.chatDiffSplitPositionPercent`
  - `codexmonitor.planPanelHeight`
  - `codexmonitor.terminalPanelHeight`
  - `codexmonitor.debugPanelHeight`
- Sidebar toggles: `src/features/layout/hooks/useSidebarToggles.tsx`
  - `codexmonitor.sidebarCollapsed`
  - `codexmonitor.rightPanelCollapsed`
- Workspace-group collapse state: `src/features/app/components/Sidebar.tsx`
  - `codexmonitor.collapsedGroups`
- Transparency preference: `src/features/layout/hooks/useTransparencyPreference.ts`
  - `reduceTransparency`
- Thread list sort key: `src/features/app/hooks/useThreadListSortKey.ts`
  - `codexmonitor.threadListSortKey`
- Thread-local metadata: `src/features/threads/utils/threadStorage.ts`
  - `codexmonitor.threadLastUserActivity`
  - `codexmonitor.threadCustomNames`
  - `codexmonitor.pinnedThreads`
  - `codexmonitor.threadCodexParams`
  - `codexmonitor.detachedReviewLinks`
- Composer prompt history: `src/features/composer/hooks/usePromptHistory.ts`
  - `codexmonitor.promptHistory.<key>`
- Open-app selection:
  - `OPEN_APP_STORAGE_KEY` (from `src/features/app/constants`)
