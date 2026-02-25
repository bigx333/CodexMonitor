import { useCallback, useEffect, useRef, useState } from "react";
import type {
  DictationEvent,
  DictationProvider,
  DictationSessionState,
  DictationTranscript,
} from "../../../types";
import {
  cancelDictation,
  startDictation,
  stopDictation,
  transcribeDictationAudio,
} from "../../../services/tauri";
import { subscribeDictationEvents } from "../../../services/events";
import { isMobilePlatform } from "../../../utils/platformPaths";

type UseDictationResult = {
  state: DictationSessionState;
  level: number;
  transcript: DictationTranscript | null;
  error: string | null;
  hint: string | null;
  start: (preferredLanguage: string | null, workspaceId?: string | null) => Promise<void>;
  stop: () => Promise<void>;
  cancel: () => Promise<void>;
  clearTranscript: (id: string) => void;
  clearError: () => void;
  clearHint: () => void;
};

const DICTATION_CANCEL_HINT = "Dictation canceled.";

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return window.btoa(binary);
}

export function useDictation(provider: DictationProvider): UseDictationResult {
  const [state, setState] = useState<DictationSessionState>("idle");
  const [level, setLevel] = useState(0);
  const [transcript, setTranscript] = useState<DictationTranscript | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const hintTimeoutRef = useRef<number | null>(null);
  const mobileRecorderRef = useRef<MediaRecorder | null>(null);
  const mobileStreamRef = useRef<MediaStream | null>(null);
  const mobileChunksRef = useRef<BlobPart[]>([]);
  const mobileWorkspaceIdRef = useRef<string | null>(null);
  const mobilePreferredLanguageRef = useRef<string | null>(null);
  const mobileCanceledRef = useRef(false);
  const mobileChatgpt = isMobilePlatform() && provider === "chatgpt";

  const clearHintTimeout = useCallback(() => {
    if (hintTimeoutRef.current) {
      window.clearTimeout(hintTimeoutRef.current);
      hintTimeoutRef.current = null;
    }
  }, []);

  const showHint = useCallback(
    (message: string) => {
      setHint(message);
      clearHintTimeout();
      hintTimeoutRef.current = window.setTimeout(() => {
        setHint(null);
        hintTimeoutRef.current = null;
      }, 2000);
    },
    [clearHintTimeout],
  );

  const resetMobileCapture = useCallback(() => {
    const stream = mobileStreamRef.current;
    if (stream) {
      for (const track of stream.getTracks()) {
        track.stop();
      }
    }
    mobileRecorderRef.current = null;
    mobileStreamRef.current = null;
    mobileChunksRef.current = [];
    mobileWorkspaceIdRef.current = null;
    mobilePreferredLanguageRef.current = null;
    mobileCanceledRef.current = false;
  }, []);

  useEffect(() => {
    let active = true;
    const unlisten = subscribeDictationEvents((event: DictationEvent) => {
      if (!active) {
        return;
      }
      if (event.type === "state") {
        setState(event.state);
        if (event.state === "idle") {
          setLevel(0);
        }
        return;
      }
      if (event.type === "level") {
        setLevel(event.value);
        return;
      }
      if (event.type === "transcript") {
        setTranscript({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          text: event.text,
        });
        return;
      }
      if (event.type === "error") {
        setError(event.message);
        return;
      }
      if (event.type === "canceled") {
        showHint(event.message);
        return;
      }
    });

    return () => {
      active = false;
      unlisten();
      clearHintTimeout();
      resetMobileCapture();
    };
  }, [clearHintTimeout, resetMobileCapture, showHint]);

  const start = useCallback(
    async (preferredLanguage: string | null, workspaceId?: string | null) => {
      setError(null);
      setHint(null);
      clearHintTimeout();
      if (!mobileChatgpt) {
        await startDictation(preferredLanguage, workspaceId);
        return;
      }
      if (state !== "idle") {
        return;
      }

      const normalizedWorkspaceId = workspaceId?.trim() || null;
      if (!normalizedWorkspaceId) {
        setError("An active workspace is required for ChatGPT dictation.");
        return;
      }
      if (
        typeof navigator === "undefined" ||
        !navigator.mediaDevices ||
        typeof navigator.mediaDevices.getUserMedia !== "function" ||
        typeof MediaRecorder === "undefined"
      ) {
        setError("Audio recording is not available in this mobile runtime.");
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mimeTypeCandidates = [
          "audio/webm;codecs=opus",
          "audio/mp4",
          "audio/webm",
          "audio/ogg;codecs=opus",
        ];
        const supportedMimeType = mimeTypeCandidates.find((candidate) =>
          typeof MediaRecorder.isTypeSupported === "function"
            ? MediaRecorder.isTypeSupported(candidate)
            : false,
        );
        const recorder = supportedMimeType
          ? new MediaRecorder(stream, { mimeType: supportedMimeType })
          : new MediaRecorder(stream);
        mobileRecorderRef.current = recorder;
        mobileStreamRef.current = stream;
        mobileChunksRef.current = [];
        mobileWorkspaceIdRef.current = normalizedWorkspaceId;
        mobilePreferredLanguageRef.current = preferredLanguage;
        mobileCanceledRef.current = false;

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            mobileChunksRef.current.push(event.data);
          }
        };
        recorder.onerror = (event) => {
          const message = event.error?.message?.trim() || "Microphone recording failed.";
          setError(message);
          setState("idle");
          setLevel(0);
          resetMobileCapture();
        };
        recorder.onstop = () => {
          const chunks = [...mobileChunksRef.current];
          const mimeType = recorder.mimeType || supportedMimeType || "audio/webm";
          const canceled = mobileCanceledRef.current;
          const nextWorkspaceId = mobileWorkspaceIdRef.current;
          const nextLanguage = mobilePreferredLanguageRef.current;
          resetMobileCapture();
          if (canceled) {
            setState("idle");
            setLevel(0);
            showHint(DICTATION_CANCEL_HINT);
            return;
          }
          if (!nextWorkspaceId) {
            setState("idle");
            setLevel(0);
            setError("An active workspace is required for ChatGPT dictation.");
            return;
          }

          setState("processing");
          void (async () => {
            try {
              const blob = new Blob(chunks, { type: mimeType });
              if (blob.size === 0) {
                throw new Error("No audio captured.");
              }
              const base64Audio = arrayBufferToBase64(await blob.arrayBuffer());
              const text = await transcribeDictationAudio(
                base64Audio,
                mimeType,
                nextWorkspaceId,
                nextLanguage,
              );
              if (text.trim().length > 0) {
                setTranscript({
                  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                  text,
                });
              }
            } catch (recordingError) {
              const message =
                recordingError instanceof Error && recordingError.message.trim()
                  ? recordingError.message
                  : "Dictation transcription failed.";
              setError(message);
            } finally {
              setState("idle");
              setLevel(0);
            }
          })();
        };

        recorder.start(200);
        setState("listening");
        setLevel(0.2);
      } catch (recordingError) {
        const message =
          recordingError instanceof Error && recordingError.message.trim()
            ? recordingError.message
            : "Microphone access was denied.";
        setError(message);
        setState("idle");
        setLevel(0);
        resetMobileCapture();
      }
    },
    [clearHintTimeout, mobileChatgpt, resetMobileCapture, showHint, state],
  );

  const stop = useCallback(async () => {
    if (!mobileChatgpt) {
      await stopDictation();
      return;
    }
    const recorder = mobileRecorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      return;
    }
    if (state === "listening") {
      setState("processing");
    }
    recorder.stop();
  }, [mobileChatgpt, state]);

  const cancel = useCallback(async () => {
    if (!mobileChatgpt) {
      await cancelDictation();
      return;
    }
    const recorder = mobileRecorderRef.current;
    mobileCanceledRef.current = true;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
      return;
    }
    resetMobileCapture();
    setState("idle");
    setLevel(0);
    showHint(DICTATION_CANCEL_HINT);
  }, [mobileChatgpt, resetMobileCapture, showHint]);

  const clearTranscript = useCallback(
    (id: string) => {
      setTranscript((prev) => (prev?.id === id ? null : prev));
    },
    [],
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const clearHint = useCallback(() => {
    setHint(null);
    clearHintTimeout();
  }, [clearHintTimeout]);

  return {
    state,
    level,
    transcript,
    error,
    hint,
    start,
    stop,
    cancel,
    clearTranscript,
    clearError,
    clearHint,
  };
}
