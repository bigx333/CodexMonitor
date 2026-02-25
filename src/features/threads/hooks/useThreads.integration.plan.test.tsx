// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  handlers,
  resumeThread,
  useThreads,
  workspace,
} from "./useThreads.integration.test.helpers";

describe("useThreads UX integration", () => {
  it("defers trimming until scrollback settings hydrate", async () => {
    const totalItems = 240;
    const items = Array.from({ length: totalItems }, (_, index) =>
      index % 2 === 0
        ? {
            type: "userMessage",
            id: `server-user-${index}`,
            content: [{ type: "text", text: `User ${index}` }],
          }
        : {
            type: "agentMessage",
            id: `server-assistant-${index}`,
            text: `Assistant ${index}`,
          },
    );

    vi.mocked(resumeThread).mockResolvedValue({
      result: {
        thread: {
          id: "thread-scrollback",
          preview: "Remote preview",
          updated_at: 9999,
          turns: [
            {
              items,
            },
          ],
        },
      },
    });

    const { result, rerender } = renderHook(
      ({ scrollbackItems }) =>
        useThreads({
          activeWorkspace: workspace,
          onWorkspaceConnected: vi.fn(),
          chatHistoryScrollbackItems: scrollbackItems,
        }),
      {
        initialProps: {
          scrollbackItems: null as number | null,
        },
      },
    );

    expect(handlers).not.toBeNull();

    act(() => {
      result.current.setActiveThreadId("thread-scrollback");
    });

    await waitFor(() => {
      expect(vi.mocked(resumeThread)).toHaveBeenCalledWith(
        "ws-1",
        "thread-scrollback",
      );
    });

    await waitFor(() => {
      expect(result.current.activeItems).toHaveLength(totalItems);
    });

    rerender({ scrollbackItems: 200 });

    await waitFor(() => {
      expect(result.current.activeItems).toHaveLength(200);
    });
  });

  it("keeps the latest plan visible when a new turn starts", () => {
    const { result } = renderHook(() =>
      useThreads({
        activeWorkspace: workspace,
        onWorkspaceConnected: vi.fn(),
      }),
    );

    act(() => {
      handlers?.onTurnPlanUpdated?.("ws-1", "thread-1", "turn-1", {
        explanation: " Plan note ",
        plan: [{ step: "Do it", status: "in_progress" }],
      });
    });

    expect(result.current.planByThread["thread-1"]).toEqual({
      turnId: "turn-1",
      explanation: "Plan note",
      steps: [{ step: "Do it", status: "inProgress" }],
    });

    act(() => {
      handlers?.onTurnStarted?.("ws-1", "thread-1", "turn-2");
    });

    expect(result.current.planByThread["thread-1"]).toEqual({
      turnId: "turn-1",
      explanation: "Plan note",
      steps: [{ step: "Do it", status: "inProgress" }],
    });
  });

  it("stores turn diff updates from app-server events", () => {
    const { result } = renderHook(() =>
      useThreads({
        activeWorkspace: workspace,
        onWorkspaceConnected: vi.fn(),
      }),
    );

    act(() => {
      handlers?.onTurnDiffUpdated?.(
        "ws-1",
        "thread-1",
        "diff --git a/src/a.ts b/src/a.ts",
      );
    });

    expect(result.current.turnDiffByThread["thread-1"]).toBe(
      "diff --git a/src/a.ts b/src/a.ts",
    );
  });

  it("does not resume selected threads that already have local items", async () => {
    vi.mocked(resumeThread).mockResolvedValue({
      result: {
        thread: {
          id: "thread-3",
          preview: "Remote preview",
          updated_at: 9999,
          turns: [
            {
              items: [
                {
                  type: "userMessage",
                  id: "server-user-1",
                  content: [{ type: "text", text: "Remote hello" }],
                },
                {
                  type: "agentMessage",
                  id: "server-assistant-1",
                  text: "Remote response",
                },
              ],
            },
          ],
        },
      },
    });
    const ensureWorkspaceRuntimeCodexArgs = vi.fn(async () => undefined);

    const { result } = renderHook(() =>
      useThreads({
        activeWorkspace: workspace,
        onWorkspaceConnected: vi.fn(),
        ensureWorkspaceRuntimeCodexArgs,
      }),
    );

    expect(handlers).not.toBeNull();

    act(() => {
      handlers?.onAgentMessageCompleted?.({
        workspaceId: "ws-1",
        threadId: "thread-3",
        itemId: "local-assistant-1",
        text: "Local response",
      });
    });

    act(() => {
      result.current.setActiveThreadId("thread-3");
    });

    await act(async () => {
      await Promise.resolve();
    });
    expect(vi.mocked(resumeThread)).not.toHaveBeenCalled();
    expect(ensureWorkspaceRuntimeCodexArgs).not.toHaveBeenCalled();

    const activeItems = result.current.activeItems;
    const hasLocal = activeItems.some(
      (item) =>
        item.kind === "message" &&
        item.role === "assistant" &&
        item.id === "local-assistant-1",
    );
    const hasRemote = activeItems.some(
      (item) => item.kind === "message" && item.id === "server-user-1",
    );
    expect(hasLocal).toBe(true);
    expect(hasRemote).toBe(false);
  });

  it("clears empty plan updates to null", () => {
    const { result } = renderHook(() =>
      useThreads({
        activeWorkspace: workspace,
        onWorkspaceConnected: vi.fn(),
      }),
    );

    act(() => {
      handlers?.onTurnPlanUpdated?.("ws-1", "thread-1", "turn-1", {
        explanation: "   ",
        plan: [],
      });
    });

    expect(result.current.planByThread["thread-1"]).toBeNull();
  });

  it("normalizes plan step status values", () => {
    const { result } = renderHook(() =>
      useThreads({
        activeWorkspace: workspace,
        onWorkspaceConnected: vi.fn(),
      }),
    );

    act(() => {
      handlers?.onTurnPlanUpdated?.("ws-1", "thread-1", "turn-1", {
        explanation: "",
        plan: [
          { step: "Step 1", status: "in_progress" },
          { step: "Step 2", status: "in-progress" },
          { step: "Step 3", status: "in progress" },
          { step: "Step 4", status: "completed" },
          { step: "Step 5", status: "unknown" },
        ],
      });
    });

    expect(result.current.planByThread["thread-1"]).toEqual({
      turnId: "turn-1",
      explanation: null,
      steps: [
        { step: "Step 1", status: "inProgress" },
        { step: "Step 2", status: "inProgress" },
        { step: "Step 3", status: "inProgress" },
        { step: "Step 4", status: "completed" },
        { step: "Step 5", status: "pending" },
      ],
    });
  });

  it("replaces the plan when a new turn updates it", () => {
    const { result } = renderHook(() =>
      useThreads({
        activeWorkspace: workspace,
        onWorkspaceConnected: vi.fn(),
      }),
    );

    act(() => {
      handlers?.onTurnPlanUpdated?.("ws-1", "thread-1", "turn-1", {
        explanation: "First plan",
        plan: [{ step: "Step 1", status: "pending" }],
      });
      handlers?.onTurnPlanUpdated?.("ws-1", "thread-1", "turn-2", {
        explanation: "Next plan",
        plan: [{ step: "Step 2", status: "completed" }],
      });
    });

    expect(result.current.planByThread["thread-1"]).toEqual({
      turnId: "turn-2",
      explanation: "Next plan",
      steps: [{ step: "Step 2", status: "completed" }],
    });
  });

  it("keeps plans isolated per thread", () => {
    const { result } = renderHook(() =>
      useThreads({
        activeWorkspace: workspace,
        onWorkspaceConnected: vi.fn(),
      }),
    );

    act(() => {
      handlers?.onTurnPlanUpdated?.("ws-1", "thread-1", "turn-1", {
        explanation: "Thread 1 plan",
        plan: [{ step: "Step 1", status: "pending" }],
      });
      handlers?.onTurnPlanUpdated?.("ws-1", "thread-2", "turn-2", {
        explanation: "Thread 2 plan",
        plan: [{ step: "Step 2", status: "completed" }],
      });
    });

    expect(result.current.planByThread["thread-1"]).toEqual({
      turnId: "turn-1",
      explanation: "Thread 1 plan",
      steps: [{ step: "Step 1", status: "pending" }],
    });
    expect(result.current.planByThread["thread-2"]).toEqual({
      turnId: "turn-2",
      explanation: "Thread 2 plan",
      steps: [{ step: "Step 2", status: "completed" }],
    });
  });

  it("clears completed plans when a turn finishes", () => {
    const { result } = renderHook(() =>
      useThreads({
        activeWorkspace: workspace,
        onWorkspaceConnected: vi.fn(),
      }),
    );

    act(() => {
      handlers?.onTurnPlanUpdated?.("ws-1", "thread-1", "turn-1", {
        explanation: "All done",
        plan: [{ step: "Step 1", status: "completed" }],
      });
    });

    expect(result.current.planByThread["thread-1"]).toEqual({
      turnId: "turn-1",
      explanation: "All done",
      steps: [{ step: "Step 1", status: "completed" }],
    });

    act(() => {
      handlers?.onTurnCompleted?.("ws-1", "thread-1", "turn-1");
    });

    expect(result.current.planByThread["thread-1"]).toBeNull();
  });

  it("keeps plans visible on turn completion when steps remain", () => {
    const { result } = renderHook(() =>
      useThreads({
        activeWorkspace: workspace,
        onWorkspaceConnected: vi.fn(),
      }),
    );

    act(() => {
      handlers?.onTurnPlanUpdated?.("ws-1", "thread-1", "turn-1", {
        explanation: "Still in progress",
        plan: [{ step: "Step 1", status: "in_progress" }],
      });
    });

    act(() => {
      handlers?.onTurnCompleted?.("ws-1", "thread-1", "turn-1");
    });

    expect(result.current.planByThread["thread-1"]).toEqual({
      turnId: "turn-1",
      explanation: "Still in progress",
      steps: [{ step: "Step 1", status: "inProgress" }],
    });
  });

});
