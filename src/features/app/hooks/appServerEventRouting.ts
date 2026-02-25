import type {
  ApprovalRequest,
  RequestUserInputQuestion,
  RequestUserInputRequest,
} from "../../../types";
import type { SupportedAppServerMethod } from "../../../utils/appServerEvents";
import {
  getAppServerNullableStringParam,
  getAppServerParamValue,
  getAppServerRecordParam,
  getAppServerStringParam,
  getAppServerTrimmedStringParam,
} from "../../../utils/appServerEvents";

export type AgentDelta = {
  workspaceId: string;
  threadId: string;
  itemId: string;
  delta: string;
};

export type AgentCompleted = {
  workspaceId: string;
  threadId: string;
  itemId: string;
  text: string;
};

export type AppServerEventHandlers = {
  onWorkspaceConnected?: (workspaceId: string) => void;
  onThreadStarted?: (workspaceId: string, thread: Record<string, unknown>) => void;
  onThreadNameUpdated?: (
    workspaceId: string,
    payload: { threadId: string; threadName: string | null },
  ) => void;
  onThreadStatusChanged?: (
    workspaceId: string,
    threadId: string,
    status: Record<string, unknown>,
  ) => void;
  onThreadArchived?: (workspaceId: string, threadId: string) => void;
  onThreadUnarchived?: (workspaceId: string, threadId: string) => void;
  onBackgroundThreadAction?: (
    workspaceId: string,
    threadId: string,
    action: string,
  ) => void;
  onApprovalRequest?: (request: ApprovalRequest) => void;
  onRequestUserInput?: (request: RequestUserInputRequest) => void;
  onAgentMessageDelta?: (event: AgentDelta) => void;
  onAgentMessageCompleted?: (event: AgentCompleted) => void;
  onTurnStarted?: (workspaceId: string, threadId: string, turnId: string) => void;
  onTurnCompleted?: (workspaceId: string, threadId: string, turnId: string) => void;
  onTurnError?: (
    workspaceId: string,
    threadId: string,
    turnId: string,
    payload: { message: string; willRetry: boolean },
  ) => void;
  onTurnPlanUpdated?: (
    workspaceId: string,
    threadId: string,
    turnId: string,
    payload: { explanation: unknown; plan: unknown },
  ) => void;
  onItemStarted?: (workspaceId: string, threadId: string, item: Record<string, unknown>) => void;
  onItemCompleted?: (workspaceId: string, threadId: string, item: Record<string, unknown>) => void;
  onReasoningSummaryDelta?: (workspaceId: string, threadId: string, itemId: string, delta: string) => void;
  onReasoningSummaryBoundary?: (workspaceId: string, threadId: string, itemId: string) => void;
  onReasoningTextDelta?: (workspaceId: string, threadId: string, itemId: string, delta: string) => void;
  onPlanDelta?: (workspaceId: string, threadId: string, itemId: string, delta: string) => void;
  onCommandOutputDelta?: (workspaceId: string, threadId: string, itemId: string, delta: string) => void;
  onTerminalInteraction?: (
    workspaceId: string,
    threadId: string,
    itemId: string,
    stdin: string,
  ) => void;
  onFileChangeOutputDelta?: (workspaceId: string, threadId: string, itemId: string, delta: string) => void;
  onTurnDiffUpdated?: (workspaceId: string, threadId: string, diff: string) => void;
  onThreadTokenUsageUpdated?: (
    workspaceId: string,
    threadId: string,
    tokenUsage: Record<string, unknown> | null,
  ) => void;
  onAccountRateLimitsUpdated?: (
    workspaceId: string,
    rateLimits: Record<string, unknown>,
  ) => void;
  onAccountUpdated?: (workspaceId: string, authMode: string | null) => void;
  onAccountLoginCompleted?: (
    workspaceId: string,
    payload: { loginId: string | null; success: boolean; error: string | null },
  ) => void;
};

export const METHODS_ROUTED_IN_USE_APP_SERVER_EVENTS = [
  "account/login/completed",
  "account/rateLimits/updated",
  "account/updated",
  "codex/backgroundThread",
  "codex/connected",
  "error",
  "item/agentMessage/delta",
  "item/commandExecution/outputDelta",
  "item/commandExecution/terminalInteraction",
  "item/completed",
  "item/fileChange/outputDelta",
  "item/plan/delta",
  "item/reasoning/summaryPartAdded",
  "item/reasoning/summaryTextDelta",
  "item/reasoning/textDelta",
  "item/started",
  "item/tool/requestUserInput",
  "thread/archived",
  "thread/name/updated",
  "thread/status/changed",
  "thread/started",
  "thread/tokenUsage/updated",
  "thread/unarchived",
  "turn/completed",
  "turn/diff/updated",
  "turn/plan/updated",
  "turn/started",
] as const satisfies readonly SupportedAppServerMethod[];

type RoutedMethod = (typeof METHODS_ROUTED_IN_USE_APP_SERVER_EVENTS)[number];

type DispatchContext = {
  workspaceId: string;
  params: Record<string, unknown>;
  requestId: string | number | null;
  handlers: AppServerEventHandlers;
};

type RouteHandler = (context: DispatchContext) => void;

function readThreadId(
  params: Record<string, unknown>,
  nested?: Record<string, unknown> | null,
): string {
  const direct = getAppServerStringParam(params, "threadId");
  if (direct) {
    return direct;
  }
  if (!nested) {
    return "";
  }
  return getAppServerStringParam(nested, "threadId");
}

function readTurnId(
  params: Record<string, unknown>,
  nested?: Record<string, unknown> | null,
): string {
  const direct = getAppServerStringParam(params, "turnId");
  if (direct) {
    return direct;
  }
  if (!nested) {
    return "";
  }
  return getAppServerStringParam(nested, "id");
}

function parseRequestUserInputQuestions(
  params: Record<string, unknown>,
): RequestUserInputQuestion[] {
  const questionsRaw = getAppServerParamValue(params, "questions");
  if (!Array.isArray(questionsRaw)) {
    return [];
  }

  const normalized: RequestUserInputQuestion[] = [];
  for (const entry of questionsRaw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }
    const question = entry as Record<string, unknown>;
    const id = getAppServerTrimmedStringParam(question, "id");
    if (!id) {
      continue;
    }

    const optionsRaw = getAppServerParamValue(question, "options");
    const options =
      Array.isArray(optionsRaw)
        ? optionsRaw.flatMap((option) => {
            if (!option || typeof option !== "object" || Array.isArray(option)) {
              return [];
            }
            const record = option as Record<string, unknown>;
            const label = getAppServerTrimmedStringParam(record, "label");
            const description = getAppServerTrimmedStringParam(record, "description");
            if (!label && !description) {
              return [];
            }
            return [{ label, description }];
          })
        : [];

    normalized.push({
      id,
      header: getAppServerStringParam(question, "header"),
      question: getAppServerStringParam(question, "question"),
      isOther: Boolean(
        getAppServerParamValue(question, "isOther") ??
          getAppServerParamValue(question, "is_other"),
      ),
      options: options.length ? options : undefined,
    });
  }

  return normalized;
}

const ROUTED_METHOD_HANDLERS = {
  "codex/connected": ({ workspaceId, handlers }) => {
    handlers.onWorkspaceConnected?.(workspaceId);
  },
  "item/tool/requestUserInput": ({ workspaceId, requestId, params, handlers }) => {
    if (requestId === null) {
      return;
    }
    handlers.onRequestUserInput?.({
      workspace_id: workspaceId,
      request_id: requestId,
      params: {
        thread_id: getAppServerStringParam(params, "threadId"),
        turn_id: getAppServerStringParam(params, "turnId"),
        item_id: getAppServerStringParam(params, "itemId"),
        questions: parseRequestUserInputQuestions(params),
      },
    });
  },
  "item/agentMessage/delta": ({ workspaceId, params, handlers }) => {
    const threadId = getAppServerStringParam(params, "threadId");
    const itemId = getAppServerStringParam(params, "itemId");
    const delta = getAppServerStringParam(params, "delta");
    if (threadId && itemId && delta) {
      handlers.onAgentMessageDelta?.({ workspaceId, threadId, itemId, delta });
    }
  },
  "turn/started": ({ workspaceId, params, handlers }) => {
    const turn = getAppServerRecordParam(params, "turn");
    const threadId = readThreadId(params, turn);
    const turnId = readTurnId(params, turn);
    if (threadId) {
      handlers.onTurnStarted?.(workspaceId, threadId, turnId);
    }
  },
  "thread/started": ({ workspaceId, params, handlers }) => {
    const thread = getAppServerRecordParam(params, "thread");
    const threadId = thread ? getAppServerStringParam(thread, "id") : "";
    if (thread && threadId) {
      handlers.onThreadStarted?.(workspaceId, thread);
    }
  },
  "thread/name/updated": ({ workspaceId, params, handlers }) => {
    const threadId = getAppServerTrimmedStringParam(params, "threadId");
    if (!threadId) {
      return;
    }
    handlers.onThreadNameUpdated?.(workspaceId, {
      threadId,
      threadName: getAppServerNullableStringParam(params, "threadName"),
    });
  },
  "thread/status/changed": ({ workspaceId, params, handlers }) => {
    const threadId = getAppServerTrimmedStringParam(params, "threadId");
    if (!threadId) {
      return;
    }
    const status = getAppServerRecordParam(params, "status");
    if (status) {
      handlers.onThreadStatusChanged?.(workspaceId, threadId, status);
      return;
    }
    const statusText = getAppServerTrimmedStringParam(params, "status");
    if (statusText) {
      handlers.onThreadStatusChanged?.(workspaceId, threadId, { type: statusText });
    }
  },
  "thread/archived": ({ workspaceId, params, handlers }) => {
    const threadId = getAppServerTrimmedStringParam(params, "threadId");
    if (threadId) {
      handlers.onThreadArchived?.(workspaceId, threadId);
    }
  },
  "thread/unarchived": ({ workspaceId, params, handlers }) => {
    const threadId = getAppServerTrimmedStringParam(params, "threadId");
    if (threadId) {
      handlers.onThreadUnarchived?.(workspaceId, threadId);
    }
  },
  "codex/backgroundThread": ({ workspaceId, params, handlers }) => {
    const threadId = getAppServerStringParam(params, "threadId");
    if (!threadId) {
      return;
    }
    handlers.onBackgroundThreadAction?.(
      workspaceId,
      threadId,
      getAppServerStringParam(params, "action") || "hide",
    );
  },
  error: ({ workspaceId, params, handlers }) => {
    const threadId = getAppServerStringParam(params, "threadId");
    if (!threadId) {
      return;
    }
    const turnId = getAppServerStringParam(params, "turnId");
    const errorRecord = getAppServerRecordParam(params, "error");
    const message = errorRecord ? getAppServerStringParam(errorRecord, "message") : "";
    const willRetry = Boolean(getAppServerParamValue(params, "willRetry"));
    handlers.onTurnError?.(workspaceId, threadId, turnId, { message, willRetry });
  },
  "turn/completed": ({ workspaceId, params, handlers }) => {
    const turn = getAppServerRecordParam(params, "turn");
    const threadId = readThreadId(params, turn);
    const turnId = readTurnId(params, turn);
    if (threadId) {
      handlers.onTurnCompleted?.(workspaceId, threadId, turnId);
    }
  },
  "turn/plan/updated": ({ workspaceId, params, handlers }) => {
    const threadId = getAppServerStringParam(params, "threadId");
    if (!threadId) {
      return;
    }
    handlers.onTurnPlanUpdated?.(
      workspaceId,
      threadId,
      getAppServerStringParam(params, "turnId"),
      {
        explanation: getAppServerParamValue(params, "explanation"),
        plan: getAppServerParamValue(params, "plan"),
      },
    );
  },
  "turn/diff/updated": ({ workspaceId, params, handlers }) => {
    const threadId = getAppServerStringParam(params, "threadId");
    const diff = getAppServerStringParam(params, "diff");
    if (threadId && diff) {
      handlers.onTurnDiffUpdated?.(workspaceId, threadId, diff);
    }
  },
  "thread/tokenUsage/updated": ({ workspaceId, params, handlers }) => {
    const threadId = getAppServerStringParam(params, "threadId");
    if (!threadId) {
      return;
    }
    const tokenUsage = getAppServerParamValue(params, "tokenUsage");
    if (tokenUsage !== undefined) {
      handlers.onThreadTokenUsageUpdated?.(
        workspaceId,
        threadId,
        tokenUsage as Record<string, unknown> | null,
      );
    }
  },
  "account/rateLimits/updated": ({ workspaceId, params, handlers }) => {
    const rateLimits = getAppServerRecordParam(params, "rateLimits");
    if (rateLimits) {
      handlers.onAccountRateLimitsUpdated?.(workspaceId, rateLimits);
    }
  },
  "account/updated": ({ workspaceId, params, handlers }) => {
    handlers.onAccountUpdated?.(workspaceId, getAppServerNullableStringParam(params, "authMode"));
  },
  "account/login/completed": ({ workspaceId, params, handlers }) => {
    handlers.onAccountLoginCompleted?.(workspaceId, {
      loginId: getAppServerNullableStringParam(params, "loginId"),
      success: Boolean(getAppServerParamValue(params, "success")),
      error: getAppServerNullableStringParam(params, "error"),
    });
  },
  "item/completed": ({ workspaceId, params, handlers }) => {
    const threadId = getAppServerStringParam(params, "threadId");
    const item = getAppServerRecordParam(params, "item");
    if (threadId && item) {
      handlers.onItemCompleted?.(workspaceId, threadId, item);
    }
    if (threadId && item?.type === "agentMessage") {
      const itemId = getAppServerStringParam(item, "id");
      if (itemId) {
        handlers.onAgentMessageCompleted?.({
          workspaceId,
          threadId,
          itemId,
          text: getAppServerStringParam(item, "text"),
        });
      }
    }
  },
  "item/started": ({ workspaceId, params, handlers }) => {
    const threadId = getAppServerStringParam(params, "threadId");
    const item = getAppServerRecordParam(params, "item");
    if (threadId && item) {
      handlers.onItemStarted?.(workspaceId, threadId, item);
    }
  },
  "item/reasoning/summaryTextDelta": ({ workspaceId, params, handlers }) => {
    const threadId = getAppServerStringParam(params, "threadId");
    const itemId = getAppServerStringParam(params, "itemId");
    const delta = getAppServerStringParam(params, "delta");
    if (threadId && itemId && delta) {
      handlers.onReasoningSummaryDelta?.(workspaceId, threadId, itemId, delta);
    }
  },
  "item/reasoning/summaryPartAdded": ({ workspaceId, params, handlers }) => {
    const threadId = getAppServerStringParam(params, "threadId");
    const itemId = getAppServerStringParam(params, "itemId");
    if (threadId && itemId) {
      handlers.onReasoningSummaryBoundary?.(workspaceId, threadId, itemId);
    }
  },
  "item/reasoning/textDelta": ({ workspaceId, params, handlers }) => {
    const threadId = getAppServerStringParam(params, "threadId");
    const itemId = getAppServerStringParam(params, "itemId");
    const delta = getAppServerStringParam(params, "delta");
    if (threadId && itemId && delta) {
      handlers.onReasoningTextDelta?.(workspaceId, threadId, itemId, delta);
    }
  },
  "item/plan/delta": ({ workspaceId, params, handlers }) => {
    const threadId = getAppServerStringParam(params, "threadId");
    const itemId = getAppServerStringParam(params, "itemId");
    const delta = getAppServerStringParam(params, "delta");
    if (threadId && itemId && delta) {
      handlers.onPlanDelta?.(workspaceId, threadId, itemId, delta);
    }
  },
  "item/commandExecution/outputDelta": ({ workspaceId, params, handlers }) => {
    const threadId = getAppServerStringParam(params, "threadId");
    const itemId = getAppServerStringParam(params, "itemId");
    const delta = getAppServerStringParam(params, "delta");
    if (threadId && itemId && delta) {
      handlers.onCommandOutputDelta?.(workspaceId, threadId, itemId, delta);
    }
  },
  "item/commandExecution/terminalInteraction": ({ workspaceId, params, handlers }) => {
    const threadId = getAppServerStringParam(params, "threadId");
    const itemId = getAppServerStringParam(params, "itemId");
    if (threadId && itemId) {
      handlers.onTerminalInteraction?.(
        workspaceId,
        threadId,
        itemId,
        getAppServerStringParam(params, "stdin"),
      );
    }
  },
  "item/fileChange/outputDelta": ({ workspaceId, params, handlers }) => {
    const threadId = getAppServerStringParam(params, "threadId");
    const itemId = getAppServerStringParam(params, "itemId");
    const delta = getAppServerStringParam(params, "delta");
    if (threadId && itemId && delta) {
      handlers.onFileChangeOutputDelta?.(workspaceId, threadId, itemId, delta);
    }
  },
} satisfies Record<RoutedMethod, RouteHandler>;

export function dispatchSupportedAppServerEvent(args: {
  method: SupportedAppServerMethod;
  workspaceId: string;
  params: Record<string, unknown>;
  requestId: string | number | null;
  handlers: AppServerEventHandlers;
}): void {
  const handler = ROUTED_METHOD_HANDLERS[args.method as RoutedMethod];
  if (!handler) {
    return;
  }
  handler({
    workspaceId: args.workspaceId,
    params: args.params,
    requestId: args.requestId,
    handlers: args.handlers,
  });
}
