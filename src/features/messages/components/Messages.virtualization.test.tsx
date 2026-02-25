/** @vitest-environment jsdom */
import { act, render } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConversationItem } from "../../../types";
import { Messages } from "./Messages";

const measureMock = vi.fn();

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: () => ({
    getVirtualItems: () => [{ key: "entry-0", index: 0, start: 0 }],
    getTotalSize: () => 80,
    measureElement: () => {},
    measure: measureMock,
  }),
}));

vi.mock("../hooks/useFileLinkOpener", () => ({
  useFileLinkOpener: () => ({
    openFileLink: vi.fn(),
    showFileLinkMenu: vi.fn(),
  }),
}));

describe("Messages virtualization resize handling", () => {
  beforeAll(() => {
    if (typeof window.ResizeObserver !== "undefined") {
      return;
    }

    class ResizeObserverMock {
      observe() {}
      disconnect() {}
    }

    (window as unknown as { ResizeObserver: typeof ResizeObserverMock }).ResizeObserver =
      ResizeObserverMock;
  });

  beforeEach(() => {
    measureMock.mockReset();
  });

  it("re-measures rows when window viewport changes", () => {
    const addEventListenerSpy = vi.spyOn(window, "addEventListener");
    const items: ConversationItem[] = [
      {
        id: "msg-1",
        kind: "message",
        role: "assistant",
        text: "hello",
      },
    ];

    render(
      <Messages
        items={items}
        threadId="thread-1"
        workspaceId="ws-1"
        isThinking={false}
        openTargets={[]}
        selectedOpenAppId=""
      />,
    );

    measureMock.mockClear();

    const resizeHandler = addEventListenerSpy.mock.calls.find(
      ([eventName]) => eventName === "resize",
    )?.[1] as EventListener | undefined;
    const orientationHandler = addEventListenerSpy.mock.calls.find(
      ([eventName]) => eventName === "orientationchange",
    )?.[1] as EventListener | undefined;

    expect(resizeHandler).toBeTypeOf("function");
    expect(orientationHandler).toBeTypeOf("function");

    act(() => {
      resizeHandler?.(new Event("resize"));
    });
    expect(measureMock).toHaveBeenCalledTimes(1);

    act(() => {
      orientationHandler?.(new Event("orientationchange"));
    });
    expect(measureMock).toHaveBeenCalledTimes(2);

    addEventListenerSpy.mockRestore();
  });
});
