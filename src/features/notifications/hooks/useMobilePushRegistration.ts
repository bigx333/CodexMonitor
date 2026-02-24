import { useCallback, useEffect, useRef } from "react";
import {
  getMobilePushRegistrationInfo,
  registerPushDevice,
  requestNotificationPermissionOnStart,
} from "@/services/tauri";
import { isMobilePlatform } from "@/utils/platformPaths";

type Params = {
  backendMode: "local" | "remote";
  remoteBackendHost: string;
  remoteBackendToken: string | null;
};

export function useMobilePushRegistration({
  backendMode,
  remoteBackendHost,
  remoteBackendToken,
}: Params) {
  const mobile = isMobilePlatform();
  const permissionResolvedRef = useRef(false);
  const permissionGrantedRef = useRef(false);
  const lastRegisteredTokenRef = useRef<string | null>(null);

  const ensurePermission = useCallback(async () => {
    if (permissionResolvedRef.current) {
      return permissionGrantedRef.current;
    }
    const granted = await requestNotificationPermissionOnStart();
    permissionResolvedRef.current = true;
    permissionGrantedRef.current = granted;
    return granted;
  }, []);

  const refreshRegistration = useCallback(async () => {
    if (!mobile) {
      return;
    }

    const permissionGranted = await ensurePermission();
    if (!permissionGranted) {
      return;
    }

    if (
      backendMode !== "remote" ||
      !remoteBackendHost.trim() ||
      !(remoteBackendToken ?? "").trim()
    ) {
      return;
    }

    let registration: Awaited<ReturnType<typeof getMobilePushRegistrationInfo>> = null;
    try {
      registration = await getMobilePushRegistrationInfo();
    } catch {
      return;
    }
    if (!registration || registration.platform !== "android") {
      return;
    }

    const token = registration.token.trim();
    if (!token || lastRegisteredTokenRef.current === token) {
      return;
    }

    try {
      await registerPushDevice(
        registration.deviceId,
        "android",
        token,
        registration.label ?? null,
      );
      lastRegisteredTokenRef.current = token;
    } catch {
      // Best-effort registration; retry on next visibility/boot cycle.
    }
  }, [
    backendMode,
    ensurePermission,
    mobile,
    remoteBackendHost,
    remoteBackendToken,
  ]);

  useEffect(() => {
    if (!mobile) {
      return;
    }
    void refreshRegistration();
  }, [mobile, refreshRegistration]);

  useEffect(() => {
    if (!mobile || typeof document === "undefined") {
      return;
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refreshRegistration();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [mobile, refreshRegistration]);
}
