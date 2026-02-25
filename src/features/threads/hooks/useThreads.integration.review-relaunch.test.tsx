// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  STORAGE_KEY_DETACHED_REVIEW_LINKS,
  listThreads,
  startReview,
  useThreads,
  workspace,
} from "./useThreads.integration.test.helpers";

describe("useThreads UX integration", () => {
  it("restores detached review parent links after relaunch", async () => {
    vi.mocked(startReview).mockResolvedValue({
      result: { reviewThreadId: "thread-review-1" },
    });
    vi.mocked(listThreads).mockResolvedValue({
      result: {
        data: [
          {
            id: "thread-parent",
            preview: "Parent",
            updated_at: 10,
            cwd: workspace.path,
          },
          {
            id: "thread-review-1",
            preview: "Detached review",
            updated_at: 9,
            cwd: workspace.path,
          },
        ],
        nextCursor: null,
      },
    });

    const first = renderHook(() =>
      useThreads({
        activeWorkspace: workspace,
        onWorkspaceConnected: vi.fn(),
        reviewDeliveryMode: "detached",
      }),
    );

    act(() => {
      first.result.current.setActiveThreadId("thread-parent");
    });

    await act(async () => {
      await first.result.current.startReview("/review check this");
    });

    expect(first.result.current.threadParentById["thread-review-1"]).toBe("thread-parent");
    first.unmount();

    const second = renderHook(() =>
      useThreads({
        activeWorkspace: workspace,
        onWorkspaceConnected: vi.fn(),
      }),
    );

    await act(async () => {
      await second.result.current.listThreadsForWorkspace(workspace);
    });

    await waitFor(() => {
      expect(second.result.current.threadParentById["thread-review-1"]).toBe(
        "thread-parent",
      );
    });
  });

  it("does not create a parent link for inline reviews", async () => {
    vi.mocked(startReview).mockResolvedValue({
      result: { reviewThreadId: "thread-parent" },
    });

    const { result } = renderHook(() =>
      useThreads({
        activeWorkspace: workspace,
        onWorkspaceConnected: vi.fn(),
        reviewDeliveryMode: "inline",
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
        "inline",
      );
    });

    expect(result.current.threadParentById["thread-parent"]).toBeUndefined();
    expect(localStorage.getItem(STORAGE_KEY_DETACHED_REVIEW_LINKS)).toBeNull();
  });

});
