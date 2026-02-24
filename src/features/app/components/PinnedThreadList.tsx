import { useMemo } from "react";
import type { MouseEvent } from "react";

import type { ThreadSummary } from "../../../types";
import type { ThreadStatusById } from "../../../utils/threadStatus";
import {
  buildVisibleThreadRows,
  type IsThreadChildrenExpanded,
} from "../utils/threadRowVisibility";
import { ThreadRow } from "./ThreadRow";

type PinnedThreadRow = {
  thread: ThreadSummary;
  depth: number;
  workspaceId: string;
};

type PinnedThreadListProps = {
  rows: PinnedThreadRow[];
  activeWorkspaceId: string | null;
  activeThreadId: string | null;
  threadStatusById: ThreadStatusById;
  pendingUserInputKeys?: Set<string>;
  getWorkspaceLabel?: (workspaceId: string) => string | null;
  getThreadTime: (thread: ThreadSummary) => string | null;
  getThreadArgsBadge?: (workspaceId: string, threadId: string) => string | null;
  isThreadPinned: (workspaceId: string, threadId: string) => boolean;
  isThreadChildrenExpanded?: IsThreadChildrenExpanded;
  onSelectThread: (workspaceId: string, threadId: string) => void;
  onShowThreadMenu: (
    event: MouseEvent,
    workspaceId: string,
    threadId: string,
    canPin: boolean,
  ) => void;
  onToggleThreadChildren?: (workspaceId: string, threadId: string) => void;
};

export function PinnedThreadList({
  rows,
  activeWorkspaceId,
  activeThreadId,
  threadStatusById,
  pendingUserInputKeys,
  getWorkspaceLabel,
  getThreadTime,
  getThreadArgsBadge,
  isThreadPinned,
  isThreadChildrenExpanded,
  onSelectThread,
  onShowThreadMenu,
  onToggleThreadChildren,
}: PinnedThreadListProps) {
  const visibleRows = useMemo(
    () =>
      buildVisibleThreadRows(
        rows,
        (row) => row.workspaceId,
        isThreadChildrenExpanded,
      ),
    [isThreadChildrenExpanded, rows],
  );

  return (
    <div className="thread-list pinned-thread-list">
      {visibleRows.map(({ row, hasChildren, isChildrenExpanded }) => {
        const { thread, depth, workspaceId } = row;
        return (
          <ThreadRow
            key={`${workspaceId}:${thread.id}`}
            thread={thread}
            depth={depth}
            hasChildren={hasChildren}
            isChildrenExpanded={isChildrenExpanded}
            workspaceId={workspaceId}
            indentUnit={14}
            activeWorkspaceId={activeWorkspaceId}
            activeThreadId={activeThreadId}
            threadStatusById={threadStatusById}
            pendingUserInputKeys={pendingUserInputKeys}
            workspaceLabel={getWorkspaceLabel?.(workspaceId) ?? null}
            getThreadTime={getThreadTime}
            getThreadArgsBadge={getThreadArgsBadge}
            isThreadPinned={isThreadPinned}
            onSelectThread={onSelectThread}
            onShowThreadMenu={onShowThreadMenu}
            onToggleChildren={onToggleThreadChildren}
          />
        );
      })}
    </div>
  );
}
