import { useCallback, useEffect, useRef } from "react";
import type { DebugEntry, RateLimitSnapshot } from "@/types";
import { getAccountRateLimits } from "@services/tauri";
import { normalizeRateLimits } from "@threads/utils/threadNormalize";
import type { ThreadAction } from "./useThreadsReducer";

type UseThreadRateLimitsOptions = {
  activeWorkspaceId: string | null;
  activeWorkspaceConnected?: boolean;
  getCurrentRateLimits?: (workspaceId: string) => RateLimitSnapshot | null;
  dispatch: React.Dispatch<ThreadAction>;
  onDebug?: (entry: DebugEntry) => void;
};

export function useThreadRateLimits({
  activeWorkspaceId,
  activeWorkspaceConnected,
  getCurrentRateLimits,
  dispatch,
  onDebug,
}: UseThreadRateLimitsOptions) {
  const getCurrentRateLimitsRef = useRef(getCurrentRateLimits);
  useEffect(() => {
    getCurrentRateLimitsRef.current = getCurrentRateLimits;
  }, [getCurrentRateLimits]);

  const refreshAccountRateLimits = useCallback(
    async (workspaceId?: string) => {
      const targetId = workspaceId ?? activeWorkspaceId;
      if (!targetId) {
        return;
      }
      onDebug?.({
        id: `${Date.now()}-client-account-rate-limits`,
        timestamp: Date.now(),
        source: "client",
        label: "account/rateLimits/read",
        payload: { workspaceId: targetId },
      });
      try {
        const response = await getAccountRateLimits(targetId);
        const responseRecord =
          response && typeof response === "object"
            ? (response as Record<string, unknown>)
            : {};
        const responseResult =
          responseRecord.result && typeof responseRecord.result === "object"
            ? (responseRecord.result as Record<string, unknown>)
            : {};
        onDebug?.({
          id: `${Date.now()}-server-account-rate-limits`,
          timestamp: Date.now(),
          source: "server",
          label: "account/rateLimits/read response",
          payload: response,
        });
        const rateLimits =
          (responseResult.rateLimits as Record<string, unknown> | undefined) ??
          (responseResult.rate_limits as Record<string, unknown> | undefined) ??
          (responseRecord.rateLimits as Record<string, unknown> | undefined) ??
          (responseRecord.rate_limits as Record<string, unknown> | undefined);
        if (rateLimits) {
          const previousRateLimits =
            getCurrentRateLimitsRef.current?.(targetId) ?? null;
          dispatch({
            type: "setRateLimits",
            workspaceId: targetId,
            rateLimits: normalizeRateLimits(rateLimits, previousRateLimits),
          });
        }
      } catch (error) {
        onDebug?.({
          id: `${Date.now()}-client-account-rate-limits-error`,
          timestamp: Date.now(),
          source: "error",
          label: "account/rateLimits/read error",
          payload: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [activeWorkspaceId, dispatch, onDebug],
  );

  useEffect(() => {
    if (activeWorkspaceConnected && activeWorkspaceId) {
      void refreshAccountRateLimits(activeWorkspaceId);
    }
  }, [activeWorkspaceConnected, activeWorkspaceId, refreshAccountRateLimits]);

  return { refreshAccountRateLimits };
}
