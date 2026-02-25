import { useCallback } from "react";
import type { WorkspaceInfo } from "@/types";
import { useGitBranches } from "@/features/git/hooks/useGitBranches";
import { useBranchSwitcher } from "@/features/git/hooks/useBranchSwitcher";
import { useBranchSwitcherShortcut } from "@/features/git/hooks/useBranchSwitcherShortcut";
import { useGitActions } from "@/features/git/hooks/useGitActions";
import { useInitGitRepoPrompt } from "@/features/git/hooks/useInitGitRepoPrompt";
import { useGitRootSelection } from "@app/hooks/useGitRootSelection";

type UseGitWorkspaceOrchestrationOptions = {
  activeWorkspace: WorkspaceInfo | null;
  branchSwitcherShortcut: string | null;
  setActiveWorkspaceId: Parameters<typeof useBranchSwitcher>[0]["setActiveWorkspaceId"];
  updateWorkspaceSettings: Parameters<
    typeof useGitRootSelection
  >[0]["updateWorkspaceSettings"];
  clearGitRootCandidates: Parameters<
    typeof useGitActions
  >[0]["onClearGitRootCandidates"];
  refreshGitStatus: Parameters<typeof useGitActions>[0]["onRefreshGitStatus"];
  refreshGitDiffs: Parameters<typeof useGitActions>[0]["onRefreshGitDiffs"];
  refreshGitLog: () => void;
  refreshGitRemote: Parameters<typeof useInitGitRepoPrompt>[0]["refreshGitRemote"];
  gitStatusBranchName: string | null;
  gitStatusError: string | null;
  gitChangedFilesCount: number;
  onDebug: Parameters<typeof useGitBranches>[0]["onDebug"];
  onError: NonNullable<Parameters<typeof useGitActions>[0]["onError"]>;
};

export function useGitWorkspaceOrchestration({
  activeWorkspace,
  branchSwitcherShortcut,
  setActiveWorkspaceId,
  updateWorkspaceSettings,
  clearGitRootCandidates,
  refreshGitStatus,
  refreshGitDiffs,
  refreshGitLog,
  refreshGitRemote,
  gitStatusBranchName,
  gitStatusError,
  gitChangedFilesCount,
  onDebug,
  onError,
}: UseGitWorkspaceOrchestrationOptions) {
  const { branches, checkoutBranch, checkoutPullRequest, createBranch } = useGitBranches({
    activeWorkspace,
    onDebug,
  });

  const handleCheckoutBranch = useCallback(
    async (name: string) => {
      await checkoutBranch(name);
      refreshGitStatus();
    },
    [checkoutBranch, refreshGitStatus],
  );

  const handleCheckoutPullRequest = useCallback(
    async (prNumber: number) => {
      try {
        await checkoutPullRequest(prNumber);
        await Promise.resolve(refreshGitStatus());
        await Promise.resolve(refreshGitLog());
      } catch (error) {
        onError(error);
      }
    },
    [checkoutPullRequest, onError, refreshGitLog, refreshGitStatus],
  );

  const handleCreateBranch = useCallback(
    async (name: string) => {
      await createBranch(name);
      refreshGitStatus();
    },
    [createBranch, refreshGitStatus],
  );

  const currentBranch = gitStatusBranchName ?? null;

  const {
    branchSwitcher,
    openBranchSwitcher,
    closeBranchSwitcher,
    handleBranchSelect,
  } = useBranchSwitcher({
    activeWorkspace,
    checkoutBranch: handleCheckoutBranch,
    setActiveWorkspaceId,
  });

  const isBranchSwitcherEnabled =
    Boolean(activeWorkspace?.connected) && activeWorkspace?.kind !== "worktree";
  useBranchSwitcherShortcut({
    shortcut: branchSwitcherShortcut,
    isEnabled: isBranchSwitcherEnabled,
    onTrigger: openBranchSwitcher,
  });

  const {
    applyWorktreeChanges: handleApplyWorktreeChanges,
    createGitHubRepo: handleCreateGitHubRepo,
    createGitHubRepoLoading,
    initGitRepo: handleInitGitRepo,
    initGitRepoLoading,
    revertAllGitChanges: handleRevertAllGitChanges,
    revertGitFile: handleRevertGitFile,
    stageGitAll: handleStageGitAll,
    stageGitFile: handleStageGitFile,
    unstageGitFile: handleUnstageGitFile,
    worktreeApplyError,
    worktreeApplyLoading,
    worktreeApplySuccess,
  } = useGitActions({
    activeWorkspace,
    onRefreshGitStatus: refreshGitStatus,
    onRefreshGitDiffs: refreshGitDiffs,
    onClearGitRootCandidates: clearGitRootCandidates,
    onError,
  });

  const {
    initGitRepoPrompt,
    openInitGitRepoPrompt,
    handleInitGitRepoPromptBranchChange,
    handleInitGitRepoPromptCreateRemoteChange,
    handleInitGitRepoPromptRepoNameChange,
    handleInitGitRepoPromptPrivateChange,
    handleInitGitRepoPromptCancel,
    handleInitGitRepoPromptConfirm,
  } = useInitGitRepoPrompt({
    activeWorkspace,
    initGitRepo: handleInitGitRepo,
    createGitHubRepo: handleCreateGitHubRepo,
    refreshGitRemote,
    isBusy: initGitRepoLoading || createGitHubRepoLoading,
  });

  const { activeGitRoot, handleSetGitRoot, handlePickGitRoot } = useGitRootSelection({
    activeWorkspace,
    updateWorkspaceSettings,
    clearGitRootCandidates: clearGitRootCandidates ?? (() => {}),
    refreshGitStatus,
  });

  const fileStatus =
    gitStatusError
      ? "Git status unavailable"
      : gitChangedFilesCount > 0
        ? `${gitChangedFilesCount} file${
            gitChangedFilesCount === 1 ? "" : "s"
          } changed`
        : "Working tree clean";

  return {
    branches,
    handleCheckoutBranch,
    handleCheckoutPullRequest,
    handleCreateBranch,
    currentBranch,
    branchSwitcher,
    openBranchSwitcher,
    closeBranchSwitcher,
    handleBranchSelect,
    handleApplyWorktreeChanges,
    handleCreateGitHubRepo,
    createGitHubRepoLoading,
    handleInitGitRepo,
    initGitRepoLoading,
    handleRevertAllGitChanges,
    handleRevertGitFile,
    handleStageGitAll,
    handleStageGitFile,
    handleUnstageGitFile,
    worktreeApplyError,
    worktreeApplyLoading,
    worktreeApplySuccess,
    initGitRepoPrompt,
    openInitGitRepoPrompt,
    handleInitGitRepoPromptBranchChange,
    handleInitGitRepoPromptCreateRemoteChange,
    handleInitGitRepoPromptRepoNameChange,
    handleInitGitRepoPromptPrivateChange,
    handleInitGitRepoPromptCancel,
    handleInitGitRepoPromptConfirm,
    activeGitRoot,
    handleSetGitRoot,
    handlePickGitRoot,
    fileStatus,
  };
}
