// @vitest-environment jsdom
import { act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ConversationItem } from "@/types";
import {
  buildItemsFromThread,
  getThreadTimestamp,
  isReviewingFromThread,
  renderActions,
  resumeThread,
} from "./useThreadActions.test.helpers";

describe("useThreadActions", () => {
  it("clears processing state from resume when latest turns are completed", async () => {
    const localItem: ConversationItem = {
      id: "local-assistant-1",
      kind: "message",
      role: "assistant",
      text: "Local snapshot",
    };
    vi.mocked(resumeThread).mockResolvedValue({
      result: {
        thread: {
          id: "thread-1",
          preview: "Done thread",
          updated_at: 1000,
          turns: [
            { id: "turn-1", status: "completed", items: [] },
            { id: "turn-2", status: "completed", items: [] },
          ],
        },
      },
    });
    vi.mocked(buildItemsFromThread).mockReturnValue([]);
    vi.mocked(isReviewingFromThread).mockReturnValue(false);

    const { result, dispatch } = renderActions({
      itemsByThread: { "thread-1": [localItem] },
      threadStatusById: {
        "thread-1": {
          isProcessing: true,
          hasUnread: false,
          isReviewing: false,
          processingStartedAt: 10,
          lastDurationMs: null,
        },
      },
    });

    await act(async () => {
      await result.current.resumeThreadForWorkspace("ws-1", "thread-1", true, true);
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: "markProcessing",
      threadId: "thread-1",
      isProcessing: false,
      timestamp: expect.any(Number),
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "setActiveTurnId",
      threadId: "thread-1",
      turnId: null,
    });
  });

  it("keeps local processing state when resume turn status is ambiguous", async () => {
    vi.mocked(resumeThread).mockResolvedValue({
      result: {
        thread: {
          id: "thread-1",
          preview: "Still running",
          updated_at: 1000,
          turns: [{ id: "turn-remote", status: "unknown_state", items: [] }],
        },
      },
    });
    vi.mocked(buildItemsFromThread).mockReturnValue([]);
    vi.mocked(isReviewingFromThread).mockReturnValue(false);

    const { result, dispatch } = renderActions({
      threadStatusById: {
        "thread-1": {
          isProcessing: true,
          hasUnread: false,
          isReviewing: false,
          processingStartedAt: 10,
          lastDurationMs: null,
        },
      },
      activeTurnIdByThread: {
        "thread-1": "turn-local",
      },
    });

    await act(async () => {
      await result.current.resumeThreadForWorkspace("ws-1", "thread-1", true, true);
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: "markProcessing",
      threadId: "thread-1",
      isProcessing: true,
      timestamp: expect.any(Number),
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "setActiveTurnId",
      threadId: "thread-1",
      turnId: "turn-local",
    });
  });

  it("uses latest local processing state while resume is in flight", async () => {
    let resolveResume: ((value: Record<string, unknown>) => void) | null = null;
    vi.mocked(resumeThread).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveResume = resolve;
        }),
    );
    vi.mocked(buildItemsFromThread).mockReturnValue([]);
    vi.mocked(isReviewingFromThread).mockReturnValue(false);

    const { args, result, rerender, dispatch } = renderActions({
      threadStatusById: {},
      activeTurnIdByThread: {},
    });

    let resumePromise: Promise<string | null> | null = null;
    await act(async () => {
      resumePromise = result.current.resumeThreadForWorkspace(
        "ws-1",
        "thread-1",
        true,
        true,
      );
    });

    args.threadStatusById = {
      "thread-1": {
        isProcessing: true,
        hasUnread: false,
        isReviewing: false,
        processingStartedAt: 10,
        lastDurationMs: null,
      },
    };
    args.activeTurnIdByThread = {
      "thread-1": "turn-local",
    };
    rerender();

    await act(async () => {
      resolveResume?.({
        result: {
          thread: {
            id: "thread-1",
            turns: [{ id: "turn-remote", status: "unknown_state", items: [] }],
          },
        },
      });
      await resumePromise;
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: "markProcessing",
      threadId: "thread-1",
      isProcessing: true,
      timestamp: expect.any(Number),
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "setActiveTurnId",
      threadId: "thread-1",
      turnId: "turn-local",
    });
  });

  it("hydrates processing state from in-progress turns on resume", async () => {
    vi.mocked(resumeThread).mockResolvedValue({
      result: {
        thread: {
          id: "thread-3",
          preview: "Working thread",
          updated_at: 1000,
          turns: [
            { id: "turn-1", status: "completed", items: [] },
            { id: "turn-2", status: "inProgress", items: [] },
          ],
        },
      },
    });
    vi.mocked(buildItemsFromThread).mockReturnValue([]);
    vi.mocked(isReviewingFromThread).mockReturnValue(false);

    const { result, dispatch } = renderActions();

    await act(async () => {
      await result.current.resumeThreadForWorkspace("ws-1", "thread-3", true);
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: "markProcessing",
      threadId: "thread-3",
      isProcessing: true,
      timestamp: expect.any(Number),
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: "setActiveTurnId",
      threadId: "thread-3",
      turnId: "turn-2",
    });
  });

  it("hydrates processing timestamp from resumed active turn start time", async () => {
    vi.mocked(resumeThread).mockResolvedValue({
      result: {
        thread: {
          id: "thread-3",
          preview: "Working thread",
          updated_at: 1000,
          turns: [
            {
              id: "turn-2",
              status: "inProgress",
              started_at: 1_700_000_000_000,
              items: [],
            },
          ],
        },
      },
    });
    vi.mocked(buildItemsFromThread).mockReturnValue([]);
    vi.mocked(isReviewingFromThread).mockReturnValue(false);

    const { result, dispatch } = renderActions();

    await act(async () => {
      await result.current.resumeThreadForWorkspace("ws-1", "thread-3", true);
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: "markProcessing",
      threadId: "thread-3",
      isProcessing: true,
      timestamp: 1_700_000_000_000,
    });
  });

  it("keeps resume loading true until overlapping resumes finish", async () => {
    let resolveFirst: ((value: unknown) => void) | null = null;
    let resolveSecond: ((value: unknown) => void) | null = null;
    const firstPromise = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    const secondPromise = new Promise((resolve) => {
      resolveSecond = resolve;
    });
    vi.mocked(resumeThread)
      .mockReturnValueOnce(firstPromise as Promise<any>)
      .mockReturnValueOnce(secondPromise as Promise<any>);
    vi.mocked(buildItemsFromThread).mockReturnValue([]);
    vi.mocked(isReviewingFromThread).mockReturnValue(false);
    vi.mocked(getThreadTimestamp).mockReturnValue(0);

    const { result, dispatch } = renderActions();

    let callOne: Promise<string | null> | null = null;
    let callTwo: Promise<string | null> | null = null;
    await act(async () => {
      callOne = result.current.resumeThreadForWorkspace("ws-1", "thread-3", true);
      callTwo = result.current.resumeThreadForWorkspace("ws-1", "thread-3", true);
    });

    expect(dispatch).toHaveBeenCalledWith({
      type: "setThreadResumeLoading",
      threadId: "thread-3",
      isLoading: true,
    });

    await act(async () => {
      resolveFirst?.({ result: { thread: { id: "thread-3" } } });
      await firstPromise;
    });

    expect(dispatch).not.toHaveBeenCalledWith({
      type: "setThreadResumeLoading",
      threadId: "thread-3",
      isLoading: false,
    });

    await act(async () => {
      resolveSecond?.({ result: { thread: { id: "thread-3" } } });
      await Promise.all([callOne, callTwo]);
    });

    const loadingFalseCalls = dispatch.mock.calls.filter(
      ([action]) =>
        action?.type === "setThreadResumeLoading" &&
        action?.threadId === "thread-3" &&
        action?.isLoading === false,
    );
    expect(loadingFalseCalls).toHaveLength(1);
  });

});
