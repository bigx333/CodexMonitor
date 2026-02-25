// @vitest-environment jsdom
import { act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceInfo } from "@/types";
import {
  getThreadTimestamp,
  listThreads,
  listWorkspaces,
  renderActions,
  workspace,
  workspaceTwo,
} from "./useThreadActions.test.helpers";

describe("useThreadActions", () => {
  it("preserves list state when requested", async () => {
    vi.mocked(listThreads).mockResolvedValue({
      result: {
        data: [],
        nextCursor: null,
      },
    });

    const { result, dispatch } = renderActions();

    await act(async () => {
      await result.current.listThreadsForWorkspace(workspace, {
        preserveState: true,
      });
    });

    expect(dispatch).not.toHaveBeenCalledWith({
      type: "setThreadListLoading",
      workspaceId: "ws-1",
      isLoading: true,
    });
  });

  it("requests created_at sorting when provided", async () => {
    vi.mocked(listThreads).mockResolvedValue({
      result: {
        data: [],
        nextCursor: null,
      },
    });

    const { result } = renderActions({ threadSortKey: "created_at" });

    await act(async () => {
      await result.current.listThreadsForWorkspace(workspace);
    });

    expect(listThreads).toHaveBeenCalledWith(
      "ws-1",
      null,
      100,
      "created_at",
    );
  });

  it("loads older threads when a cursor is available", async () => {
    vi.mocked(listThreads).mockResolvedValue({
      result: {
        data: [
          {
            id: "thread-2",
            cwd: "/tmp/codex",
            preview: "Older preview",
            updated_at: 4000,
          },
        ],
        nextCursor: null,
      },
    });
    vi.mocked(getThreadTimestamp).mockImplementation((thread) => {
      const value = (thread as Record<string, unknown>).updated_at as number;
      return value ?? 0;
    });

    const { result, dispatch } = renderActions({
      threadsByWorkspace: {
        "ws-1": [{ id: "thread-1", name: "Agent 1", updatedAt: 6000 }],
      },
      threadListCursorByWorkspace: { "ws-1": "cursor-1" },
    });

    await act(async () => {
      await result.current.loadOlderThreadsForWorkspace(workspace);
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: "setThreadListPaging",
      workspaceId: "ws-1",
      isLoading: true,
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "setThreads",
      workspaceId: "ws-1",
      sortKey: "updated_at",
      threads: [
        { id: "thread-1", name: "Agent 1", updatedAt: 6000 },
        { id: "thread-2", name: "Older preview", updatedAt: 4000, createdAt: 0 },
      ],
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "setThreadListCursor",
      workspaceId: "ws-1",
      cursor: null,
    });
  });

  it("supports snake_case next_cursor when loading older threads", async () => {
    vi.mocked(listThreads).mockResolvedValue({
      result: {
        data: [
          {
            id: "thread-2",
            cwd: "/tmp/codex",
            preview: "Older preview",
            updated_at: 4000,
          },
        ],
        next_cursor: "cursor-legacy-next",
      },
    });
    vi.mocked(getThreadTimestamp).mockImplementation((thread) => {
      const value = (thread as Record<string, unknown>).updated_at as number;
      return value ?? 0;
    });

    const { result, dispatch } = renderActions({
      threadsByWorkspace: {
        "ws-1": [{ id: "thread-1", name: "Agent 1", updatedAt: 6000 }],
      },
      threadListCursorByWorkspace: { "ws-1": "cursor-1" },
    });

    await act(async () => {
      await result.current.loadOlderThreadsForWorkspace(workspace);
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: "setThreadListCursor",
      workspaceId: "ws-1",
      cursor: "cursor-legacy-next",
    });
  });

  it("treats page-start cursor marker as null when loading older threads", async () => {
    vi.mocked(listThreads).mockResolvedValue({
      result: {
        data: [],
        nextCursor: null,
      },
    });

    const { result } = renderActions({
      threadsByWorkspace: {
        "ws-1": [{ id: "thread-1", name: "Agent 1", updatedAt: 6000 }],
      },
      threadListCursorByWorkspace: {
        "ws-1": "__codex_monitor_page_start__",
      },
    });

    await act(async () => {
      await result.current.loadOlderThreadsForWorkspace(workspace);
    });

    expect(listThreads).toHaveBeenCalledWith(
      "ws-1",
      null,
      100,
      "updated_at",
    );
  });

  it("matches windows workspace threads when loading older threads", async () => {
    const windowsWorkspace: WorkspaceInfo = {
      ...workspace,
      path: "C:\\Dev\\CodexMon",
    };
    vi.mocked(listThreads).mockResolvedValue({
      result: {
        data: [
          {
            id: "thread-win-older",
            cwd: "c:/dev/codexmon",
            preview: "Older windows preview",
            updated_at: 4000,
          },
        ],
        nextCursor: null,
      },
    });
    vi.mocked(getThreadTimestamp).mockImplementation((thread) => {
      const value = (thread as Record<string, unknown>).updated_at as number;
      return value ?? 0;
    });

    const { result, dispatch } = renderActions({
      threadsByWorkspace: {
        "ws-1": [{ id: "thread-1", name: "Agent 1", updatedAt: 6000 }],
      },
      threadListCursorByWorkspace: { "ws-1": "cursor-1" },
    });

    await act(async () => {
      await result.current.loadOlderThreadsForWorkspace(windowsWorkspace);
    });

    expect(listThreads).toHaveBeenCalledWith(
      "ws-1",
      "cursor-1",
      100,
      "updated_at",
    );
    expect(dispatch).toHaveBeenCalledWith({
      type: "setThreads",
      workspaceId: "ws-1",
      sortKey: "updated_at",
      threads: [
        { id: "thread-1", name: "Agent 1", updatedAt: 6000 },
        {
          id: "thread-win-older",
          name: "Older windows preview",
          updatedAt: 4000,
          createdAt: 0,
        },
      ],
    });
  });

  it("matches nested workspace threads when loading older threads", async () => {
    vi.mocked(listThreads).mockResolvedValue({
      result: {
        data: [
          {
            id: "thread-nested-older",
            cwd: "/tmp/codex/subdir/project",
            preview: "Nested older preview",
            updated_at: 4000,
          },
        ],
        nextCursor: null,
      },
    });
    vi.mocked(getThreadTimestamp).mockImplementation((thread) => {
      const value = (thread as Record<string, unknown>).updated_at as number;
      return value ?? 0;
    });

    const { result, dispatch } = renderActions({
      threadsByWorkspace: {
        "ws-1": [{ id: "thread-1", name: "Agent 1", updatedAt: 6000 }],
      },
      threadListCursorByWorkspace: { "ws-1": "cursor-1" },
    });

    await act(async () => {
      await result.current.loadOlderThreadsForWorkspace(workspace);
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: "setThreads",
      workspaceId: "ws-1",
      sortKey: "updated_at",
      threads: [
        { id: "thread-1", name: "Agent 1", updatedAt: 6000 },
        {
          id: "thread-nested-older",
          name: "Nested older preview",
          updatedAt: 4000,
          createdAt: 0,
        },
      ],
    });
  });

  it("does not absorb child-workspace threads when loading older threads", async () => {
    const parentWorkspace: WorkspaceInfo = {
      ...workspace,
      id: "ws-parent",
      path: "/tmp/codex",
    };
    const childWorkspace: WorkspaceInfo = {
      ...workspaceTwo,
      id: "ws-child",
      path: "/tmp/codex/subdir",
    };
    vi.mocked(listWorkspaces).mockResolvedValue([parentWorkspace, childWorkspace]);
    vi.mocked(listThreads).mockResolvedValue({
      result: {
        data: [
          {
            id: "thread-child-only",
            cwd: "/tmp/codex/subdir/project",
            preview: "Child workspace thread",
            updated_at: 4000,
          },
        ],
        nextCursor: null,
      },
    });
    vi.mocked(getThreadTimestamp).mockImplementation((thread) => {
      const value = (thread as Record<string, unknown>).updated_at as number;
      return value ?? 0;
    });

    const { result, dispatch } = renderActions({
      threadsByWorkspace: {
        "ws-parent": [{ id: "thread-parent", name: "Parent", updatedAt: 6000 }],
      },
      threadListCursorByWorkspace: { "ws-parent": "cursor-1" },
    });

    await act(async () => {
      await result.current.loadOlderThreadsForWorkspace(parentWorkspace);
    });

    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: "setThreads",
        workspaceId: "ws-parent",
      }),
    );
    expect(dispatch).toHaveBeenCalledWith({
      type: "setThreadListCursor",
      workspaceId: "ws-parent",
      cursor: null,
    });
  });

});
