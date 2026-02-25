// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  listThreads,
  setNow,
  setThreadName,
  useThreadRows,
  useThreads,
  workspace,
} from "./useThreads.integration.test.helpers";

describe("useThreads UX integration", () => {
  it("orders thread lists, applies custom names, and keeps pin ordering stable", async () => {
    const listThreadsMock = vi.mocked(listThreads);
    listThreadsMock.mockResolvedValue({
      result: {
        data: [
          {
            id: "thread-a",
            preview: "Alpha",
            updated_at: 1000,
            cwd: workspace.path,
          },
          {
            id: "thread-b",
            preview: "Beta",
            updated_at: 3000,
            cwd: workspace.path,
          },
          {
            id: "thread-c",
            preview: "Gamma",
            updated_at: 2000,
            cwd: workspace.path,
          },
        ],
        nextCursor: null,
      },
    });

    const { result } = renderHook(() =>
      useThreads({
        activeWorkspace: workspace,
        onWorkspaceConnected: vi.fn(),
      }),
    );

    const { result: threadRowsResult } = renderHook(() =>
      useThreadRows(result.current.threadParentById),
    );

    await act(async () => {
      await result.current.listThreadsForWorkspace(workspace);
    });

    const initialOrder =
      result.current.threadsByWorkspace["ws-1"]?.map((thread) => thread.id) ?? [];
    expect(initialOrder).toEqual(["thread-b", "thread-c", "thread-a"]);

    act(() => {
      result.current.renameThread("ws-1", "thread-b", "Custom Beta");
    });
    expect(vi.mocked(setThreadName)).toHaveBeenCalledWith(
      "ws-1",
      "thread-b",
      "Custom Beta",
    );

    await act(async () => {
      await result.current.listThreadsForWorkspace(workspace);
    });

    const renamed = result.current.threadsByWorkspace["ws-1"]?.find(
      (thread) => thread.id === "thread-b",
    );
    expect(renamed?.name).toBe("Custom Beta");

    setNow(5000);
    act(() => {
      result.current.pinThread("ws-1", "thread-c");
    });
    setNow(6000);
    act(() => {
      result.current.pinThread("ws-1", "thread-a");
    });

    const { pinnedRows, unpinnedRows } = threadRowsResult.current.getThreadRows(
      result.current.threadsByWorkspace["ws-1"] ?? [],
      true,
      "ws-1",
      result.current.getPinTimestamp,
    );

    expect(pinnedRows.map((row) => row.thread.id)).toEqual([
      "thread-c",
      "thread-a",
    ]);
    expect(unpinnedRows.map((row) => row.thread.id)).toEqual(["thread-b"]);
  });

  it("keeps parent rows anchored when refresh only returns subagent children", async () => {
    vi.mocked(listThreads)
      .mockResolvedValueOnce({
        result: {
          data: [
            {
              id: "thread-parent-anchor",
              preview: "Parent",
              updated_at: 2000,
              cwd: workspace.path,
            },
            {
              id: "thread-child-anchor",
              preview: "Child",
              updated_at: 3000,
              cwd: workspace.path,
              source: {
                subAgent: {
                  thread_spawn: {
                    parent_thread_id: "thread-parent-anchor",
                    depth: 1,
                  },
                },
              },
            },
          ],
          nextCursor: null,
        },
      })
      .mockResolvedValueOnce({
        result: {
          data: [
            {
              id: "thread-child-anchor",
              preview: "Child",
              updated_at: 3500,
              cwd: workspace.path,
              source: {
                subAgent: {
                  thread_spawn: {
                    parent_thread_id: "thread-parent-anchor",
                    depth: 1,
                  },
                },
              },
            },
          ],
          nextCursor: null,
        },
      });

    const { result } = renderHook(() =>
      useThreads({
        activeWorkspace: workspace,
        onWorkspaceConnected: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.listThreadsForWorkspace(workspace);
    });

    await waitFor(() => {
      expect(result.current.threadParentById["thread-child-anchor"]).toBe(
        "thread-parent-anchor",
      );
    });

    await act(async () => {
      await result.current.listThreadsForWorkspace(workspace);
    });

    expect(vi.mocked(listThreads)).toHaveBeenCalledTimes(2);
    expect(result.current.threadsByWorkspace["ws-1"]?.map((thread) => thread.id)).toEqual(
      ["thread-child-anchor", "thread-parent-anchor"],
    );

    const { result: threadRowsResult } = renderHook(() =>
      useThreadRows(result.current.threadParentById),
    );
    const rows = threadRowsResult.current.getThreadRows(
      result.current.threadsByWorkspace["ws-1"] ?? [],
      true,
      "ws-1",
      () => null,
    );
    expect(rows.unpinnedRows.map((row) => [row.thread.id, row.depth])).toEqual([
      ["thread-parent-anchor", 0],
      ["thread-child-anchor", 1],
    ]);
  });
});
