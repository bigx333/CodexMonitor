import { useCallback, useEffect, useState } from "react";
import type {
  DictationAuthStatus,
  DictationModelStatus,
  DictationProvider,
} from "@/types";
import {
  cancelDictationDownload,
  downloadDictationModel,
  getDictationAuthStatus,
  getDictationModelStatus,
  removeDictationModel,
} from "@/services/tauri";
import { subscribeDictationDownload } from "@/services/events";

type UseDictationModelResult = {
  status: DictationModelStatus | null;
  authStatus: DictationAuthStatus | null;
  refresh: () => Promise<void>;
  download: () => Promise<void>;
  cancel: () => Promise<void>;
  remove: () => Promise<void>;
};

export function useDictationModel(
  provider: DictationProvider,
  modelId: string | null,
  workspaceId: string | null,
): UseDictationModelResult {
  const [status, setStatus] = useState<DictationModelStatus | null>(null);
  const [authStatus, setAuthStatus] = useState<DictationAuthStatus | null>(null);

  const refresh = useCallback(async () => {
    if (provider === "chatgpt") {
      const next = await getDictationAuthStatus(workspaceId);
      setAuthStatus(next);
      return;
    }
    const next = await getDictationModelStatus(modelId);
    setStatus(next);
  }, [modelId, provider, workspaceId]);

  useEffect(() => {
    let active = true;

    if (provider === "chatgpt") {
      setStatus(null);
      void (async () => {
        try {
          const next = await getDictationAuthStatus(workspaceId);
          if (active) {
            setAuthStatus(next);
          }
        } catch {
          // Ignore dictation auth errors during startup.
        }
      })();

      return () => {
        active = false;
      };
    }

    setAuthStatus(null);
    void (async () => {
      try {
        const next = await getDictationModelStatus(modelId);
        if (active) {
          setStatus(next);
        }
      } catch {
        // Ignore dictation status errors during startup.
      }
    })();

    const unlisten = subscribeDictationDownload((event) => {
      if (!active) {
        return;
      }
      if (!modelId || event.modelId === modelId) {
        setStatus(event);
      }
    });

    return () => {
      active = false;
      unlisten();
    };
  }, [modelId, provider, workspaceId]);

  const download = useCallback(async () => {
    if (provider === "chatgpt") {
      return;
    }
    const next = await downloadDictationModel(modelId);
    setStatus(next);
  }, [modelId, provider]);

  const cancel = useCallback(async () => {
    if (provider === "chatgpt") {
      return;
    }
    const next = await cancelDictationDownload(modelId);
    setStatus(next);
  }, [modelId, provider]);

  const remove = useCallback(async () => {
    if (provider === "chatgpt") {
      return;
    }
    const next = await removeDictationModel(modelId);
    setStatus(next);
  }, [modelId, provider]);

  return {
    status,
    authStatus,
    refresh,
    download,
    cancel,
    remove,
  };
}
