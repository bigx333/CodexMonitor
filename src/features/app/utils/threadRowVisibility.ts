import type { ThreadSummary } from "../../../types";

type ThreadRowLike = {
  thread: ThreadSummary;
  depth: number;
};

export type VisibleThreadRow<T extends ThreadRowLike> = {
  row: T;
  hasChildren: boolean;
  isChildrenExpanded: boolean;
};

export type IsThreadChildrenExpanded = (
  workspaceId: string,
  threadId: string,
) => boolean;

export function buildVisibleThreadRows<T extends ThreadRowLike>(
  rows: T[],
  getWorkspaceId: (row: T) => string,
  isThreadChildrenExpanded?: IsThreadChildrenExpanded,
): VisibleThreadRow<T>[] {
  const visibleRows: VisibleThreadRow<T>[] = [];
  let collapsedDepth: number | null = null;

  rows.forEach((row, index) => {
    if (collapsedDepth !== null) {
      if (row.depth > collapsedDepth) {
        return;
      }
      collapsedDepth = null;
    }

    const nextRow = rows[index + 1];
    const hasChildren = Boolean(nextRow && nextRow.depth > row.depth);
    const workspaceId = getWorkspaceId(row);
    const isChildrenExpanded = hasChildren
      ? isThreadChildrenExpanded
        ? isThreadChildrenExpanded(workspaceId, row.thread.id)
        : true
      : false;

    visibleRows.push({
      row,
      hasChildren,
      isChildrenExpanded,
    });

    if (hasChildren && !isChildrenExpanded) {
      collapsedDepth = row.depth;
    }
  });

  return visibleRows;
}
