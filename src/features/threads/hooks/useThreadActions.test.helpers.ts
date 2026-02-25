// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { beforeEach, vi } from "vitest";
import type { WorkspaceInfo } from "@/types";
import {
  archiveThread as archiveThreadFn,
  forkThread as forkThreadFn,
  listThreads as listThreadsFn,
  listWorkspaces as listWorkspacesFn,
  resumeThread as resumeThreadFn,
  startThread as startThreadFn,
} from "@services/tauri";
import {
  buildItemsFromThread as buildItemsFromThreadFn,
  getThreadCreatedTimestamp as getThreadCreatedTimestampFn,
  getThreadTimestamp as getThreadTimestampFn,
  isReviewingFromThread as isReviewingFromThreadFn,
  mergeThreadItems as mergeThreadItemsFn,
  previewThreadName as previewThreadNameFn,
} from "@utils/threadItems";
import { saveThreadActivity as saveThreadActivityFn } from "@threads/utils/threadStorage";
import { useThreadActions } from "./useThreadActions";

vi.mock("@services/tauri", () => ({
  startThread: vi.fn(),
  forkThread: vi.fn(),
  resumeThread: vi.fn(),
  listThreads: vi.fn(),
  listWorkspaces: vi.fn(),
  archiveThread: vi.fn(),
}));

vi.mock("@utils/threadItems", () => ({
  buildItemsFromThread: vi.fn(),
  getThreadCreatedTimestamp: vi.fn(),
  getThreadTimestamp: vi.fn(),
  isReviewingFromThread: vi.fn(),
  mergeThreadItems: vi.fn(),
  previewThreadName: vi.fn(),
}));

vi.mock("@threads/utils/threadStorage", () => ({
  saveThreadActivity: vi.fn(),
}));

export const startThread = vi.mocked(startThreadFn);
export const forkThread = vi.mocked(forkThreadFn);
export const resumeThread = vi.mocked(resumeThreadFn);
export const listThreads = vi.mocked(listThreadsFn);
export const listWorkspaces = vi.mocked(listWorkspacesFn);
export const archiveThread = vi.mocked(archiveThreadFn);

export const buildItemsFromThread = vi.mocked(buildItemsFromThreadFn);
export const getThreadCreatedTimestamp = vi.mocked(getThreadCreatedTimestampFn);
export const getThreadTimestamp = vi.mocked(getThreadTimestampFn);
export const isReviewingFromThread = vi.mocked(isReviewingFromThreadFn);
export const mergeThreadItems = vi.mocked(mergeThreadItemsFn);
export const previewThreadName = vi.mocked(previewThreadNameFn);

export const saveThreadActivity = vi.mocked(saveThreadActivityFn);

export const workspace: WorkspaceInfo = {
  id: "ws-1",
  name: "CodexMonitor",
  path: "/tmp/codex",
  connected: true,
  settings: { sidebarCollapsed: false },
};

export const workspaceTwo: WorkspaceInfo = {
  id: "ws-2",
  name: "Other",
  path: "/tmp/other",
  connected: true,
  settings: { sidebarCollapsed: false },
};

function resetUseThreadActionsMocks() {
  vi.clearAllMocks();
  listWorkspaces.mockResolvedValue([]);
  getThreadCreatedTimestamp.mockReturnValue(0);
}

beforeEach(() => {
  resetUseThreadActionsMocks();
});

export function renderActions(
  overrides?: Partial<Parameters<typeof useThreadActions>[0]>,
) {
  const dispatch = vi.fn();
  const loadedThreadsRef = { current: {} as Record<string, boolean> };
  const replaceOnResumeRef = { current: {} as Record<string, boolean> };
  const threadActivityRef = {
    current: {} as Record<string, Record<string, number>>,
  };
  const applyCollabThreadLinksFromThread = vi.fn();
  const updateThreadParent = vi.fn();
  const onSubagentThreadDetected = vi.fn();

  const args: Parameters<typeof useThreadActions>[0] = {
    dispatch,
    itemsByThread: {},
    threadsByWorkspace: {},
    activeThreadIdByWorkspace: {},
    activeTurnIdByThread: {},
    threadParentById: {},
    threadListCursorByWorkspace: {},
    threadStatusById: {},
    threadSortKey: "updated_at",
    getCustomName: () => undefined,
    threadActivityRef,
    loadedThreadsRef,
    replaceOnResumeRef,
    applyCollabThreadLinksFromThread,
    updateThreadParent,
    onSubagentThreadDetected,
    ...overrides,
  };

  const utils = renderHook(() => useThreadActions(args));

  return {
    args,
    dispatch,
    loadedThreadsRef: args.loadedThreadsRef,
    replaceOnResumeRef: args.replaceOnResumeRef,
    threadActivityRef: args.threadActivityRef,
    applyCollabThreadLinksFromThread: args.applyCollabThreadLinksFromThread,
    updateThreadParent: args.updateThreadParent,
    onSubagentThreadDetected: args.onSubagentThreadDetected,
    ...utils,
  };
}
