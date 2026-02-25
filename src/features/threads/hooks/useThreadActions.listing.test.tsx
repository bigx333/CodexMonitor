// @vitest-environment jsdom
import { act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  getThreadTimestamp,
  listThreads,
  renderActions,
  saveThreadActivity,
  workspace,
  workspaceTwo,
} from "./useThreadActions.test.helpers";

describe("useThreadActions", () => {
  it("lists threads for a workspace and persists activity", async () => {
    vi.mocked(listThreads).mockResolvedValue({
      result: {
        data: [
          {
            id: "thread-1",
            cwd: "/tmp/codex",
            preview: "Remote preview",
            updated_at: 5000,
          },
          {
            id: "thread-2",
            cwd: "/other",
            preview: "Ignore",
            updated_at: 7000,
          },
        ],
        nextCursor: "cursor-1",
      },
    });
    vi.mocked(getThreadTimestamp).mockImplementation((thread) => {
      const value = (thread as Record<string, unknown>).updated_at as number;
      return value ?? 0;
    });

    const { result, dispatch, threadActivityRef } = renderActions({
      getCustomName: (workspaceId, threadId) =>
        workspaceId === "ws-1" && threadId === "thread-1" ? "Custom" : undefined,
      threadActivityRef: { current: {} },
    });

    await act(async () => {
      await result.current.listThreadsForWorkspace(workspace);
    });

    expect(listThreads).toHaveBeenCalledWith(
      "ws-1",
      null,
      100,
      "updated_at",
    );
    expect(dispatch).toHaveBeenCalledWith({
      type: "setThreadListLoading",
      workspaceId: "ws-1",
      isLoading: true,
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "setThreads",
      workspaceId: "ws-1",
      sortKey: "updated_at",
      preserveAnchors: true,
      threads: [
        {
          id: "thread-1",
          name: "Custom",
          updatedAt: 5000,
          createdAt: 0,
        },
      ],
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "setThreadListCursor",
      workspaceId: "ws-1",
      cursor: "cursor-1",
    });
    expect(saveThreadActivity).toHaveBeenCalledWith({
      "ws-1": { "thread-1": 5000 },
    });
    expect(threadActivityRef.current).toEqual({
      "ws-1": { "thread-1": 5000 },
    });
  });

  it("uses fresh fetched data for active anchors outside top thread target", async () => {
    const data = Array.from({ length: 21 }, (_, index) => ({
      id: `thread-${index + 1}`,
      cwd: workspace.path,
      preview: `Thread ${index + 1} fresh`,
      updated_at: 5000 - index,
    }));
    vi.mocked(listThreads).mockResolvedValue({
      result: {
        data,
        nextCursor: null,
      },
    });
    vi.mocked(getThreadTimestamp).mockImplementation((thread) => {
      const value = (thread as Record<string, unknown>).updated_at as number;
      return value ?? 0;
    });

    const { result, dispatch } = renderActions({
      threadsByWorkspace: {
        "ws-1": [{ id: "thread-21", name: "Thread 21 stale", updatedAt: 10 }],
      },
      activeThreadIdByWorkspace: { "ws-1": "thread-21" },
    });

    await act(async () => {
      await result.current.listThreadsForWorkspace(workspace);
    });

    const setThreadsAction = dispatch.mock.calls
      .map(([action]) => action)
      .find(
        (action) => action.type === "setThreads" && action.workspaceId === "ws-1",
      );
    expect(setThreadsAction).toBeTruthy();
    if (!setThreadsAction || setThreadsAction.type !== "setThreads") {
      return;
    }
    expect(setThreadsAction.threads).toHaveLength(21);
    expect(setThreadsAction.threads[20]?.id).toBe("thread-21");
    expect(setThreadsAction.threads[20]?.name).toBe("Thread 21 fresh");
    expect(setThreadsAction.threads[20]?.updatedAt).toBe(4980);
  });

  it("lists threads once and distributes results across workspaces", async () => {
    vi.mocked(listThreads).mockResolvedValue({
      result: {
        data: [
          {
            id: "thread-1",
            cwd: "/tmp/codex",
            preview: "WS1 thread",
            updated_at: 5000,
          },
          {
            id: "thread-2",
            cwd: "/tmp/other",
            preview: "WS2 thread",
            updated_at: 4500,
          },
        ],
        nextCursor: null,
      },
    });
    vi.mocked(getThreadTimestamp).mockImplementation((thread) => {
      const value = (thread as Record<string, unknown>).updated_at as number;
      return value ?? 0;
    });

    const { result, dispatch } = renderActions();

    await act(async () => {
      await result.current.listThreadsForWorkspaces([workspace, workspaceTwo]);
    });

    expect(listThreads).toHaveBeenCalledTimes(1);
    expect(listThreads).toHaveBeenCalledWith("ws-1", null, 100, "updated_at");
    expect(dispatch).toHaveBeenCalledWith({
      type: "setThreads",
      workspaceId: "ws-1",
      sortKey: "updated_at",
      preserveAnchors: true,
      threads: [
        {
          id: "thread-1",
          name: "WS1 thread",
          updatedAt: 5000,
          createdAt: 0,
        },
      ],
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "setThreads",
      workspaceId: "ws-2",
      sortKey: "updated_at",
      preserveAnchors: true,
      threads: [
        {
          id: "thread-2",
          name: "WS2 thread",
          updatedAt: 4500,
          createdAt: 0,
        },
      ],
    });
  });

  it("fetches multiple pages by default", async () => {
    vi.mocked(listThreads)
      .mockResolvedValueOnce({
        result: {
          data: [
            {
              id: "thread-1",
              cwd: "/tmp/codex",
              preview: "First page",
              updated_at: 5000,
            },
          ],
          nextCursor: "cursor-1",
        },
      })
      .mockResolvedValueOnce({
        result: {
          data: [
            {
              id: "thread-2",
              cwd: "/tmp/codex",
              preview: "Second page",
              updated_at: 4900,
            },
          ],
          nextCursor: null,
        },
      });
    vi.mocked(getThreadTimestamp).mockImplementation((thread) => {
      const value = (thread as Record<string, unknown>).updated_at as number;
      return value ?? 0;
    });

    const { result } = renderActions();

    await act(async () => {
      await result.current.listThreadsForWorkspaces([workspace]);
    });

    expect(listThreads).toHaveBeenCalledTimes(2);
    expect(listThreads).toHaveBeenNthCalledWith(1, "ws-1", null, 100, "updated_at");
    expect(listThreads).toHaveBeenNthCalledWith(
      2,
      "ws-1",
      "cursor-1",
      100,
      "updated_at",
    );
  });

  it("supports snake_case next_cursor in shared thread list responses", async () => {
    vi.mocked(listThreads)
      .mockResolvedValueOnce({
        result: {
          data: [
            {
              id: "thread-1",
              cwd: "/tmp/codex",
              preview: "First page",
              updated_at: 5000,
            },
          ],
          next_cursor: "cursor-legacy-1",
        },
      })
      .mockResolvedValueOnce({
        result: {
          data: [
            {
              id: "thread-2",
              cwd: "/tmp/codex",
              preview: "Second page",
              updated_at: 4900,
            },
          ],
          next_cursor: null,
        },
      });
    vi.mocked(getThreadTimestamp).mockImplementation((thread) => {
      const value = (thread as Record<string, unknown>).updated_at as number;
      return value ?? 0;
    });

    const { result } = renderActions();

    await act(async () => {
      await result.current.listThreadsForWorkspaces([workspace]);
    });

    expect(listThreads).toHaveBeenCalledTimes(2);
    expect(listThreads).toHaveBeenNthCalledWith(
      2,
      "ws-1",
      "cursor-legacy-1",
      100,
      "updated_at",
    );
  });

  it("stores a per-workspace cursor boundary for older pagination", async () => {
    const firstPage = Array.from({ length: 10 }, (_, index) => ({
      id: `thread-${index + 1}`,
      cwd: "/tmp/codex",
      preview: `Thread ${index + 1}`,
      updated_at: 5000 - index,
    }));
    const secondPage = Array.from({ length: 15 }, (_, index) => ({
      id: `thread-${index + 11}`,
      cwd: "/tmp/codex",
      preview: `Thread ${index + 11}`,
      updated_at: 4990 - index,
    }));
    vi.mocked(listThreads)
      .mockResolvedValueOnce({
        result: {
          data: firstPage,
          nextCursor: "cursor-1",
        },
      })
      .mockResolvedValueOnce({
        result: {
          data: secondPage,
          nextCursor: null,
        },
      });
    vi.mocked(getThreadTimestamp).mockImplementation((thread) => {
      const value = (thread as Record<string, unknown>).updated_at as number;
      return value ?? 0;
    });

    const { result, dispatch } = renderActions();

    await act(async () => {
      await result.current.listThreadsForWorkspace(workspace);
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: "setThreadListCursor",
      workspaceId: "ws-1",
      cursor: "cursor-1",
    });
  });

});
