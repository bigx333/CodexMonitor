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
  it("restores parent-child links from thread/list source metadata", async () => {
    vi.mocked(listThreads).mockResolvedValue({
      result: {
        data: [
          {
            id: "parent-thread",
            cwd: "/tmp/codex",
            preview: "Parent",
            updated_at: 5000,
            source: "vscode",
          },
          {
            id: "child-thread",
            cwd: "/tmp/codex",
            preview: "Child",
            updated_at: 4500,
            source: {
              subAgent: {
                thread_spawn: {
                  parent_thread_id: "parent-thread",
                  depth: 1,
                },
              },
            },
          },
        ],
        nextCursor: null,
      },
    });
    vi.mocked(getThreadTimestamp).mockImplementation((thread) => {
      const value = (thread as Record<string, unknown>).updated_at as number;
      return value ?? 0;
    });

    const { result, updateThreadParent, onSubagentThreadDetected } = renderActions();

    await act(async () => {
      await result.current.listThreadsForWorkspace(workspace);
    });

    expect(updateThreadParent).toHaveBeenCalledWith("parent-thread", ["child-thread"]);
    expect(onSubagentThreadDetected).toHaveBeenCalledWith("ws-1", "child-thread");
  });

  it("matches windows workspace threads client-side", async () => {
    const windowsWorkspace: WorkspaceInfo = {
      ...workspace,
      path: "C:\\Dev\\CodexMon",
    };
    vi.mocked(listThreads).mockResolvedValue({
      result: {
        data: [
          {
            id: "thread-win-1",
            cwd: "c:/dev/codexmon",
            preview: "Windows thread",
            updated_at: 5000,
          },
        ],
        nextCursor: null,
      },
    });
    vi.mocked(getThreadTimestamp).mockReturnValue(5000);

    const { result, dispatch } = renderActions();

    await act(async () => {
      await result.current.listThreadsForWorkspace(windowsWorkspace);
    });

    expect(listThreads).toHaveBeenCalledWith(
      "ws-1",
      null,
      100,
      "updated_at",
    );
    expect(dispatch).toHaveBeenCalledWith({
      type: "setThreads",
      workspaceId: "ws-1",
      sortKey: "updated_at",
      preserveAnchors: true,
      threads: [
        {
          id: "thread-win-1",
          name: "Windows thread",
          updatedAt: 5000,
          createdAt: 0,
        },
      ],
    });
  });

  it("matches windows namespace-prefixed workspace threads client-side", async () => {
    const windowsWorkspace: WorkspaceInfo = {
      ...workspace,
      path: "C:\\Dev\\CodexMon",
    };
    vi.mocked(listThreads).mockResolvedValue({
      result: {
        data: [
          {
            id: "thread-win-ns-1",
            cwd: "\\\\?\\C:\\Dev\\CodexMon",
            preview: "Windows namespace thread",
            updated_at: 5000,
          },
        ],
        nextCursor: null,
      },
    });
    vi.mocked(getThreadTimestamp).mockReturnValue(5000);

    const { result, dispatch } = renderActions();

    await act(async () => {
      await result.current.listThreadsForWorkspace(windowsWorkspace);
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: "setThreads",
      workspaceId: "ws-1",
      sortKey: "updated_at",
      preserveAnchors: true,
      threads: [
        {
          id: "thread-win-ns-1",
          name: "Windows namespace thread",
          updatedAt: 5000,
          createdAt: 0,
        },
      ],
    });
  });

  it("matches nested workspace threads client-side", async () => {
    vi.mocked(listThreads).mockResolvedValue({
      result: {
        data: [
          {
            id: "thread-nested-1",
            cwd: "/tmp/codex/subdir/project",
            preview: "Nested thread",
            updated_at: 5000,
          },
        ],
        nextCursor: null,
      },
    });
    vi.mocked(getThreadTimestamp).mockReturnValue(5000);

    const { result, dispatch } = renderActions();

    await act(async () => {
      await result.current.listThreadsForWorkspace(workspace);
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: "setThreads",
      workspaceId: "ws-1",
      sortKey: "updated_at",
      preserveAnchors: true,
      threads: [
        {
          id: "thread-nested-1",
          name: "Nested thread",
          updatedAt: 5000,
          createdAt: 0,
        },
      ],
    });
  });

  it("does not absorb nested child workspace threads when reloading one workspace", async () => {
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
            updated_at: 5000,
          },
        ],
        nextCursor: null,
      },
    });
    vi.mocked(getThreadTimestamp).mockReturnValue(5000);

    const { result, dispatch } = renderActions();

    await act(async () => {
      await result.current.listThreadsForWorkspace(parentWorkspace);
    });

    expect(listWorkspaces).toHaveBeenCalled();
    const parentSetThreadsAction = dispatch.mock.calls
      .map(([action]) => action)
      .find(
        (action) =>
          action?.type === "setThreads" &&
          action?.workspaceId === "ws-parent",
      ) as
      | { type: "setThreads"; threads: Array<{ id: string }>; workspaceId: string }
      | undefined;

    expect(parentSetThreadsAction?.threads.map((thread) => thread.id) ?? []).toEqual([]);
  });

});
