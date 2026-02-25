// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  archiveThread,
  handlers,
  startReview,
  useThreads,
  workspace,
} from "./useThreads.integration.test.helpers";

describe("useThreads UX integration", () => {
  it("cascades archive to subagent descendants when parent archived", async () => {
    const { result } = renderHook(() =>
      useThreads({
        activeWorkspace: workspace,
        onWorkspaceConnected: vi.fn(),
      }),
    );

    act(() => {
      handlers?.onThreadStarted?.("ws-1", { id: "thread-parent", preview: "Parent" });
      handlers?.onThreadStarted?.("ws-1", {
        id: "thread-child",
        preview: "Child",
        source: {
          subAgent: {
            thread_spawn: { parent_thread_id: "thread-parent", depth: 1 },
          },
        },
      });
      handlers?.onThreadStarted?.("ws-1", {
        id: "thread-grandchild",
        preview: "Grandchild",
        source: {
          subAgent: {
            thread_spawn: { parent_thread_id: "thread-child", depth: 2 },
          },
        },
      });
    });

    expect(result.current.threadParentById["thread-child"]).toBe("thread-parent");
    expect(result.current.threadParentById["thread-grandchild"]).toBe("thread-child");
    expect(result.current.isSubagentThread("ws-1", "thread-child")).toBe(true);
    expect(result.current.isSubagentThread("ws-1", "thread-grandchild")).toBe(true);

    act(() => {
      handlers?.onThreadArchived?.("ws-1", "thread-parent");
    });

    await waitFor(() => {
      expect(vi.mocked(archiveThread)).toHaveBeenCalledWith("ws-1", "thread-child");
      expect(vi.mocked(archiveThread)).toHaveBeenCalledWith(
        "ws-1",
        "thread-grandchild",
      );
    });
    expect(vi.mocked(archiveThread)).not.toHaveBeenCalledWith("ws-1", "thread-parent");
    expect(vi.mocked(archiveThread)).toHaveBeenCalledTimes(2);

    vi.mocked(archiveThread).mockClear();

    act(() => {
      handlers?.onThreadArchived?.("ws-1", "thread-child");
    });

    expect(vi.mocked(archiveThread)).not.toHaveBeenCalled();
  });

  it("does not archive detached review children when parent archived", async () => {
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
      expect(result.current.threadParentById["thread-review-1"]).toBe("thread-parent");
    });
    expect(result.current.isSubagentThread("ws-1", "thread-review-1")).toBe(false);

    act(() => {
      handlers?.onThreadStarted?.("ws-1", {
        id: "thread-child",
        preview: "Child",
        source: {
          subAgent: {
            thread_spawn: { parent_thread_id: "thread-parent", depth: 1 },
          },
        },
      });
    });

    vi.mocked(archiveThread).mockClear();

    act(() => {
      handlers?.onThreadArchived?.("ws-1", "thread-parent");
    });

    await waitFor(() => {
      expect(vi.mocked(archiveThread)).toHaveBeenCalledWith("ws-1", "thread-child");
    });
    expect(vi.mocked(archiveThread)).not.toHaveBeenCalledWith("ws-1", "thread-review-1");
  });

  it("archives subagent descendants spawned from detached review threads when parent archived", async () => {
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
      expect(result.current.threadParentById["thread-review-1"]).toBe("thread-parent");
    });

    act(() => {
      handlers?.onThreadStarted?.("ws-1", {
        id: "thread-review-subagent",
        preview: "Review subagent",
        source: {
          subAgent: {
            thread_spawn: { parent_thread_id: "thread-review-1", depth: 1 },
          },
        },
      });
    });

    expect(result.current.isSubagentThread("ws-1", "thread-review-subagent")).toBe(true);
    expect(result.current.threadParentById["thread-review-subagent"]).toBe("thread-review-1");

    vi.mocked(archiveThread).mockClear();

    act(() => {
      handlers?.onThreadArchived?.("ws-1", "thread-parent");
    });

    await waitFor(() => {
      expect(vi.mocked(archiveThread)).toHaveBeenCalledWith(
        "ws-1",
        "thread-review-subagent",
      );
    });
    expect(vi.mocked(archiveThread)).not.toHaveBeenCalledWith("ws-1", "thread-review-1");
  });

  it("keeps parent unlocked and pings parent when detached child exits", async () => {
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

    expect(result.current.threadStatusById["thread-parent"]?.isReviewing).toBe(false);
    expect(result.current.threadStatusById["thread-parent"]?.isProcessing).toBe(false);
    expect(
      result.current.activeItems.some(
        (item) =>
          item.kind === "message" &&
          item.role === "assistant" &&
          item.text.includes("Detached review started.") &&
          item.text.includes("[Open review thread](/thread/thread-review-1)"),
      ),
    ).toBe(true);

    act(() => {
      handlers?.onItemCompleted?.("ws-1", "thread-review-1", {
        type: "exitedReviewMode",
        id: "review-exit-1",
      });
    });

    expect(result.current.threadStatusById["thread-parent"]?.isReviewing).toBe(false);
    expect(result.current.threadStatusById["thread-parent"]?.isProcessing).toBe(false);
    expect(
      result.current.activeItems.some(
        (item) =>
          item.kind === "message" &&
          item.role === "assistant" &&
          item.text.includes("Detached review completed.") &&
          item.text.includes("[Open review thread](/thread/thread-review-1)"),
      ),
    ).toBe(true);
  });

  it("preserves parent turn state when detached child exits", async () => {
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

    act(() => {
      handlers?.onTurnStarted?.("ws-1", "thread-parent", "turn-parent-1");
    });

    expect(result.current.threadStatusById["thread-parent"]?.isProcessing).toBe(true);
    expect(result.current.activeTurnIdByThread["thread-parent"]).toBe("turn-parent-1");

    act(() => {
      handlers?.onItemCompleted?.("ws-1", "thread-review-1", {
        type: "exitedReviewMode",
        id: "review-exit-1",
      });
    });

    expect(result.current.threadStatusById["thread-parent"]?.isProcessing).toBe(true);
    expect(result.current.activeTurnIdByThread["thread-parent"]).toBe("turn-parent-1");
    expect(
      result.current.activeItems.some(
        (item) =>
          item.kind === "message" &&
          item.role === "assistant" &&
          item.text.includes("Detached review completed.") &&
          item.text.includes("[Open review thread](/thread/thread-review-1)"),
      ),
    ).toBe(true);
  });

  it("does not stack detached completion messages when exit is emitted multiple times", async () => {
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

    act(() => {
      handlers?.onItemCompleted?.("ws-1", "thread-review-1", {
        type: "exitedReviewMode",
        id: "review-exit-1",
      });
      handlers?.onItemCompleted?.("ws-1", "thread-review-1", {
        type: "exitedReviewMode",
        id: "review-exit-1",
      });
    });

    const notices = result.current.activeItems.filter(
      (item) =>
        item.kind === "message" &&
        item.role === "assistant" &&
        item.text.includes("Detached review completed.") &&
        item.text.includes("[Open review thread](/thread/thread-review-1)"),
    );
    expect(notices).toHaveLength(1);
  });

  it("does not post detached completion notice for generic linked child reviews", () => {
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

    act(() => {
      handlers?.onItemCompleted?.("ws-1", "thread-parent", {
        type: "collabToolCall",
        id: "item-collab-link-1",
        senderThreadId: "thread-parent",
        newThreadId: "thread-linked-1",
      });
    });

    act(() => {
      handlers?.onItemCompleted?.("ws-1", "thread-linked-1", {
        type: "exitedReviewMode",
        id: "review-exit-linked-1",
      });
    });

    expect(
      result.current.activeItems.some(
        (item) =>
          item.kind === "message" &&
          item.role === "assistant" &&
          item.text.includes("[Open review thread](/thread/thread-linked-1)"),
      ),
    ).toBe(false);
  });
});
