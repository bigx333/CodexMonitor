import { useMemo } from "react";
import type { MouseEvent } from "react";

import type { ThreadSummary } from "../../../types";
import type { ThreadStatusById } from "../../../utils/threadStatus";
import {
  buildVisibleThreadRows,
  type IsThreadChildrenExpanded,
} from "../utils/threadRowVisibility";
import { ThreadRow } from "./ThreadRow";

type ThreadListRow = {
  thread: ThreadSummary;
  depth: number;
};

type ThreadListProps = {
  workspaceId: string;
  pinnedRows: ThreadListRow[];
  unpinnedRows: ThreadListRow[];
  totalThreadRoots: number;
  isExpanded: boolean;
  nextCursor: string | null;
  isPaging: boolean;
  nested?: boolean;
  showLoadOlder?: boolean;
  activeWorkspaceId: string | null;
  activeThreadId: string | null;
  threadStatusById: ThreadStatusById;
  pendingUserInputKeys?: Set<string>;
  getThreadTime: (thread: ThreadSummary) => string | null;
  getThreadArgsBadge?: (workspaceId: string, threadId: string) => string | null;
  isThreadPinned: (workspaceId: string, threadId: string) => boolean;
  isThreadChildrenExpanded?: IsThreadChildrenExpanded;
  onToggleExpanded: (workspaceId: string) => void;
  onLoadOlderThreads: (workspaceId: string) => void;
  onSelectThread: (workspaceId: string, threadId: string) => void;
  onShowThreadMenu: (
    event: MouseEvent,
    workspaceId: string,
    threadId: string,
    canPin: boolean,
  ) => void;
  onToggleThreadChildren?: (workspaceId: string, threadId: string) => void;
};

export function ThreadList({
  workspaceId,
  pinnedRows,
  unpinnedRows,
  totalThreadRoots,
  isExpanded,
  nextCursor,
  isPaging,
  nested,
  showLoadOlder = true,
  activeWorkspaceId,
  activeThreadId,
  threadStatusById,
  pendingUserInputKeys,
  getThreadTime,
  getThreadArgsBadge,
  isThreadPinned,
  isThreadChildrenExpanded,
  onToggleExpanded,
  onLoadOlderThreads,
  onSelectThread,
  onShowThreadMenu,
  onToggleThreadChildren,
}: ThreadListProps) {
  const indentUnit = nested ? 10 : 14;
  const visiblePinnedRows = useMemo(
    () =>
      buildVisibleThreadRows(
        pinnedRows,
        () => workspaceId,
        isThreadChildrenExpanded,
      ),
    [isThreadChildrenExpanded, pinnedRows, workspaceId],
  );
  const visibleUnpinnedRows = useMemo(
    () =>
      buildVisibleThreadRows(
        unpinnedRows,
        () => workspaceId,
        isThreadChildrenExpanded,
      ),
    [isThreadChildrenExpanded, unpinnedRows, workspaceId],
  );

  return (
    <div className={`thread-list${nested ? " thread-list-nested" : ""}`}>
      {visiblePinnedRows.map(({ row, hasChildren, isChildrenExpanded }) => (
        <ThreadRow
          key={row.thread.id}
          thread={row.thread}
          depth={row.depth}
          hasChildren={hasChildren}
          isChildrenExpanded={isChildrenExpanded}
          workspaceId={workspaceId}
          indentUnit={indentUnit}
          activeWorkspaceId={activeWorkspaceId}
          activeThreadId={activeThreadId}
          threadStatusById={threadStatusById}
          pendingUserInputKeys={pendingUserInputKeys}
          getThreadTime={getThreadTime}
          getThreadArgsBadge={getThreadArgsBadge}
          isThreadPinned={isThreadPinned}
          onSelectThread={onSelectThread}
          onShowThreadMenu={onShowThreadMenu}
          onToggleChildren={onToggleThreadChildren}
        />
      ))}
      {visiblePinnedRows.length > 0 && visibleUnpinnedRows.length > 0 && (
        <div className="thread-list-separator" aria-hidden="true" />
      )}
      {visibleUnpinnedRows.map(({ row, hasChildren, isChildrenExpanded }) => (
        <ThreadRow
          key={row.thread.id}
          thread={row.thread}
          depth={row.depth}
          hasChildren={hasChildren}
          isChildrenExpanded={isChildrenExpanded}
          workspaceId={workspaceId}
          indentUnit={indentUnit}
          activeWorkspaceId={activeWorkspaceId}
          activeThreadId={activeThreadId}
          threadStatusById={threadStatusById}
          pendingUserInputKeys={pendingUserInputKeys}
          getThreadTime={getThreadTime}
          getThreadArgsBadge={getThreadArgsBadge}
          isThreadPinned={isThreadPinned}
          onSelectThread={onSelectThread}
          onShowThreadMenu={onShowThreadMenu}
          onToggleChildren={onToggleThreadChildren}
        />
      ))}
      {totalThreadRoots > 3 && (
        <button
          className="thread-more"
          onClick={(event) => {
            event.stopPropagation();
            onToggleExpanded(workspaceId);
          }}
        >
          {isExpanded ? "Show less" : "More..."}
        </button>
      )}
      {showLoadOlder && nextCursor && (isExpanded || totalThreadRoots <= 3) && (
        <button
          className="thread-more"
          onClick={(event) => {
            event.stopPropagation();
            onLoadOlderThreads(workspaceId);
          }}
          disabled={isPaging}
        >
          {isPaging
            ? "Loading..."
            : totalThreadRoots === 0
              ? "Search older..."
              : "Load older..."}
        </button>
      )}
    </div>
  );
}
