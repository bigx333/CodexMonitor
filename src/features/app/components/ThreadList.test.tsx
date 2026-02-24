// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ThreadSummary } from "../../../types";
import { ThreadList } from "./ThreadList";

afterEach(() => {
  cleanup();
});

const nestedThread: ThreadSummary = {
  id: "thread-2",
  name: "Nested Agent",
  updatedAt: 900,
};

const deepThread: ThreadSummary = {
  id: "thread-3",
  name: "Deep Agent",
  updatedAt: 800,
};

const thread: ThreadSummary = {
  id: "thread-1",
  name: "Alpha",
  updatedAt: 1000,
};

const statusMap = {
  "thread-1": { isProcessing: false, hasUnread: true, isReviewing: false },
  "thread-2": { isProcessing: false, hasUnread: false, isReviewing: false },
};

const baseProps = {
  workspaceId: "ws-1",
  pinnedRows: [],
  unpinnedRows: [{ thread, depth: 0 }],
  totalThreadRoots: 1,
  isExpanded: false,
  nextCursor: null,
  isPaging: false,
  nested: false,
  activeWorkspaceId: "ws-1",
  activeThreadId: "thread-1",
  threadStatusById: statusMap,
  getThreadTime: () => "2m",
  isThreadPinned: () => false,
  onToggleExpanded: vi.fn(),
  onLoadOlderThreads: vi.fn(),
  onSelectThread: vi.fn(),
  onShowThreadMenu: vi.fn(),
};

describe("ThreadList", () => {
  it("renders active row and handles click/context menu", () => {
    const onSelectThread = vi.fn();
    const onShowThreadMenu = vi.fn();

    render(
      <ThreadList
        {...baseProps}
        onSelectThread={onSelectThread}
        onShowThreadMenu={onShowThreadMenu}
      />,
    );

    const row = screen.getByText("Alpha").closest(".thread-row");
    expect(row).toBeTruthy();
    if (!row) {
      throw new Error("Missing thread row");
    }
    expect(row.classList.contains("active")).toBe(true);
    expect(row.querySelector(".thread-status")?.className).toContain("unread");

    fireEvent.click(row);
    expect(onSelectThread).toHaveBeenCalledWith("ws-1", "thread-1");

    fireEvent.contextMenu(row);
    expect(onShowThreadMenu).toHaveBeenCalledWith(
      expect.anything(),
      "ws-1",
      "thread-1",
      true,
    );
  });

  it("shows the more button and toggles expanded", () => {
    const onToggleExpanded = vi.fn();
    render(
      <ThreadList
        {...baseProps}
        totalThreadRoots={4}
        onToggleExpanded={onToggleExpanded}
      />,
    );

    const moreButton = screen.getByRole("button", { name: "More..." });
    fireEvent.click(moreButton);
    expect(onToggleExpanded).toHaveBeenCalledWith("ws-1");
  });

  it("loads older threads when a cursor is available", () => {
    const onLoadOlderThreads = vi.fn();
    render(
      <ThreadList
        {...baseProps}
        nextCursor="cursor"
        onLoadOlderThreads={onLoadOlderThreads}
      />,
    );

    const loadButton = screen.getByRole("button", { name: "Load older..." });
    fireEvent.click(loadButton);
    expect(onLoadOlderThreads).toHaveBeenCalledWith("ws-1");
  });

  it("renders nested rows with indentation and disables pinning", () => {
    const onShowThreadMenu = vi.fn();
    render(
      <ThreadList
        {...baseProps}
        nested
        unpinnedRows={[
          { thread, depth: 0 },
          { thread: nestedThread, depth: 1 },
        ]}
        onShowThreadMenu={onShowThreadMenu}
      />,
    );

    const nestedRow = screen.getByText("Nested Agent").closest(".thread-row");
    expect(nestedRow).toBeTruthy();
    if (!nestedRow) {
      throw new Error("Missing nested thread row");
    }
    expect(nestedRow.getAttribute("style")).toContain("--thread-indent");

    fireEvent.contextMenu(nestedRow);
    expect(onShowThreadMenu).toHaveBeenCalledWith(
      expect.anything(),
      "ws-1",
      "thread-2",
      false,
    );
  });

  it("shows blue unread-style status when a thread is waiting for user input", () => {
    const { container } = render(
      <ThreadList
        {...baseProps}
        threadStatusById={{
          "thread-1": { isProcessing: true, hasUnread: false, isReviewing: false },
          "thread-2": { isProcessing: false, hasUnread: false, isReviewing: false },
        }}
        pendingUserInputKeys={new Set(["ws-1:thread-1"])}
      />,
    );

    const row = container.querySelector(".thread-row");
    expect(row).toBeTruthy();
    expect(row?.querySelector(".thread-name")?.textContent).toBe("Alpha");
    expect(row?.querySelector(".thread-status")?.className).toContain("unread");
    expect(row?.querySelector(".thread-status")?.className).not.toContain("processing");
  });

  it("collapses child rows by default and supports multi-depth expansion", () => {
    const expandedKeys = new Set<string>();
    const isThreadChildrenExpanded = (workspaceId: string, threadId: string) =>
      expandedKeys.has(`${workspaceId}:${threadId}`);
    const onToggleThreadChildren = (workspaceId: string, threadId: string) => {
      const key = `${workspaceId}:${threadId}`;
      if (expandedKeys.has(key)) {
        expandedKeys.delete(key);
      } else {
        expandedKeys.add(key);
      }
    };
    const onSelectThread = vi.fn();
    const { rerender } = render(
      <ThreadList
        {...baseProps}
        unpinnedRows={[
          { thread, depth: 0 },
          { thread: nestedThread, depth: 1 },
          { thread: deepThread, depth: 2 },
        ]}
        isThreadChildrenExpanded={isThreadChildrenExpanded}
        onToggleThreadChildren={onToggleThreadChildren}
        onSelectThread={onSelectThread}
      />,
    );

    expect(screen.getAllByText("Alpha").length).toBeGreaterThan(0);
    expect(screen.queryByText("Nested Agent")).toBeNull();
    expect(screen.queryByText("Deep Agent")).toBeNull();

    const rootRow = screen.getByText("Alpha").closest(".thread-row");
    if (!(rootRow instanceof HTMLElement)) {
      throw new Error("Missing root row");
    }
    const rootToggle = within(rootRow).getByRole("button", { name: "Expand sub-agents" });
    fireEvent.click(rootToggle);
    expect(onSelectThread).not.toHaveBeenCalled();
    rerender(
      <ThreadList
        {...baseProps}
        unpinnedRows={[
          { thread, depth: 0 },
          { thread: nestedThread, depth: 1 },
          { thread: deepThread, depth: 2 },
        ]}
        isThreadChildrenExpanded={isThreadChildrenExpanded}
        onToggleThreadChildren={onToggleThreadChildren}
        onSelectThread={onSelectThread}
      />,
    );

    const nestedRow = screen.getByText("Nested Agent").closest(".thread-row");
    expect(screen.queryByText("Deep Agent")).toBeNull();
    if (!(nestedRow instanceof HTMLElement)) {
      throw new Error("Missing nested row after expansion");
    }
    const nestedToggle = within(nestedRow).getByRole("button", { name: "Expand sub-agents" });
    fireEvent.click(nestedToggle);
    rerender(
      <ThreadList
        {...baseProps}
        unpinnedRows={[
          { thread, depth: 0 },
          { thread: nestedThread, depth: 1 },
          { thread: deepThread, depth: 2 },
        ]}
        isThreadChildrenExpanded={isThreadChildrenExpanded}
        onToggleThreadChildren={onToggleThreadChildren}
      />,
    );

    expect(screen.getByText("Deep Agent")).toBeTruthy();
  });
});
