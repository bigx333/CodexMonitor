import type { AppServerEvent } from "../types";

export const SUPPORTED_APP_SERVER_METHODS = [
  "app/list/updated",
  "account/login/completed",
  "account/rateLimits/updated",
  "account/updated",
  "codex/backgroundThread",
  "codex/connected",
  "codex/event/skills_update_available",
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
] as const;

export type SupportedAppServerMethod = (typeof SUPPORTED_APP_SERVER_METHODS)[number];

export const METHODS_HANDLED_OUTSIDE_USE_APP_SERVER_EVENTS = [
  "app/list/updated",
  "codex/event/skills_update_available",
] as const satisfies readonly SupportedAppServerMethod[];

const SUPPORTED_METHOD_SET = new Set<string>(SUPPORTED_APP_SERVER_METHODS);

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toSnakeCaseKey(key: string): string {
  return key.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);
}

function getAppServerMessageObject(
  event: AppServerEvent,
): Record<string, unknown> | null {
  if (!event || typeof event !== "object") {
    return null;
  }
  const message = (event as { message?: unknown }).message;
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return null;
  }
  return message as Record<string, unknown>;
}

export function getAppServerRawMethod(event: AppServerEvent): string | null {
  const message = getAppServerMessageObject(event);
  if (!message) {
    return null;
  }
  const method = message.method;
  if (typeof method !== "string") {
    return null;
  }
  const trimmed = method.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function isSupportedAppServerMethod(
  method: string,
): method is SupportedAppServerMethod {
  return SUPPORTED_METHOD_SET.has(method);
}

export function getAppServerParams(event: AppServerEvent): Record<string, unknown> {
  const message = getAppServerMessageObject(event);
  if (!message) {
    return {};
  }
  const params = message.params;
  if (!isObjectRecord(params)) {
    return {};
  }
  return params;
}

export function getAppServerRequestId(event: AppServerEvent): string | number | null {
  const message = getAppServerMessageObject(event);
  if (!message) {
    return null;
  }
  const requestId = message.id;
  if (typeof requestId === "number" || typeof requestId === "string") {
    return requestId;
  }
  return null;
}

export function getAppServerParamValue(
  params: Record<string, unknown>,
  key: string,
): unknown {
  if (Object.prototype.hasOwnProperty.call(params, key)) {
    return params[key];
  }
  const snakeCaseKey = toSnakeCaseKey(key);
  if (
    snakeCaseKey !== key &&
    Object.prototype.hasOwnProperty.call(params, snakeCaseKey)
  ) {
    return params[snakeCaseKey];
  }
  return undefined;
}

export function getAppServerStringParam(
  params: Record<string, unknown>,
  key: string,
): string {
  const value = getAppServerParamValue(params, key);
  if (typeof value === "string") {
    return value;
  }
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
}

export function getAppServerTrimmedStringParam(
  params: Record<string, unknown>,
  key: string,
): string {
  return getAppServerStringParam(params, key).trim();
}

export function getAppServerNullableStringParam(
  params: Record<string, unknown>,
  key: string,
): string | null {
  const value = getAppServerTrimmedStringParam(params, key);
  return value.length > 0 ? value : null;
}

export function getAppServerRecordParam(
  params: Record<string, unknown>,
  key: string,
): Record<string, unknown> | null {
  const value = getAppServerParamValue(params, key);
  return isObjectRecord(value) ? value : null;
}

export function isApprovalRequestMethod(method: string): boolean {
  return method.endsWith("requestApproval");
}

export function isSkillsUpdateAvailableEvent(event: AppServerEvent): boolean {
  return getAppServerRawMethod(event) === "codex/event/skills_update_available";
}

export function isAppListUpdatedEvent(event: AppServerEvent): boolean {
  return getAppServerRawMethod(event) === "app/list/updated";
}
