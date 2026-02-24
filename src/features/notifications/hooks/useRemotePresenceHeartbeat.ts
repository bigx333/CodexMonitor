import { useCallback, useEffect, useMemo, useRef } from "react";
import type { WorkspaceInfo } from "@/types";
import { getSystemIdleSeconds, sendPresenceHeartbeat } from "@/services/tauri";
import { useWindowFocusState } from "@/features/layout/hooks/useWindowFocusState";
import { isMobilePlatform } from "@/utils/platformPaths";

const HEARTBEAT_INTERVAL_MS = 15_000;
const AFK_TIMEOUT_SECONDS = 600;

type Params = {
  backendMode: "local" | "remote";
  workspaces: WorkspaceInfo[];
};

function makeClientId() {
  const random = Math.random().toString(36).slice(2, 10);
  return `desktop-${Date.now().toString(36)}-${random}`;
}

function isDocumentVisible() {
  if (typeof document === "undefined") {
    return true;
  }
  return document.visibilityState === "visible";
}

export function useRemotePresenceHeartbeat({ backendMode, workspaces }: Params) {
  const isWindowFocused = useWindowFocusState();
  const mobile = isMobilePlatform();
  const clientIdRef = useRef<string>(makeClientId());
  const lastActivityAtRef = useRef<number>(Date.now());
  const nativeIdleSecondsRef = useRef<number | null>(null);
  const nativeIdleSupportedRef = useRef<boolean>(true);

  const activeWorkspaceIds = useMemo(
    () =>
      workspaces
        .filter((workspace) => workspace.connected)
        .map((workspace) => workspace.id),
    [workspaces],
  );

  useEffect(() => {
    if (mobile) {
      return;
    }
    const markActivity = () => {
      lastActivityAtRef.current = Date.now();
    };
    window.addEventListener("mousemove", markActivity, { passive: true });
    window.addEventListener("mousedown", markActivity, { passive: true });
    window.addEventListener("keydown", markActivity, { passive: true });
    window.addEventListener("touchstart", markActivity, { passive: true });
    return () => {
      window.removeEventListener("mousemove", markActivity);
      window.removeEventListener("mousedown", markActivity);
      window.removeEventListener("keydown", markActivity);
      window.removeEventListener("touchstart", markActivity);
    };
  }, [mobile]);

  const sendHeartbeat = useCallback(async () => {
    if (backendMode !== "remote" || mobile) {
      return;
    }
    if (nativeIdleSupportedRef.current) {
      try {
        const idleSeconds = await getSystemIdleSeconds();
        if (typeof idleSeconds === "number" && Number.isFinite(idleSeconds)) {
          nativeIdleSecondsRef.current = Math.max(0, idleSeconds);
        } else {
          nativeIdleSupportedRef.current = false;
          nativeIdleSecondsRef.current = null;
        }
      } catch {
        nativeIdleSupportedRef.current = false;
        nativeIdleSecondsRef.current = null;
      }
    }

    const now = Date.now();
    const isVisible = isDocumentVisible();
    const fallbackIdleSeconds = (now - lastActivityAtRef.current) / 1_000;
    const effectiveIdleSeconds =
      nativeIdleSecondsRef.current ?? fallbackIdleSeconds;
    const isAfk =
      !isVisible || !isWindowFocused || effectiveIdleSeconds >= AFK_TIMEOUT_SECONDS;

    try {
      await sendPresenceHeartbeat({
        clientId: clientIdRef.current,
        clientKind: "desktop",
        platform: null,
        isSupported: true,
        isFocused: isWindowFocused && isVisible,
        isAfk,
        activeWorkspaceIds,
      });
    } catch {
      // Presence heartbeats are best-effort.
    }
  }, [activeWorkspaceIds, backendMode, isWindowFocused, mobile]);

  useEffect(() => {
    if (backendMode !== "remote" || mobile) {
      return;
    }
    void sendHeartbeat();
    const timer = window.setInterval(() => {
      void sendHeartbeat();
    }, HEARTBEAT_INTERVAL_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [backendMode, mobile, sendHeartbeat]);

  useEffect(() => {
    if (backendMode !== "remote" || mobile) {
      return;
    }
    void sendHeartbeat();
  }, [activeWorkspaceIds, backendMode, isWindowFocused, mobile, sendHeartbeat]);
}
