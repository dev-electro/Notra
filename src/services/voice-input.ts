import { useCallback, useEffect, useRef, useState } from 'react';

type SpeechModule = {
  addListener(name: string, cb: (e: never) => void): { remove(): void };
  start(opts: Record<string, unknown>): void;
  stop(): void;
  abort(): void;
  requestPermissionsAsync(): Promise<{ granted: boolean }>;
  supportsOnDeviceRecognition(): boolean;
  isRecognitionAvailable(): boolean;
};

/** expo-speech-recognition needs native code that Expo Go lacks; loading it must never crash the app. */
function loadModule(): SpeechModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const m = require('expo-speech-recognition').ExpoSpeechRecognitionModule as SpeechModule | undefined;
    return m && m.isRecognitionAvailable() ? m : null;
  } catch {
    return null;
  }
}

/**
 * Hindi (hi-IN) voice input. `available` is false (hide the mic) when the module or a recognizer is
 * missing. Prefers on-device recognition and falls back to the network recognizer if that fails.
 * The module is only loaded after the first render, and listeners exist only while listening.
 */
export function useVoiceInput(onTranscript: (text: string) => void) {
  const [available, setAvailable] = useState(false);
  const [listening, setListening] = useState(false);
  const modRef = useRef<SpeechModule | null>(null);
  const subs = useRef<{ remove(): void }[]>([]);
  const cb = useRef(onTranscript);
  useEffect(() => {
    cb.current = onTranscript;
  });

  useEffect(() => {
    const t = setTimeout(() => {
      modRef.current = loadModule();
      setAvailable(!!modRef.current);
    }, 0);
    return () => {
      clearTimeout(t);
      subs.current.forEach((s) => s.remove());
      subs.current = [];
      try {
        modRef.current?.abort();
      } catch {
        /* ignore */
      }
    };
  }, []);

  const cleanup = useCallback(() => {
    subs.current.forEach((s) => s.remove());
    subs.current = [];
    setListening(false);
  }, []);

  const start = useCallback(async () => {
    const mod = modRef.current;
    if (!mod) return;
    try {
      const perm = await mod.requestPermissionsAsync();
      if (!perm.granted) return;
      let onDevice = mod.supportsOnDeviceRecognition();
      let last = '';
      cleanup();
      const begin = () =>
        mod.start({ lang: 'hi-IN', interimResults: false, continuous: false, requiresOnDeviceRecognition: onDevice });
      subs.current = [
        mod.addListener('result', ((e: { results: { transcript: string }[] }) => {
          last = e.results?.[0]?.transcript ?? last;
        }) as (e: never) => void),
        mod.addListener('end', (() => {
          cleanup();
          if (last) cb.current(last);
        }) as (e: never) => void),
        mod.addListener('error', (() => {
          if (onDevice) {
            onDevice = false; // on-device Hindi model missing: retry once over the network
            try {
              begin();
              return;
            } catch {
              /* fall through */
            }
          }
          cleanup();
        }) as (e: never) => void),
      ];
      setListening(true);
      begin();
    } catch {
      cleanup();
    }
  }, [cleanup]);

  const stop = useCallback(() => {
    try {
      modRef.current?.stop();
    } catch {
      cleanup();
    }
  }, [cleanup]);

  return { available, listening, start, stop };
}
