import { useCallback, useEffect, useRef, useState } from "react";
import { useDictation } from "../../dictation/hooks/useDictation";
import { useDictationModel } from "../../dictation/hooks/useDictationModel";
import { useHoldToDictate } from "../../dictation/hooks/useHoldToDictate";
import type { AppSettings } from "../../../types";
import { requestDictationPermission } from "../../../services/tauri";
import { isMobilePlatform } from "../../../utils/platformPaths";

type DictationController = {
  dictationModel: ReturnType<typeof useDictationModel>;
  dictationState: ReturnType<typeof useDictation>["state"];
  dictationLevel: ReturnType<typeof useDictation>["level"];
  dictationTranscript: ReturnType<typeof useDictation>["transcript"];
  dictationError: ReturnType<typeof useDictation>["error"];
  dictationHint: ReturnType<typeof useDictation>["hint"];
  dictationReady: boolean;
  setDictationWorkspaceId: (workspaceId: string | null) => void;
  handleToggleDictation: () => Promise<void>;
  clearDictationTranscript: ReturnType<typeof useDictation>["clearTranscript"];
  clearDictationError: ReturnType<typeof useDictation>["clearError"];
  clearDictationHint: ReturnType<typeof useDictation>["clearHint"];
  startDictation: (preferredLanguage: string | null) => Promise<void>;
  stopDictation: ReturnType<typeof useDictation>["stop"];
  cancelDictation: ReturnType<typeof useDictation>["cancel"];
};

export function useDictationController(appSettings: AppSettings): DictationController {
  const [dictationWorkspaceId, setDictationWorkspaceIdState] = useState<string | null>(null);
  const dictationModel = useDictationModel(
    appSettings.dictationProvider,
    appSettings.dictationModelId,
    dictationWorkspaceId,
  );
  const {
    state: dictationState,
    level: dictationLevel,
    transcript: dictationTranscript,
    error: dictationError,
    hint: dictationHint,
    start: startDictationRaw,
    stop: stopDictation,
    cancel: cancelDictation,
    clearTranscript: clearDictationTranscript,
    clearError: clearDictationError,
    clearHint: clearDictationHint,
  } = useDictation(appSettings.dictationProvider);
  const mobileChatgpt = isMobilePlatform() && appSettings.dictationProvider === "chatgpt";
  const dictationReady =
    appSettings.dictationProvider === "chatgpt"
      ? Boolean(dictationWorkspaceId) && Boolean(dictationModel.authStatus?.authenticated)
      : dictationModel.status?.state === "ready";
  const holdDictationKey = (appSettings.dictationHoldKey ?? "").toLowerCase();
  const permissionRequestPendingRef = useRef(false);
  const permissionRequestedRef = useRef(false);

  const setDictationWorkspaceId = useCallback((workspaceId: string | null) => {
    setDictationWorkspaceIdState((current) => (current === workspaceId ? current : workspaceId));
  }, []);

  const startDictation = useCallback(
    async (preferredLanguage: string | null) => {
      await startDictationRaw(preferredLanguage, dictationWorkspaceId);
    },
    [dictationWorkspaceId, startDictationRaw],
  );

  const handleToggleDictation = useCallback(async () => {
    if (!appSettings.dictationEnabled || !dictationReady) {
      if (appSettings.dictationEnabled && appSettings.dictationProvider === "chatgpt") {
        void dictationModel.refresh().catch(() => {
          // Errors are surfaced through dictation events/status.
        });
      }
      return;
    }
    try {
      if (dictationState === "listening") {
        await stopDictation();
        return;
      }
      if (dictationState === "idle") {
        await startDictation(appSettings.dictationPreferredLanguage);
      }
    } catch {
      // Errors are surfaced through dictation events.
    }
  }, [
    appSettings.dictationEnabled,
    appSettings.dictationProvider,
    appSettings.dictationPreferredLanguage,
    dictationModel,
    dictationReady,
    dictationState,
    startDictation,
    stopDictation,
  ]);

  const escapeHandlerRef = useRef<(event: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    escapeHandlerRef.current = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      if (dictationState !== "listening" && dictationState !== "processing") {
        return;
      }
      event.preventDefault();
      void cancelDictation();
    };
  }, [cancelDictation, dictationState]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      escapeHandlerRef.current(event);
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, []);

  useHoldToDictate({
    enabled: appSettings.dictationEnabled,
    ready: dictationReady,
    state: dictationState,
    preferredLanguage: appSettings.dictationPreferredLanguage,
    holdKey: holdDictationKey,
    startDictation,
    stopDictation,
    cancelDictation,
  });

  useEffect(() => {
    if (mobileChatgpt) {
      permissionRequestedRef.current = true;
      return;
    }
    if (!appSettings.dictationEnabled) {
      permissionRequestedRef.current = false;
      return;
    }
    if (permissionRequestPendingRef.current) {
      return;
    }
    if (!dictationReady) {
      permissionRequestedRef.current = false;
      return;
    }
    if (permissionRequestedRef.current) {
      return;
    }
    permissionRequestedRef.current = true;
    permissionRequestPendingRef.current = true;
    void requestDictationPermission()
      .catch(() => {
        // Errors are surfaced during dictation start.
      })
      .finally(() => {
        permissionRequestPendingRef.current = false;
      });
  }, [appSettings.dictationEnabled, dictationReady, mobileChatgpt]);

  return {
    dictationModel,
    dictationState,
    dictationLevel,
    dictationTranscript,
    dictationError,
    dictationHint,
    dictationReady,
    setDictationWorkspaceId,
    handleToggleDictation,
    clearDictationTranscript,
    clearDictationError,
    clearDictationHint,
    startDictation,
    stopDictation,
    cancelDictation,
  };
}
