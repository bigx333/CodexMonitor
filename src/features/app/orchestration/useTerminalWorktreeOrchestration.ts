import { useCallback } from "react";
import type { WorkspaceInfo } from "@/types";
import { useTerminalController } from "@/features/terminal/hooks/useTerminalController";
import { useWorkspaceLaunchScript } from "@app/hooks/useWorkspaceLaunchScript";
import { useWorkspaceLaunchScripts } from "@app/hooks/useWorkspaceLaunchScripts";
import { useWorktreeSetupScript } from "@app/hooks/useWorktreeSetupScript";

type UseTerminalWorktreeOrchestrationOptions = {
  activeWorkspaceId: string | null;
  activeWorkspace: WorkspaceInfo | null;
  terminalOpen: boolean;
  openTerminal: () => void;
  closeTerminalPanel: () => void;
  handleToggleTerminal: () => void;
  updateWorkspaceSettings: Parameters<
    typeof useWorkspaceLaunchScript
  >[0]["updateWorkspaceSettings"];
  onDebug: Parameters<typeof useTerminalController>[0]["onDebug"];
};

export function useTerminalWorktreeOrchestration({
  activeWorkspaceId,
  activeWorkspace,
  terminalOpen,
  openTerminal,
  closeTerminalPanel,
  handleToggleTerminal,
  updateWorkspaceSettings,
  onDebug,
}: UseTerminalWorktreeOrchestrationOptions) {
  const {
    terminalTabs,
    activeTerminalId,
    onSelectTerminal,
    onNewTerminal,
    onCloseTerminal,
    terminalState,
    ensureTerminalWithTitle,
    restartTerminalSession,
    requestTerminalFocus,
  } = useTerminalController({
    activeWorkspaceId,
    activeWorkspace,
    terminalOpen,
    onCloseTerminalPanel: closeTerminalPanel,
    onDebug,
  });

  const ensureLaunchTerminal = useCallback(
    (workspaceId: string) => ensureTerminalWithTitle(workspaceId, "launch", "Launch"),
    [ensureTerminalWithTitle],
  );

  const openTerminalWithFocus = useCallback(() => {
    if (!activeWorkspaceId) {
      return;
    }
    requestTerminalFocus();
    openTerminal();
  }, [activeWorkspaceId, openTerminal, requestTerminalFocus]);

  const handleToggleTerminalWithFocus = useCallback(() => {
    if (!activeWorkspaceId) {
      return;
    }
    if (!terminalOpen) {
      requestTerminalFocus();
    }
    handleToggleTerminal();
  }, [
    activeWorkspaceId,
    handleToggleTerminal,
    requestTerminalFocus,
    terminalOpen,
  ]);

  const launchScriptState = useWorkspaceLaunchScript({
    activeWorkspace,
    updateWorkspaceSettings,
    openTerminal: openTerminalWithFocus,
    ensureLaunchTerminal,
    restartLaunchSession: restartTerminalSession,
    terminalState,
    activeTerminalId,
  });

  const launchScriptsState = useWorkspaceLaunchScripts({
    activeWorkspace,
    updateWorkspaceSettings,
    openTerminal: openTerminalWithFocus,
    ensureLaunchTerminal: (workspaceId, entry, title) => {
      const label = entry.label?.trim() || entry.icon;
      return ensureTerminalWithTitle(
        workspaceId,
        `launch:${entry.id}`,
        title || `Launch ${label}`,
      );
    },
    restartLaunchSession: restartTerminalSession,
    terminalState,
    activeTerminalId,
  });

  const worktreeSetupScriptState = useWorktreeSetupScript({
    ensureTerminalWithTitle,
    restartTerminalSession,
    openTerminal,
    onDebug,
  });

  const handleWorktreeCreated = useCallback(
    async (worktree: WorkspaceInfo, _parentWorkspace?: WorkspaceInfo) => {
      await worktreeSetupScriptState.maybeRunWorktreeSetupScript(worktree);
    },
    [worktreeSetupScriptState],
  );

  return {
    terminalTabs,
    activeTerminalId,
    onSelectTerminal,
    onNewTerminal,
    onCloseTerminal,
    terminalState,
    handleToggleTerminalWithFocus,
    launchScriptState,
    launchScriptsState,
    handleWorktreeCreated,
  };
}
