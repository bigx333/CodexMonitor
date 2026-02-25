// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  handlers,
  interruptTurn,
  sendUserMessageService,
  steerTurn,
  useQueuedSend,
  useThreads,
  workspace,
} from "./useThreads.integration.test.helpers";

describe("useThreads UX integration", () => {
  it("interrupts immediately even before a turn id is available", async () => {
    const interruptMock = vi.mocked(interruptTurn);
    interruptMock.mockResolvedValue({ result: {} });

    const { result } = renderHook(() =>
      useThreads({
        activeWorkspace: workspace,
        onWorkspaceConnected: vi.fn(),
      }),
    );

    act(() => {
      result.current.setActiveThreadId("thread-1");
    });

    await act(async () => {
      await result.current.interruptTurn();
    });

    expect(interruptMock).toHaveBeenCalledWith("ws-1", "thread-1", "pending");

    act(() => {
      handlers?.onTurnStarted?.("ws-1", "thread-1", "turn-1");
    });

    await waitFor(() => {
      expect(interruptMock).toHaveBeenCalledWith("ws-1", "thread-1", "turn-1");
    });
    expect(interruptMock).toHaveBeenCalledTimes(2);
  });

  it("keeps queued sends blocked while request user input is pending", async () => {
    vi.mocked(sendUserMessageService)
      .mockResolvedValueOnce({
        result: { turn: { id: "turn-1" } },
      } as Awaited<ReturnType<typeof sendUserMessageService>>)
      .mockResolvedValueOnce({
        result: { turn: { id: "turn-2" } },
      } as Awaited<ReturnType<typeof sendUserMessageService>>);
    const connectWorkspace = vi.fn().mockResolvedValue(undefined);
    const clearActiveImages = vi.fn();

    const { result } = renderHook(() => {
      const threads = useThreads({
        activeWorkspace: workspace,
        onWorkspaceConnected: vi.fn(),
      });
      const threadId = threads.activeThreadId;
      const status = threadId ? threads.threadStatusById[threadId] : undefined;
      const queued = useQueuedSend({
        activeThreadId: threadId,
        activeTurnId: threadId ? threads.activeTurnIdByThread[threadId] ?? null : null,
        isProcessing: status?.isProcessing ?? false,
        isReviewing: status?.isReviewing ?? false,
        steerEnabled: false,
        followUpMessageBehavior: "queue",
        appsEnabled: true,
        activeWorkspace: workspace,
        connectWorkspace,
        startThreadForWorkspace: threads.startThreadForWorkspace,
        sendUserMessage: threads.sendUserMessage,
        sendUserMessageToThread: threads.sendUserMessageToThread,
        runBangCommand: threads.runBangCommand,
        startFork: threads.startFork,
        startReview: threads.startReview,
        startResume: threads.startResume,
        startCompact: threads.startCompact,
        startApps: threads.startApps,
        startMcp: threads.startMcp,
        startStatus: threads.startStatus,
        clearActiveImages,
      });
      return { threads, queued };
    });

    expect(handlers).not.toBeNull();

    act(() => {
      result.current.threads.setActiveThreadId("thread-1");
    });

    await act(async () => {
      await result.current.threads.sendUserMessage("Start running turn");
    });

    await waitFor(() => {
      expect(result.current.threads.threadStatusById["thread-1"]?.isProcessing).toBe(true);
      expect(result.current.threads.activeTurnIdByThread["thread-1"]).toBe("turn-1");
      expect(sendUserMessageService).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      await result.current.queued.handleSend("Queued during turn");
    });

    expect(result.current.queued.activeQueue).toHaveLength(1);
    expect(sendUserMessageService).toHaveBeenCalledTimes(1);

    act(() => {
      handlers?.onRequestUserInput?.({
        workspace_id: "ws-1",
        request_id: "request-1",
        params: {
          thread_id: "thread-1",
          turn_id: "turn-1",
          item_id: "item-1",
          questions: [],
        },
      });
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.queued.activeQueue).toHaveLength(1);
    expect(sendUserMessageService).toHaveBeenCalledTimes(1);

    act(() => {
      handlers?.onTurnCompleted?.("ws-1", "thread-1", "turn-1");
    });

    await waitFor(() => {
      expect(sendUserMessageService).toHaveBeenCalledTimes(2);
    });
    const queuedCall = vi.mocked(sendUserMessageService).mock.calls[1];
    expect(queuedCall?.[0]).toBe("ws-1");
    expect(queuedCall?.[1]).toBe("thread-1");
    expect(queuedCall?.[2]).toBe("Queued during turn");
  });

  it("keeps active turn id after request user input so interrupt targets the running turn", async () => {
    const interruptMock = vi.mocked(interruptTurn);
    interruptMock.mockResolvedValue({ result: {} });

    const { result } = renderHook(() =>
      useThreads({
        activeWorkspace: workspace,
        onWorkspaceConnected: vi.fn(),
      }),
    );

    act(() => {
      result.current.setActiveThreadId("thread-1");
      handlers?.onTurnStarted?.("ws-1", "thread-1", "turn-1");
      handlers?.onRequestUserInput?.({
        workspace_id: "ws-1",
        request_id: "request-1",
        params: {
          thread_id: "thread-1",
          turn_id: "turn-1",
          item_id: "item-1",
          questions: [],
        },
      });
    });

    await act(async () => {
      await result.current.interruptTurn();
    });

    expect(interruptMock).toHaveBeenCalledWith("ws-1", "thread-1", "turn-1");
    expect(interruptMock).not.toHaveBeenCalledWith("ws-1", "thread-1", "pending");
  });

  it("uses turn steer after request user input when the turn is still active", async () => {
    vi.mocked(steerTurn).mockResolvedValue({
      result: { turnId: "turn-1" },
    } as Awaited<ReturnType<typeof steerTurn>>);
    vi.mocked(sendUserMessageService).mockResolvedValue({
      result: { turn: { id: "turn-2" } },
    } as Awaited<ReturnType<typeof sendUserMessageService>>);

    const { result } = renderHook(() =>
      useThreads({
        activeWorkspace: workspace,
        onWorkspaceConnected: vi.fn(),
        steerEnabled: true,
      }),
    );

    act(() => {
      result.current.setActiveThreadId("thread-1");
      handlers?.onTurnStarted?.("ws-1", "thread-1", "turn-1");
      handlers?.onRequestUserInput?.({
        workspace_id: "ws-1",
        request_id: "request-1",
        params: {
          thread_id: "thread-1",
          turn_id: "turn-1",
          item_id: "item-1",
          questions: [],
        },
      });
    });

    expect(result.current.threadStatusById["thread-1"]?.isProcessing).toBe(true);
    expect(result.current.activeTurnIdByThread["thread-1"]).toBe("turn-1");

    await act(async () => {
      await result.current.sendUserMessage("Steer after user input");
    });

    expect(steerTurn).toHaveBeenCalledWith(
      "ws-1",
      "thread-1",
      "turn-1",
      "Steer after user input",
      [],
    );
    expect(sendUserMessageService).not.toHaveBeenCalled();
  });

});
