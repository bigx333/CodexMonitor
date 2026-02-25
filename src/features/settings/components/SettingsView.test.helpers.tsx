// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, vi } from "vitest";
import type { AppSettings, WorkspaceInfo } from "@/types";
import {
  connectWorkspace,
  getAgentsSettings,
  getConfigModel,
  getExperimentalFeatureList,
  getModelList,
  listWorkspaces,
} from "@services/tauri";
import { DEFAULT_COMMIT_MESSAGE_PROMPT } from "@utils/commitMessagePrompt";
import { SettingsView } from "./SettingsView";
export const SettingsViewComponent = SettingsView;

vi.mock("@tauri-apps/plugin-dialog", () => ({
  ask: vi.fn(),
  open: vi.fn(),
}));

vi.mock("@services/tauri", async () => {
  const actual = await vi.importActual<typeof import("@services/tauri")>(
    "@services/tauri",
  );
  return {
    ...actual,
    connectWorkspace: vi.fn(),
    getModelList: vi.fn(),
    getConfigModel: vi.fn(),
    getExperimentalFeatureList: vi.fn(),
    getAgentsSettings: vi.fn(),
    listWorkspaces: vi.fn(),
  };
});

export const connectWorkspaceMock = vi.mocked(connectWorkspace);
export const getConfigModelMock = vi.mocked(getConfigModel);
export const getModelListMock = vi.mocked(getModelList);
export const getExperimentalFeatureListMock = vi.mocked(getExperimentalFeatureList);
export const getAgentsSettingsMock = vi.mocked(getAgentsSettings);
export const listWorkspacesMock = vi.mocked(listWorkspaces);
connectWorkspaceMock.mockResolvedValue(undefined);
getConfigModelMock.mockResolvedValue(null);
listWorkspacesMock.mockResolvedValue([]);
getAgentsSettingsMock.mockResolvedValue({
  configPath: "/Users/me/.codex/config.toml",
  multiAgentEnabled: false,
  maxThreads: 6,
  maxDepth: 1,
  agents: [],
});

afterEach(() => {
  cleanup();
});

export const baseSettings: AppSettings = {
  codexBin: null,
  codexArgs: null,
  backendMode: "local",
  remoteBackendProvider: "tcp",
  remoteBackendHost: "127.0.0.1:4732",
  remoteBackendToken: null,
  remoteBackends: [
    {
      id: "remote-default",
      name: "Primary remote",
      provider: "tcp",
      host: "127.0.0.1:4732",
      token: null,
    },
  ],
  activeRemoteBackendId: "remote-default",
  keepDaemonRunningAfterAppClose: false,
  defaultAccessMode: "current",
  reviewDeliveryMode: "inline",
  composerModelShortcut: null,
  composerAccessShortcut: null,
  composerReasoningShortcut: null,
  composerCollaborationShortcut: null,
  interruptShortcut: null,
  newAgentShortcut: null,
  newWorktreeAgentShortcut: null,
  newCloneAgentShortcut: null,
  archiveThreadShortcut: null,
  toggleProjectsSidebarShortcut: null,
  toggleGitSidebarShortcut: null,
  branchSwitcherShortcut: null,
  toggleDebugPanelShortcut: null,
  toggleTerminalShortcut: null,
  cycleAgentNextShortcut: null,
  cycleAgentPrevShortcut: null,
  cycleWorkspaceNextShortcut: null,
  cycleWorkspacePrevShortcut: null,
  lastComposerModelId: null,
  lastComposerReasoningEffort: null,
  uiScale: 1,
  theme: "system",
  usageShowRemaining: false,
  showMessageFilePath: true,
  chatHistoryScrollbackItems: 200,
  threadTitleAutogenerationEnabled: false,
  uiFontFamily:
    'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  codeFontFamily:
    'ui-monospace, "Cascadia Mono", "Segoe UI Mono", Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  codeFontSize: 11,
  notificationSoundsEnabled: true,
  systemNotificationsEnabled: true,
  subagentSystemNotificationsEnabled: true,
  splitChatDiffView: false,
  preloadGitDiffs: true,
  gitDiffIgnoreWhitespaceChanges: false,
  commitMessagePrompt: DEFAULT_COMMIT_MESSAGE_PROMPT,
  commitMessageModelId: null,
  collaborationModesEnabled: true,
  steerEnabled: true,
  followUpMessageBehavior: "queue",
  composerFollowUpHintEnabled: true,
  pauseQueuedMessagesWhenResponseRequired: true,
  unifiedExecEnabled: true,
  experimentalAppsEnabled: false,
  personality: "friendly",
  dictationEnabled: false,
  dictationProvider: "local",
  dictationModelId: "base",
  dictationPreferredLanguage: null,
  dictationHoldKey: null,
  composerEditorPreset: "default",
  composerFenceExpandOnSpace: false,
  composerFenceExpandOnEnter: false,
  composerFenceLanguageTags: false,
  composerFenceWrapSelection: false,
  composerFenceAutoWrapPasteMultiline: false,
  composerFenceAutoWrapPasteCodeLike: false,
  composerListContinuation: false,
  composerCodeBlockCopyUseModifier: false,
  workspaceGroups: [],
  openAppTargets: [
    {
      id: "vscode",
      label: "VS Code",
      kind: "app",
      appName: "Visual Studio Code",
      command: null,
      args: [],
    },
  ],
  selectedOpenAppId: "vscode",
};

export const createDoctorResult = () => ({
  ok: true,
  codexBin: null,
  version: null,
  appServerOk: true,
  details: null,
  path: null,
  nodeOk: true,
  nodeVersion: null,
  nodeDetails: null,
});

export const createUpdateResult = () => ({
  ok: true,
  method: "brew_formula" as const,
  package: "codex",
  beforeVersion: "codex 0.0.0",
  afterVersion: "codex 0.0.1",
  upgraded: true,
  output: null,
  details: null,
});

export const renderDisplaySection = (
  options: {
    appSettings?: Partial<AppSettings>;
    reduceTransparency?: boolean;
    onUpdateAppSettings?: ComponentProps<typeof SettingsView>["onUpdateAppSettings"];
    onToggleTransparency?: ComponentProps<typeof SettingsView>["onToggleTransparency"];
  } = {},
) => {
  cleanup();
  const onUpdateAppSettings =
    options.onUpdateAppSettings ?? vi.fn().mockResolvedValue(undefined);
  const onToggleTransparency = options.onToggleTransparency ?? vi.fn();
  const props: ComponentProps<typeof SettingsView> = {
    reduceTransparency: options.reduceTransparency ?? false,
    onToggleTransparency,
    appSettings: { ...baseSettings, ...options.appSettings },
    openAppIconById: {},
    onUpdateAppSettings,
    workspaceGroups: [],
    groupedWorkspaces: [],
    ungroupedLabel: "Ungrouped",
    onClose: vi.fn(),
    onMoveWorkspace: vi.fn(),
    onDeleteWorkspace: vi.fn(),
    onCreateWorkspaceGroup: vi.fn().mockResolvedValue(null),
    onRenameWorkspaceGroup: vi.fn().mockResolvedValue(null),
    onMoveWorkspaceGroup: vi.fn().mockResolvedValue(null),
    onDeleteWorkspaceGroup: vi.fn().mockResolvedValue(null),
    onAssignWorkspaceGroup: vi.fn().mockResolvedValue(null),
    onRunDoctor: vi.fn().mockResolvedValue(createDoctorResult()),
    onUpdateWorkspaceSettings: vi.fn().mockResolvedValue(undefined),
    scaleShortcutTitle: "Scale shortcut",
    scaleShortcutText: "Use Command +/-",
    onTestNotificationSound: vi.fn(),
    onTestSystemNotification: vi.fn(),
    dictationModelStatus: null,
    onDownloadDictationModel: vi.fn(),
    onCancelDictationDownload: vi.fn(),
    onRemoveDictationModel: vi.fn(),
  };

  render(<SettingsView {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Display & Sound" }));

  return { onUpdateAppSettings, onToggleTransparency };
};

export const renderComposerSection = (
  options: {
    appSettings?: Partial<AppSettings>;
    onUpdateAppSettings?: ComponentProps<typeof SettingsView>["onUpdateAppSettings"];
  } = {},
) => {
  cleanup();
  const onUpdateAppSettings =
    options.onUpdateAppSettings ?? vi.fn().mockResolvedValue(undefined);
  const props: ComponentProps<typeof SettingsView> = {
    reduceTransparency: false,
    onToggleTransparency: vi.fn(),
    appSettings: { ...baseSettings, ...options.appSettings },
    openAppIconById: {},
    onUpdateAppSettings,
    workspaceGroups: [],
    groupedWorkspaces: [],
    ungroupedLabel: "Ungrouped",
    onClose: vi.fn(),
    onMoveWorkspace: vi.fn(),
    onDeleteWorkspace: vi.fn(),
    onCreateWorkspaceGroup: vi.fn().mockResolvedValue(null),
    onRenameWorkspaceGroup: vi.fn().mockResolvedValue(null),
    onMoveWorkspaceGroup: vi.fn().mockResolvedValue(null),
    onDeleteWorkspaceGroup: vi.fn().mockResolvedValue(null),
    onAssignWorkspaceGroup: vi.fn().mockResolvedValue(null),
    onRunDoctor: vi.fn().mockResolvedValue(createDoctorResult()),
    onUpdateWorkspaceSettings: vi.fn().mockResolvedValue(undefined),
    scaleShortcutTitle: "Scale shortcut",
    scaleShortcutText: "Use Command +/-",
    onTestNotificationSound: vi.fn(),
    onTestSystemNotification: vi.fn(),
    dictationModelStatus: null,
    onDownloadDictationModel: vi.fn(),
    onCancelDictationDownload: vi.fn(),
    onRemoveDictationModel: vi.fn(),
    initialSection: "composer",
  };

  render(<SettingsView {...props} />);
  return { onUpdateAppSettings };
};

export const renderFeaturesSection = (
  options: {
    appSettings?: Partial<AppSettings>;
    onUpdateAppSettings?: ComponentProps<typeof SettingsView>["onUpdateAppSettings"];
    experimentalFeaturesResponse?: unknown;
  } = {},
) => {
  cleanup();
  const onUpdateAppSettings =
    options.onUpdateAppSettings ?? vi.fn().mockResolvedValue(undefined);
  getExperimentalFeatureListMock.mockResolvedValue(
    (options.experimentalFeaturesResponse as Record<string, unknown>) ?? {
      data: [
        {
          name: "steer",
          stage: "stable",
          enabled: true,
          defaultEnabled: true,
          displayName: "Steer mode",
          description:
            "Send messages immediately. Use Tab to queue while a run is active.",
          announcement: null,
        },
        {
          name: "unified_exec",
          stage: "stable",
          enabled: true,
          defaultEnabled: true,
          displayName: "Background terminal",
          description: "Run long-running terminal commands in the background.",
          announcement: null,
        },
      ],
      nextCursor: null,
    },
  );
  const props: ComponentProps<typeof SettingsView> = {
    reduceTransparency: false,
    onToggleTransparency: vi.fn(),
    appSettings: { ...baseSettings, ...options.appSettings },
    openAppIconById: {},
    onUpdateAppSettings,
    workspaceGroups: [],
    groupedWorkspaces: [
      {
        id: null,
        name: "Ungrouped",
        workspaces: [workspace({ id: "w-features", name: "Features Workspace", connected: true })],
      },
    ],
    ungroupedLabel: "Ungrouped",
    onClose: vi.fn(),
    onMoveWorkspace: vi.fn(),
    onDeleteWorkspace: vi.fn(),
    onCreateWorkspaceGroup: vi.fn().mockResolvedValue(null),
    onRenameWorkspaceGroup: vi.fn().mockResolvedValue(null),
    onMoveWorkspaceGroup: vi.fn().mockResolvedValue(null),
    onDeleteWorkspaceGroup: vi.fn().mockResolvedValue(null),
    onAssignWorkspaceGroup: vi.fn().mockResolvedValue(null),
    onRunDoctor: vi.fn().mockResolvedValue(createDoctorResult()),
    onUpdateWorkspaceSettings: vi.fn().mockResolvedValue(undefined),
    scaleShortcutTitle: "Scale shortcut",
    scaleShortcutText: "Use Command +/-",
    onTestNotificationSound: vi.fn(),
    onTestSystemNotification: vi.fn(),
    dictationModelStatus: null,
    onDownloadDictationModel: vi.fn(),
    onCancelDictationDownload: vi.fn(),
    onRemoveDictationModel: vi.fn(),
    initialSection: "features",
  };

  render(<SettingsView {...props} />);
  return { onUpdateAppSettings };
};

export const workspace = (
  overrides: Omit<Partial<WorkspaceInfo>, "settings"> &
    Pick<WorkspaceInfo, "id" | "name"> & {
      settings?: Partial<WorkspaceInfo["settings"]>;
    },
): WorkspaceInfo => ({
  id: overrides.id,
  name: overrides.name,
  path: overrides.path ?? `/tmp/${overrides.id}`,
  connected: overrides.connected ?? false,
  kind: overrides.kind ?? "main",
  parentId: overrides.parentId ?? null,
  worktree: overrides.worktree ?? null,
  settings: {
    sidebarCollapsed: false,
    sortOrder: null,
    groupId: null,
    gitRoot: null,
    launchScript: null,
    launchScripts: null,
    worktreeSetupScript: null,
    ...overrides.settings,
  },
});

export const renderEnvironmentsSection = (
  options: {
    groupedWorkspaces?: ComponentProps<typeof SettingsView>["groupedWorkspaces"];
    onUpdateWorkspaceSettings?: ComponentProps<typeof SettingsView>["onUpdateWorkspaceSettings"];
  } = {},
) => {
  cleanup();
  const onUpdateWorkspaceSettings =
    options.onUpdateWorkspaceSettings ?? vi.fn().mockResolvedValue(undefined);

  const props: ComponentProps<typeof SettingsView> = {
    reduceTransparency: false,
    onToggleTransparency: vi.fn(),
    appSettings: baseSettings,
    openAppIconById: {},
    onUpdateAppSettings: vi.fn().mockResolvedValue(undefined),
    workspaceGroups: [],
    groupedWorkspaces:
      options.groupedWorkspaces ??
      [
        {
          id: null,
          name: "Ungrouped",
          workspaces: [
            workspace({
              id: "w1",
              name: "Project One",
              settings: {
                sidebarCollapsed: false,
                worktreeSetupScript: "echo one",
              },
            }),
          ],
        },
      ],
    ungroupedLabel: "Ungrouped",
    onClose: vi.fn(),
    onMoveWorkspace: vi.fn(),
    onDeleteWorkspace: vi.fn(),
    onCreateWorkspaceGroup: vi.fn().mockResolvedValue(null),
    onRenameWorkspaceGroup: vi.fn().mockResolvedValue(null),
    onMoveWorkspaceGroup: vi.fn().mockResolvedValue(null),
    onDeleteWorkspaceGroup: vi.fn().mockResolvedValue(null),
    onAssignWorkspaceGroup: vi.fn().mockResolvedValue(null),
    onRunDoctor: vi.fn().mockResolvedValue(createDoctorResult()),
    onUpdateWorkspaceSettings,
    scaleShortcutTitle: "Scale shortcut",
    scaleShortcutText: "Use Command +/-",
    onTestNotificationSound: vi.fn(),
    onTestSystemNotification: vi.fn(),
    dictationModelStatus: null,
    onDownloadDictationModel: vi.fn(),
    onCancelDictationDownload: vi.fn(),
    onRemoveDictationModel: vi.fn(),
    initialSection: "environments",
  };

  render(<SettingsView {...props} />);
  return { onUpdateWorkspaceSettings };
};
