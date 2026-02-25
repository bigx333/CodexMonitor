// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  handlers,
  resumeThread,
  sendUserMessageService,
  startThread,
  useThreads,
  workspace,
} from "./useThreads.integration.test.helpers";

describe("useThreads UX integration", () => {
  it("resumes selected threads when no local items exist", async () => {
    vi.mocked(resumeThread).mockResolvedValue({
      result: {
        thread: {
          id: "thread-2",
          preview: "Remote preview",
          updated_at: 9999,
          turns: [
            {
              items: [
                {
                  type: "userMessage",
                  id: "server-user-1",
                  content: [{ type: "text", text: "Hello" }],
                },
                {
                  type: "agentMessage",
                  id: "assistant-1",
                  text: "Hello world",
                },
                {
                  type: "enteredReviewMode",
                  id: "review-1",
                },
              ],
            },
          ],
        },
      },
    });

    const { result } = renderHook(() =>
      useThreads({
        activeWorkspace: workspace,
        onWorkspaceConnected: vi.fn(),
      }),
    );

    expect(handlers).not.toBeNull();

    act(() => {
      result.current.setActiveThreadId("thread-2");
    });

    await waitFor(() => {
      expect(vi.mocked(resumeThread)).toHaveBeenCalledWith("ws-1", "thread-2");
    });

    await waitFor(() => {
      expect(result.current.threadStatusById["thread-2"]?.isReviewing).toBe(true);
    });

    const activeItems = result.current.activeItems;
    const assistantMerged = activeItems.find(
      (item) =>
        item.kind === "message" &&
        item.role === "assistant" &&
        item.id === "assistant-1",
    );
    expect(assistantMerged?.kind).toBe("message");
    if (assistantMerged?.kind === "message") {
      expect(assistantMerged.text).toBe("Hello world");
    }
  });

  it("applies runtime codex args before start and selection resume", async () => {
    const ensureWorkspaceRuntimeCodexArgs = vi.fn(async () => undefined);
    vi.mocked(startThread).mockResolvedValue({
      result: { thread: { id: "thread-new" } },
    } as Awaited<ReturnType<typeof startThread>>);
    vi.mocked(resumeThread).mockResolvedValue({
      result: {
        thread: {
          id: "thread-2",
          preview: "Remote preview",
          updated_at: 9999,
          turns: [],
        },
      },
    });

    const { result } = renderHook(() =>
      useThreads({
        activeWorkspace: workspace,
        onWorkspaceConnected: vi.fn(),
        ensureWorkspaceRuntimeCodexArgs,
      }),
    );

    await act(async () => {
      await result.current.startThread();
    });

    expect(ensureWorkspaceRuntimeCodexArgs).toHaveBeenCalledWith("ws-1", null);
    expect(vi.mocked(startThread)).toHaveBeenCalledWith("ws-1");
    const startEnsureCallOrder = ensureWorkspaceRuntimeCodexArgs.mock.invocationCallOrder[0];
    const startThreadCallOrder = vi.mocked(startThread).mock.invocationCallOrder[0];
    expect(startEnsureCallOrder).toBeLessThan(startThreadCallOrder);

    act(() => {
      result.current.setActiveThreadId("thread-2");
    });

    await waitFor(() => {
      expect(ensureWorkspaceRuntimeCodexArgs).toHaveBeenCalledWith("ws-1", "thread-2");
      expect(vi.mocked(resumeThread)).toHaveBeenCalledWith("ws-1", "thread-2");
    });

    const selectEnsureCallOrder = ensureWorkspaceRuntimeCodexArgs.mock.invocationCallOrder[1];
    const resumeThreadCallOrder = vi.mocked(resumeThread).mock.invocationCallOrder[0];
    expect(selectEnsureCallOrder).toBeLessThan(resumeThreadCallOrder);
  });

  it("applies runtime codex args before direct startThreadForWorkspace calls", async () => {
    const ensureWorkspaceRuntimeCodexArgs = vi.fn(async () => undefined);
    vi.mocked(startThread).mockResolvedValue({
      result: { thread: { id: "thread-direct-new" } },
    } as Awaited<ReturnType<typeof startThread>>);

    const { result } = renderHook(() =>
      useThreads({
        activeWorkspace: workspace,
        onWorkspaceConnected: vi.fn(),
        ensureWorkspaceRuntimeCodexArgs,
      }),
    );

    await act(async () => {
      await result.current.startThreadForWorkspace("ws-1", { activate: false });
    });

    expect(ensureWorkspaceRuntimeCodexArgs).toHaveBeenCalledWith("ws-1", null);
    expect(vi.mocked(startThread)).toHaveBeenCalledWith("ws-1");

    const ensureCallOrder = ensureWorkspaceRuntimeCodexArgs.mock.invocationCallOrder[0];
    const startThreadCallOrder = vi.mocked(startThread).mock.invocationCallOrder[0];
    expect(ensureCallOrder).toBeLessThan(startThreadCallOrder);
  });

  it("still resumes selected thread when runtime codex args sync fails", async () => {
    const ensureWorkspaceRuntimeCodexArgs = vi.fn(async () => {
      throw new Error("runtime sync failed");
    });
    vi.mocked(resumeThread).mockResolvedValue({
      result: {
        thread: {
          id: "thread-2",
          preview: "Remote preview",
          updated_at: 9999,
          turns: [],
        },
      },
    });

    const { result } = renderHook(() =>
      useThreads({
        activeWorkspace: workspace,
        onWorkspaceConnected: vi.fn(),
        ensureWorkspaceRuntimeCodexArgs,
      }),
    );

    act(() => {
      result.current.setActiveThreadId("thread-2");
    });

    await waitFor(() => {
      expect(ensureWorkspaceRuntimeCodexArgs).toHaveBeenCalledWith("ws-1", "thread-2");
      expect(vi.mocked(resumeThread)).toHaveBeenCalledWith("ws-1", "thread-2");
    });
  });

  it("does not preflight runtime codex args on selection while a workspace thread is processing", async () => {
    const ensureWorkspaceRuntimeCodexArgs = vi.fn(async () => undefined);
    vi.mocked(resumeThread).mockImplementation(async (_workspaceId, threadId) => ({
      result: {
        thread: {
          id: threadId,
          preview: `Thread ${threadId}`,
          updated_at: 9999,
          turns: [],
        },
      },
    }));

    const { result } = renderHook(() =>
      useThreads({
        activeWorkspace: workspace,
        onWorkspaceConnected: vi.fn(),
        ensureWorkspaceRuntimeCodexArgs,
      }),
    );

    act(() => {
      result.current.setActiveThreadId("thread-1");
    });

    await waitFor(() => {
      expect(vi.mocked(resumeThread)).toHaveBeenCalledWith("ws-1", "thread-1");
    });

    vi.mocked(resumeThread).mockClear();
    ensureWorkspaceRuntimeCodexArgs.mockClear();

    act(() => {
      handlers?.onTurnStarted?.("ws-1", "thread-1", "turn-1");
    });

    await waitFor(() => {
      expect(result.current.threadStatusById["thread-1"]?.isProcessing).toBe(true);
    });

    act(() => {
      result.current.setActiveThreadId("thread-2");
    });

    await waitFor(() => {
      expect(vi.mocked(resumeThread)).toHaveBeenCalledWith("ws-1", "thread-2");
    });

    expect(ensureWorkspaceRuntimeCodexArgs).not.toHaveBeenCalled();
  });

  it("does not preflight runtime codex args on selection when a hidden thread is processing", async () => {
    const ensureWorkspaceRuntimeCodexArgs = vi.fn(async () => undefined);
    vi.mocked(resumeThread).mockImplementation(async (_workspaceId, threadId) => ({
      result: {
        thread: {
          id: threadId,
          preview: `Thread ${threadId}`,
          updated_at: 9999,
          turns: [],
        },
      },
    }));

    const { result } = renderHook(() =>
      useThreads({
        activeWorkspace: workspace,
        onWorkspaceConnected: vi.fn(),
        ensureWorkspaceRuntimeCodexArgs,
      }),
    );

    act(() => {
      handlers?.onTurnStarted?.("ws-1", "thread-hidden", "turn-hidden-1");
      handlers?.onBackgroundThreadAction?.("ws-1", "thread-hidden", "hide");
    });

    await waitFor(() => {
      expect(result.current.threadStatusById["thread-hidden"]?.isProcessing).toBe(true);
    });

    act(() => {
      result.current.setActiveThreadId("thread-2");
    });

    await waitFor(() => {
      expect(vi.mocked(resumeThread)).toHaveBeenCalledWith("ws-1", "thread-2");
    });

    expect(ensureWorkspaceRuntimeCodexArgs).not.toHaveBeenCalled();
  });

  it("does not preflight runtime codex args on send when another workspace thread is processing", async () => {
    const ensureWorkspaceRuntimeCodexArgs = vi.fn(async () => undefined);
    vi.mocked(resumeThread).mockImplementation(async (_workspaceId, threadId) => ({
      result: {
        thread: {
          id: threadId,
          preview: `Thread ${threadId}`,
          updated_at: 9999,
          turns: [],
        },
      },
    }));
    vi.mocked(sendUserMessageService).mockResolvedValue({
      result: { turn: { id: "turn-target-1" } },
    } as Awaited<ReturnType<typeof sendUserMessageService>>);

    const { result } = renderHook(() =>
      useThreads({
        activeWorkspace: workspace,
        onWorkspaceConnected: vi.fn(),
        ensureWorkspaceRuntimeCodexArgs,
      }),
    );

    act(() => {
      result.current.setActiveThreadId("thread-busy");
    });

    await waitFor(() => {
      expect(vi.mocked(resumeThread)).toHaveBeenCalledWith("ws-1", "thread-busy");
    });

    act(() => {
      handlers?.onTurnStarted?.("ws-1", "thread-busy", "turn-busy-1");
    });

    await waitFor(() => {
      expect(result.current.threadStatusById["thread-busy"]?.isProcessing).toBe(true);
    });

    ensureWorkspaceRuntimeCodexArgs.mockClear();

    await act(async () => {
      await result.current.sendUserMessageToThread(
        workspace,
        "thread-target",
        "hello target",
      );
    });

    expect(ensureWorkspaceRuntimeCodexArgs).not.toHaveBeenCalled();
    const sendCalls = vi.mocked(sendUserMessageService).mock.calls;
    const sendCall = sendCalls[sendCalls.length - 1];
    expect(sendCall?.[0]).toBe("ws-1");
    expect(sendCall?.[1]).toBe("thread-target");
    expect(sendCall?.[2]).toBe("hello target");
  });

  it("still starts thread when runtime codex args sync fails", async () => {
    const ensureWorkspaceRuntimeCodexArgs = vi.fn(async () => {
      throw new Error("runtime sync failed");
    });
    vi.mocked(startThread).mockResolvedValue({
      result: { thread: { id: "thread-new" } },
    } as Awaited<ReturnType<typeof startThread>>);

    const { result } = renderHook(() =>
      useThreads({
        activeWorkspace: workspace,
        onWorkspaceConnected: vi.fn(),
        ensureWorkspaceRuntimeCodexArgs,
      }),
    );

    let threadId: string | null = null;
    await act(async () => {
      threadId = await result.current.startThread();
    });

    expect(ensureWorkspaceRuntimeCodexArgs).toHaveBeenCalledWith("ws-1", null);
    expect(vi.mocked(startThread)).toHaveBeenCalledWith("ws-1");
    expect(threadId).toBe("thread-new");
  });

});
