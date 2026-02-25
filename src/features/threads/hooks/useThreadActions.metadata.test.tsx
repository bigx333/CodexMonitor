// @vitest-environment jsdom
import { act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  archiveThread,
  buildItemsFromThread,
  getThreadTimestamp,
  listThreads,
  renderActions,
  resumeThread,
  workspace,
  isReviewingFromThread,
} from "./useThreadActions.test.helpers";

describe("useThreadActions", () => {
  it("detects model metadata from list responses", async () => {
    vi.mocked(listThreads).mockResolvedValue({
      result: {
        data: [
          {
            id: "thread-model-1",
            cwd: "/tmp/codex",
            preview: "Uses gpt-5",
            updated_at: 5000,
            model: "gpt-5-codex",
            reasoning_effort: "high",
          },
        ],
        nextCursor: null,
      },
    });
    vi.mocked(getThreadTimestamp).mockImplementation((thread) => {
      const value = (thread as Record<string, unknown>).updated_at as number;
      return value ?? 0;
    });

    const onThreadCodexMetadataDetected = vi.fn();
    const { result } = renderActions({ onThreadCodexMetadataDetected });

    await act(async () => {
      await result.current.listThreadsForWorkspace(workspace);
    });

    expect(onThreadCodexMetadataDetected).toHaveBeenCalledWith(
      "ws-1",
      "thread-model-1",
      { modelId: "gpt-5-codex", effort: "high" },
    );
  });

  it("detects model metadata when resuming a thread", async () => {
    vi.mocked(resumeThread).mockResolvedValue({
      result: {
        thread: {
          id: "thread-resume-model",
          preview: "resume preview",
          updated_at: 1200,
          turns: [
            {
              items: [
                {
                  type: "turnContext",
                  payload: {
                    info: {
                      model: "gpt-5.3-codex",
                      reasoning_effort: "medium",
                    },
                  },
                },
              ],
            },
          ],
        },
      },
    });
    vi.mocked(buildItemsFromThread).mockReturnValue([]);
    vi.mocked(isReviewingFromThread).mockReturnValue(false);
    vi.mocked(getThreadTimestamp).mockReturnValue(1200);

    const onThreadCodexMetadataDetected = vi.fn();
    const { result } = renderActions({ onThreadCodexMetadataDetected });

    await act(async () => {
      await result.current.resumeThreadForWorkspace("ws-1", "thread-resume-model");
    });

    expect(onThreadCodexMetadataDetected).toHaveBeenCalledWith(
      "ws-1",
      "thread-resume-model",
      { modelId: "gpt-5.3-codex", effort: "medium" },
    );
  });

  it("archives threads and reports errors", async () => {
    vi.mocked(archiveThread).mockRejectedValue(new Error("nope"));
    const onDebug = vi.fn();
    const { result } = renderActions({ onDebug });

    await act(async () => {
      await result.current.archiveThread("ws-1", "thread-9");
    });

    expect(archiveThread).toHaveBeenCalledWith("ws-1", "thread-9");
    expect(onDebug).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "error",
        label: "thread/archive error",
        payload: "nope",
      }),
    );
  });
});
