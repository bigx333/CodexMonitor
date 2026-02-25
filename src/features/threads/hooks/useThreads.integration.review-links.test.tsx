// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  handlers,
  startReview,
  useThreadRows,
  useThreads,
  workspace,
} from "./useThreads.integration.test.helpers";

describe("useThreads UX integration", () => {
  it("links detached review thread to its parent", async () => {
    vi.mocked(startReview).mockResolvedValue({
      result: { reviewThreadId: "thread-review-1" },
    });

    const { result } = renderHook(() =>
      useThreads({
        activeWorkspace: workspace,
        onWorkspaceConnected: vi.fn(),
        reviewDeliveryMode: "detached",
      }),
    );

    act(() => {
      result.current.setActiveThreadId("thread-parent");
    });

    await act(async () => {
      await result.current.startReview("/review check this");
    });

    await waitFor(() => {
      expect(vi.mocked(startReview)).toHaveBeenCalledWith(
        "ws-1",
        "thread-parent",
        expect.any(Object),
        "detached",
      );
    });

    expect(result.current.threadParentById["thread-review-1"]).toBe("thread-parent");
  });

  it("keeps detached collab review threads under the original parent", async () => {
    vi.mocked(startReview).mockResolvedValue({
      result: { reviewThreadId: "thread-review-1" },
    });

    const { result } = renderHook(() =>
      useThreads({
        activeWorkspace: workspace,
        onWorkspaceConnected: vi.fn(),
        reviewDeliveryMode: "detached",
      }),
    );

    act(() => {
      result.current.setActiveThreadId("thread-parent");
    });

    await act(async () => {
      await result.current.startReview("/review check this");
    });

    expect(result.current.threadParentById["thread-review-1"]).toBe("thread-parent");

    act(() => {
      handlers?.onItemCompleted?.("ws-1", "thread-parent", {
        type: "collabToolCall",
        id: "item-collab-1",
        senderThreadId: "thread-review-1",
        newThreadId: "thread-review-2",
      });
    });

    expect(result.current.threadParentById["thread-review-2"]).toBe("thread-review-1");

    const { result: threadRowsResult } = renderHook(() =>
      useThreadRows(result.current.threadParentById),
    );
    const rows = threadRowsResult.current.getThreadRows(
      [
        { id: "thread-parent", name: "Parent", updatedAt: 3 },
        { id: "thread-review-2", name: "Review Child", updatedAt: 2 },
      ],
      true,
      "ws-1",
      () => null,
    );
    expect(rows.unpinnedRows.map((row) => [row.thread.id, row.depth])).toEqual([
      ["thread-parent", 0],
      ["thread-review-2", 1],
    ]);
  });

  it("classifies live spawned threads from thread source metadata", () => {
    const { result } = renderHook(() =>
      useThreads({
        activeWorkspace: workspace,
        onWorkspaceConnected: vi.fn(),
      }),
    );

    act(() => {
      handlers?.onThreadStarted?.("ws-1", {
        id: "thread-child-live",
        preview: "Child live",
        source: {
          subAgent: {
            thread_spawn: {
              parent_thread_id: "thread-parent-live",
              depth: 1,
            },
          },
        },
      });
    });

    expect(result.current.threadParentById["thread-child-live"]).toBe("thread-parent-live");
    expect(result.current.isSubagentThread("ws-1", "thread-child-live")).toBe(true);
  });

  it("classifies live spawned threads from collab tool events", () => {
    const { result } = renderHook(() =>
      useThreads({
        activeWorkspace: workspace,
        onWorkspaceConnected: vi.fn(),
      }),
    );

    act(() => {
      handlers?.onItemCompleted?.("ws-1", "thread-parent-live", {
        type: "collabToolCall",
        id: "item-collab-live",
        senderThreadId: "thread-parent-live",
        newThreadId: "thread-child-live-collab",
      });
    });

    expect(result.current.threadParentById["thread-child-live-collab"]).toBe(
      "thread-parent-live",
    );
    expect(result.current.isSubagentThread("ws-1", "thread-child-live-collab")).toBe(true);
  });

  it("classifies collab receivers from receiver_agents metadata", () => {
    const { result } = renderHook(() =>
      useThreads({
        activeWorkspace: workspace,
        onWorkspaceConnected: vi.fn(),
      }),
    );

    act(() => {
      handlers?.onItemCompleted?.("ws-1", "thread-parent-live", {
        type: "collabToolCall",
        id: "item-collab-receiver-agents",
        sender_thread_id: "thread-parent-live",
        receiver_agents: [
          {
            thread_id: "thread-child-live-agent-ref",
            agent_nickname: "Robie",
            agent_role: "explorer",
          },
        ],
      });
    });

    expect(result.current.threadParentById["thread-child-live-agent-ref"]).toBe(
      "thread-parent-live",
    );
    expect(result.current.isSubagentThread("ws-1", "thread-child-live-agent-ref")).toBe(
      true,
    );
  });

});
