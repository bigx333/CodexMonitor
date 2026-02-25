// @vitest-environment jsdom
import { afterEach, beforeEach, vi } from "vitest";
import type { WorkspaceInfo } from "@/types";
import type { useAppServerEvents } from "@app/hooks/useAppServerEvents";
import { useThreadRows as useThreadRowsHook } from "@app/hooks/useThreadRows";
import {
  archiveThread as archiveThreadFn,
  interruptTurn as interruptTurnFn,
  listThreads as listThreadsFn,
  resumeThread as resumeThreadFn,
  sendUserMessage as sendUserMessageServiceFn,
  setThreadName as setThreadNameFn,
  startThread as startThreadFn,
  startReview as startReviewFn,
  steerTurn as steerTurnFn,
} from "@services/tauri";
import { STORAGE_KEY_DETACHED_REVIEW_LINKS } from "@threads/utils/threadStorage";
import { useQueuedSend as useQueuedSendHook } from "./useQueuedSend";
import { useThreads as useThreadsHook } from "./useThreads";

type AppServerHandlers = Parameters<typeof useAppServerEvents>[0];

export let handlers: AppServerHandlers | null = null;

vi.mock("@app/hooks/useAppServerEvents", () => ({
  useAppServerEvents: (incoming: AppServerHandlers) => {
    handlers = incoming;
  },
}));

vi.mock("@services/tauri", () => ({
  respondToServerRequest: vi.fn(),
  respondToUserInputRequest: vi.fn(),
  rememberApprovalRule: vi.fn(),
  sendUserMessage: vi.fn(),
  steerTurn: vi.fn(),
  startReview: vi.fn(),
  startThread: vi.fn(),
  listThreads: vi.fn(),
  resumeThread: vi.fn(),
  archiveThread: vi.fn(),
  setThreadName: vi.fn(),
  getAccountRateLimits: vi.fn(),
  getAccountInfo: vi.fn(),
  interruptTurn: vi.fn(),
}));

export const workspace: WorkspaceInfo = {
  id: "ws-1",
  name: "CodexMonitor",
  path: "/tmp/codex",
  connected: true,
  settings: { sidebarCollapsed: false },
};

let now = 1000;
let nowSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  handlers = null;
  localStorage.clear();
  vi.clearAllMocks();
  now = 1000;
  nowSpy = vi.spyOn(Date, "now").mockImplementation(() => now++);
});

afterEach(() => {
  nowSpy.mockRestore();
});

export function setNow(value: number) {
  now = value;
}

export const archiveThread = archiveThreadFn;
export const interruptTurn = interruptTurnFn;
export const listThreads = listThreadsFn;
export const resumeThread = resumeThreadFn;
export const sendUserMessageService = sendUserMessageServiceFn;
export const setThreadName = setThreadNameFn;
export const startThread = startThreadFn;
export const startReview = startReviewFn;
export const steerTurn = steerTurnFn;

export const useThreadRows = useThreadRowsHook;
export const useQueuedSend = useQueuedSendHook;
export const useThreads = useThreadsHook;

export { STORAGE_KEY_DETACHED_REVIEW_LINKS };
