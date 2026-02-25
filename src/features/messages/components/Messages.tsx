import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode, RefObject } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down";
import ChevronUp from "lucide-react/dist/esm/icons/chevron-up";
import type {
  ConversationItem,
  OpenAppTarget,
  RequestUserInputRequest,
  RequestUserInputResponse,
} from "../../../types";
import { isPlanReadyTaggedMessage } from "../../../utils/internalPlanReadyMessages";
import { PlanReadyFollowupMessage } from "../../app/components/PlanReadyFollowupMessage";
import { RequestUserInputMessage } from "../../app/components/RequestUserInputMessage";
import { useFileLinkOpener } from "../hooks/useFileLinkOpener";
import {
  SCROLL_THRESHOLD_PX,
  buildToolGroups,
  computePlanFollowupState,
  formatCount,
  type MessageListEntry,
  parseReasoning,
  scrollKeyForItems,
} from "../utils/messageRenderUtils";
import {
  DiffRow,
  ExploreRow,
  MessageRow,
  ReasoningRow,
  ReviewRow,
  ToolRow,
  WorkingIndicator,
} from "./MessageRows";

type MessagesProps = {
  items: ConversationItem[];
  threadId: string | null;
  workspaceId?: string | null;
  isThinking: boolean;
  isLoadingMessages?: boolean;
  processingStartedAt?: number | null;
  lastDurationMs?: number | null;
  showPollingFetchStatus?: boolean;
  pollingIntervalMs?: number;
  workspacePath?: string | null;
  openTargets: OpenAppTarget[];
  selectedOpenAppId: string;
  codeBlockCopyUseModifier?: boolean;
  showMessageFilePath?: boolean;
  userInputRequests?: RequestUserInputRequest[];
  onUserInputSubmit?: (
    request: RequestUserInputRequest,
    response: RequestUserInputResponse,
  ) => void;
  onPlanAccept?: () => void;
  onPlanSubmitChanges?: (changes: string) => void;
  onOpenThreadLink?: (threadId: string) => void;
  onQuoteMessage?: (text: string) => void;
};

function toMarkdownQuote(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join("\n")
    .concat("\n\n");
}

type VirtualizedGroupedListProps = {
  containerRef: RefObject<HTMLDivElement | null>;
  groupedItems: MessageListEntry[];
  collapsedToolGroups: Set<string>;
  expandedItems: Set<string>;
  groupedEntryKey: (entry: MessageListEntry, index: number) => string;
  renderGroupedEntry: (entry: MessageListEntry) => ReactNode;
  requestAutoScroll: () => void;
};

const VirtualizedGroupedList = memo(function VirtualizedGroupedList({
  containerRef,
  groupedItems,
  collapsedToolGroups,
  expandedItems,
  groupedEntryKey,
  renderGroupedEntry,
  requestAutoScroll,
}: VirtualizedGroupedListProps) {
  const virtualizer = useVirtualizer({
    count: groupedItems.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => 80,
    initialRect: { width: 0, height: 800 },
    overscan: 5,
    getItemKey: (index) => {
      const entry = groupedItems[index];
      if (!entry) {
        return `entry-${index}`;
      }
      return groupedEntryKey(entry, index);
    },
  });
  const virtualItems = virtualizer.getVirtualItems();
  const virtualTotalSize = virtualizer.getTotalSize();
  const bootstrapVirtualItems = useMemo(() => {
    if (virtualItems.length > 0 || groupedItems.length === 0) {
      return [];
    }
    const bootstrapCount = Math.min(groupedItems.length, 15);
    return Array.from({ length: bootstrapCount }, (_, index) => ({
      key: groupedEntryKey(groupedItems[index], index),
      index,
      start: index * 80,
    }));
  }, [groupedEntryKey, groupedItems, virtualItems]);
  const rowsToRender =
    virtualItems.length > 0 ? virtualItems : bootstrapVirtualItems;
  const virtualCanvasHeight =
    virtualItems.length > 0 ? virtualTotalSize : groupedItems.length * 80;

  useLayoutEffect(() => {
    virtualizer.measure();
  }, [collapsedToolGroups, expandedItems, groupedItems, virtualizer]);

  useLayoutEffect(() => {
    const remeasure = () => {
      virtualizer.measure();
    };

    const viewport = window.visualViewport;
    const resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(() => {
          remeasure();
        });
    let observedContainer: Element | null = null;
    const observeContainer = () => {
      const container = containerRef.current;
      if (!container || !resizeObserver) {
        return;
      }
      resizeObserver.observe(container);
      observedContainer = container;
    };

    observeContainer();
    const observeFrameId = window.requestAnimationFrame(observeContainer);
    window.addEventListener("resize", remeasure, { passive: true });
    window.addEventListener("orientationchange", remeasure, { passive: true });
    viewport?.addEventListener("resize", remeasure, { passive: true });

    return () => {
      window.cancelAnimationFrame(observeFrameId);
      if (observedContainer) {
        resizeObserver?.unobserve(observedContainer);
      }
      resizeObserver?.disconnect();
      window.removeEventListener("resize", remeasure);
      window.removeEventListener("orientationchange", remeasure);
      viewport?.removeEventListener("resize", remeasure);
    };
  }, [containerRef, virtualizer]);

  useLayoutEffect(() => {
    requestAutoScroll();
  }, [requestAutoScroll, virtualCanvasHeight]);

  return (
    <div
      style={{
        position: "relative",
        height: `${virtualCanvasHeight}px`,
      }}
    >
      {rowsToRender.map((virtualItem) => {
        const entry = groupedItems[virtualItem.index];
        if (!entry) {
          return null;
        }
        return (
          <div
            key={virtualItem.key}
            data-index={virtualItem.index}
            ref={virtualizer.measureElement}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              display: "flex",
              flexDirection: "column",
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            {renderGroupedEntry(entry)}
          </div>
        );
      })}
    </div>
  );
});

export const Messages = memo(function Messages({
  items,
  threadId,
  workspaceId = null,
  isThinking,
  isLoadingMessages = false,
  processingStartedAt = null,
  lastDurationMs = null,
  showPollingFetchStatus = false,
  pollingIntervalMs = 12000,
  workspacePath = null,
  openTargets,
  selectedOpenAppId,
  codeBlockCopyUseModifier = false,
  showMessageFilePath = true,
  userInputRequests = [],
  onUserInputSubmit,
  onPlanAccept,
  onPlanSubmitChanges,
  onOpenThreadLink,
  onQuoteMessage,
}: MessagesProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const autoScrollRef = useRef(true);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const manuallyToggledExpandedRef = useRef<Set<string>>(new Set());
  const [collapsedToolGroups, setCollapsedToolGroups] = useState<Set<string>>(
    new Set(),
  );
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const copyTimeoutRef = useRef<number | null>(null);
  const activeUserInputRequestId =
    threadId && userInputRequests.length
      ? (userInputRequests.find(
          (request) =>
            request.params.thread_id === threadId &&
            (!workspaceId || request.workspace_id === workspaceId),
        )?.request_id ?? null)
      : null;
  const scrollKey = `${scrollKeyForItems(items)}-${activeUserInputRequestId ?? "no-input"}`;
  const { openFileLink, showFileLinkMenu } = useFileLinkOpener(
    workspacePath,
    openTargets,
    selectedOpenAppId,
  );

  const isNearBottom = useCallback(
    (node: HTMLDivElement) =>
      node.scrollHeight - node.scrollTop - node.clientHeight <= SCROLL_THRESHOLD_PX,
    [],
  );

  const updateAutoScroll = () => {
    if (!containerRef.current) {
      return;
    }
    autoScrollRef.current = isNearBottom(containerRef.current);
  };

  const requestAutoScroll = useCallback(() => {
    const container = containerRef.current;
    const shouldScroll =
      autoScrollRef.current || (container ? isNearBottom(container) : true);
    if (!shouldScroll) {
      return;
    }
    if (container) {
      container.scrollTop = container.scrollHeight;
      return;
    }
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [isNearBottom]);

  useLayoutEffect(() => {
    autoScrollRef.current = true;
  }, [threadId]);

  const toggleExpanded = useCallback((id: string) => {
    manuallyToggledExpandedRef.current.add(id);
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleToolGroup = useCallback((id: string) => {
    setCollapsedToolGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const reasoningMetaById = useMemo(() => {
    const meta = new Map<string, ReturnType<typeof parseReasoning>>();
    items.forEach((item) => {
      if (item.kind === "reasoning") {
        meta.set(item.id, parseReasoning(item));
      }
    });
    return meta;
  }, [items]);

  const latestReasoningLabel = useMemo(() => {
    for (let index = items.length - 1; index >= 0; index -= 1) {
      const item = items[index];
      if (item.kind === "message") {
        break;
      }
      if (item.kind !== "reasoning") {
        continue;
      }
      const parsed = reasoningMetaById.get(item.id);
      if (parsed?.workingLabel) {
        return parsed.workingLabel;
      }
    }
    return null;
  }, [items, reasoningMetaById]);

  const visibleItems = useMemo(
    () =>
      items.filter((item) => {
        if (
          item.kind === "message" &&
          item.role === "user" &&
          isPlanReadyTaggedMessage(item.text)
        ) {
          return false;
        }
        if (item.kind !== "reasoning") {
          return true;
        }
        return reasoningMetaById.get(item.id)?.hasBody ?? false;
      }),
    [items, reasoningMetaById],
  );

  useEffect(() => {
    for (let index = visibleItems.length - 1; index >= 0; index -= 1) {
      const item = visibleItems[index];
      if (
        item.kind === "tool" &&
        item.toolType === "plan" &&
        (item.output ?? "").trim().length > 0
      ) {
        if (manuallyToggledExpandedRef.current.has(item.id)) {
          return;
        }
        setExpandedItems((prev) => {
          if (prev.has(item.id)) {
            return prev;
          }
          const next = new Set(prev);
          next.add(item.id);
          return next;
        });
        return;
      }
    }
  }, [visibleItems]);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        window.clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const handleCopyMessage = useCallback(
    async (item: Extract<ConversationItem, { kind: "message" }>) => {
      try {
        await navigator.clipboard.writeText(item.text);
        setCopiedMessageId(item.id);
        if (copyTimeoutRef.current) {
          window.clearTimeout(copyTimeoutRef.current);
        }
        copyTimeoutRef.current = window.setTimeout(() => {
          setCopiedMessageId(null);
        }, 1200);
      } catch {
        // No-op: clipboard errors can occur in restricted contexts.
      }
    },
    [],
  );

  const handleQuoteMessage = useCallback(
    (item: Extract<ConversationItem, { kind: "message" }>) => {
      if (!onQuoteMessage) {
        return;
      }
      const quoteText = toMarkdownQuote(item.text);
      if (!quoteText) {
        return;
      }
      onQuoteMessage(quoteText);
    },
    [onQuoteMessage],
  );

  const groupedItems = useMemo(() => buildToolGroups(visibleItems), [visibleItems]);
  const groupedEntryKey = useCallback((entry: MessageListEntry, index: number) => {
    if (entry.kind === "toolGroup") {
      return `tool-group-${entry.group.id}`;
    }
    return entry.item.id || `item-${index}`;
  }, []);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const shouldScroll =
      autoScrollRef.current ||
      (container ? isNearBottom(container) : true);
    if (!shouldScroll) {
      return;
    }
    if (container) {
      container.scrollTop = container.scrollHeight;
      return;
    }
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [scrollKey, isThinking, isNearBottom, threadId]);

  const hasActiveUserInputRequest = activeUserInputRequestId !== null;
  const hasVisibleUserInputRequest = hasActiveUserInputRequest && Boolean(onUserInputSubmit);
  const userInputNode =
    hasActiveUserInputRequest && onUserInputSubmit ? (
      <RequestUserInputMessage
        requests={userInputRequests}
        activeThreadId={threadId}
        activeWorkspaceId={workspaceId}
        onSubmit={onUserInputSubmit}
      />
    ) : null;

  const [dismissedPlanFollowupByThread, setDismissedPlanFollowupByThread] =
    useState<Record<string, string>>({});

  const planFollowup = useMemo(() => {
    if (!onPlanAccept || !onPlanSubmitChanges) {
      return { shouldShow: false, planItemId: null };
    }

    const candidate = computePlanFollowupState({
      threadId,
      items,
      isThinking,
      hasVisibleUserInputRequest,
    });

    if (threadId && candidate.planItemId) {
      if (dismissedPlanFollowupByThread[threadId] === candidate.planItemId) {
        return { ...candidate, shouldShow: false };
      }
    }

    return candidate;
  }, [
    dismissedPlanFollowupByThread,
    hasVisibleUserInputRequest,
    isThinking,
    items,
    onPlanAccept,
    onPlanSubmitChanges,
    threadId,
  ]);

  const planFollowupNode =
    planFollowup.shouldShow && onPlanAccept && onPlanSubmitChanges ? (
      <PlanReadyFollowupMessage
        onAccept={() => {
          if (threadId && planFollowup.planItemId) {
            setDismissedPlanFollowupByThread((prev) => ({
              ...prev,
              [threadId]: planFollowup.planItemId!,
            }));
          }
          onPlanAccept();
        }}
        onSubmitChanges={(changes) => {
          if (threadId && planFollowup.planItemId) {
            setDismissedPlanFollowupByThread((prev) => ({
              ...prev,
              [threadId]: planFollowup.planItemId!,
            }));
          }
          onPlanSubmitChanges(changes);
        }}
      />
    ) : null;

  const renderItem = (item: ConversationItem) => {
    if (item.kind === "message") {
      const isCopied = copiedMessageId === item.id;
      return (
        <MessageRow
          key={item.id}
          item={item}
          isCopied={isCopied}
          onCopy={handleCopyMessage}
          onQuote={onQuoteMessage ? handleQuoteMessage : undefined}
          codeBlockCopyUseModifier={codeBlockCopyUseModifier}
          showMessageFilePath={showMessageFilePath}
          workspacePath={workspacePath}
          onOpenFileLink={openFileLink}
          onOpenFileLinkMenu={showFileLinkMenu}
          onOpenThreadLink={onOpenThreadLink}
        />
      );
    }
    if (item.kind === "reasoning") {
      const isExpanded = expandedItems.has(item.id);
      const parsed = reasoningMetaById.get(item.id) ?? parseReasoning(item);
      return (
        <ReasoningRow
          key={item.id}
          item={item}
          parsed={parsed}
          isExpanded={isExpanded}
          onToggle={toggleExpanded}
          showMessageFilePath={showMessageFilePath}
          workspacePath={workspacePath}
          onOpenFileLink={openFileLink}
          onOpenFileLinkMenu={showFileLinkMenu}
          onOpenThreadLink={onOpenThreadLink}
        />
      );
    }
    if (item.kind === "review") {
      return (
        <ReviewRow
          key={item.id}
          item={item}
          showMessageFilePath={showMessageFilePath}
          workspacePath={workspacePath}
          onOpenFileLink={openFileLink}
          onOpenFileLinkMenu={showFileLinkMenu}
          onOpenThreadLink={onOpenThreadLink}
        />
      );
    }
    if (item.kind === "diff") {
      return <DiffRow key={item.id} item={item} />;
    }
    if (item.kind === "tool") {
      const isExpanded = expandedItems.has(item.id);
      return (
        <ToolRow
          key={item.id}
          item={item}
          isExpanded={isExpanded}
          onToggle={toggleExpanded}
          showMessageFilePath={showMessageFilePath}
          workspacePath={workspacePath}
          onOpenFileLink={openFileLink}
          onOpenFileLinkMenu={showFileLinkMenu}
          onOpenThreadLink={onOpenThreadLink}
          onRequestAutoScroll={requestAutoScroll}
        />
      );
    }
    if (item.kind === "explore") {
      return <ExploreRow key={item.id} item={item} />;
    }
    return null;
  };

  const renderGroupedEntry = (entry: MessageListEntry) => {
    if (entry.kind === "toolGroup") {
      const { group } = entry;
      const isCollapsed = collapsedToolGroups.has(group.id);
      const summaryParts = [
        formatCount(group.toolCount, "tool call", "tool calls"),
      ];
      if (group.messageCount > 0) {
        summaryParts.push(formatCount(group.messageCount, "message", "messages"));
      }
      const summaryText = summaryParts.join(", ");
      const groupBodyId = `tool-group-${group.id}`;
      const ChevronIcon = isCollapsed ? ChevronDown : ChevronUp;
      return (
        <div
          key={`tool-group-${group.id}`}
          className={`tool-group ${isCollapsed ? "tool-group-collapsed" : ""}`}
        >
          <div className="tool-group-header">
            <button
              type="button"
              className="tool-group-toggle"
              onClick={() => toggleToolGroup(group.id)}
              aria-expanded={!isCollapsed}
              aria-controls={groupBodyId}
              aria-label={isCollapsed ? "Expand tool calls" : "Collapse tool calls"}
            >
              <span className="tool-group-chevron" aria-hidden>
                <ChevronIcon size={14} />
              </span>
              <span className="tool-group-summary">{summaryText}</span>
            </button>
          </div>
          {!isCollapsed && (
            <div className="tool-group-body" id={groupBodyId}>
              {group.items.map(renderItem)}
            </div>
          )}
        </div>
      );
    }
    return renderItem(entry.item);
  };

  return (
    <div
      className="messages messages-full"
      ref={containerRef}
      onScroll={updateAutoScroll}
    >
      <VirtualizedGroupedList
        containerRef={containerRef}
        groupedItems={groupedItems}
        collapsedToolGroups={collapsedToolGroups}
        expandedItems={expandedItems}
        groupedEntryKey={groupedEntryKey}
        renderGroupedEntry={renderGroupedEntry}
        requestAutoScroll={requestAutoScroll}
      />
      {planFollowupNode}
      {userInputNode}
      <WorkingIndicator
        isThinking={isThinking}
        processingStartedAt={processingStartedAt}
        lastDurationMs={lastDurationMs}
        hasItems={items.length > 0}
        reasoningLabel={latestReasoningLabel}
        showPollingFetchStatus={showPollingFetchStatus}
        pollingIntervalMs={pollingIntervalMs}
      />
      {!items.length && !userInputNode && !isThinking && !isLoadingMessages && (
        <div className="empty messages-empty">
          {threadId ? "Send a prompt to the agent." : "Send a prompt to start a new agent."}
        </div>
      )}
      {!items.length && !userInputNode && !isThinking && isLoadingMessages && (
        <div className="empty messages-empty">
          <div className="messages-loading-indicator" role="status" aria-live="polite">
            <span className="working-spinner" aria-hidden />
            <span className="messages-loading-label">Loading…</span>
          </div>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
});
