# Event Contracts

CodexMonitor uses Tauri events for backend -> frontend streaming updates.

Frontend fanout is centralized in `src/services/events.ts`.
Backend emission is centralized in `src-tauri/src/event_sink.rs`.

## Tauri Event Names

- `app-server-event`
  - Payload: `AppServerEvent` (`src/types.ts` and `src-tauri/src/backend/events.rs`)
  - Shape: `{ workspace_id: string, message: object }`
- `terminal-output`
  - Payload: `{ workspaceId, terminalId, data }`
- `terminal-exit`
  - Payload: `{ workspaceId, terminalId }`
- `dictation-download`
  - Payload: `DictationModelStatus`
- `dictation-event`
  - Payload: `DictationEvent`
- `updater-check`
- Menu shortcut events:
  - `menu-new-agent`
  - `menu-new-worktree-agent`
  - `menu-new-clone-agent`
  - `menu-add-workspace`
  - `menu-open-settings`
  - `menu-toggle-projects-sidebar`
  - `menu-toggle-git-sidebar`
  - `menu-toggle-debug-panel`
  - `menu-toggle-terminal`
  - `menu-next-agent`
  - `menu-prev-agent`
  - `menu-next-workspace`
  - `menu-prev-workspace`
  - `menu-composer-cycle-model`
  - `menu-composer-cycle-access`
  - `menu-composer-cycle-reasoning`
  - `menu-composer-cycle-collaboration`

## App-Server Event Shape

`app-server-event` payloads wrap Codex app-server messages:

```ts
type AppServerEvent = {
  workspace_id: string;
  message: { method: string; params?: unknown; id?: string | number; result?: unknown; error?: unknown };
};
```

CodexMonitor treats the `message` object as the app-server notification/request envelope and parses:

- method: `getAppServerRawMethod(event)` in `src/utils/appServerEvents.ts`
- params: `getAppServerParams(event)` in `src/utils/appServerEvents.ts`
- request id: `getAppServerRequestId(event)` in `src/utils/appServerEvents.ts`

## Routed Methods (UI-Supported)

CodexMonitor’s current supported app-server notification methods are defined in:

- `src/utils/appServerEvents.ts` (`SUPPORTED_APP_SERVER_METHODS`)
- `docs/app-server-events.md` (expanded reference)

Routing behavior:

- Subscription + dispatch: `src/features/app/hooks/useAppServerEvents.ts`
- Thread state updates: `src/features/threads/hooks/useThreads.ts` and `src/features/threads/hooks/useThreadsReducer.ts`

## Approval / User Input Requests

Two app-server server-request families are handled explicitly:

- `*requestApproval` methods:
  - Recognized by suffix (`isApprovalRequestMethod`).
  - Requires `message.id` to be present (request id).
  - Stored in thread state and surfaced via approval UI.
  - Response path: `invoke("respond_to_server_request", { workspaceId, requestId, result })`.
- `item/tool/requestUserInput`:
  - Requires `message.id` (request id).
  - Normalized into `RequestUserInputRequest` (frontend type) with question + options shape.
  - Response path is also `respond_to_server_request`.

