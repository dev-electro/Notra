/**
 * A tiny toast store: a message that shows for a few seconds. No dependency; the ToastHost component renders it and
 * `guarded` (guard.ts) raises it when a database write fails, so a failed save shows a message instead of crashing.
 */
export interface ToastState {
  id: number;
  message: string;
}
type Listener = (t: ToastState | null) => void;

export function createToastStore(durationMs = 4000, schedule: typeof setTimeout = setTimeout, cancel: typeof clearTimeout = clearTimeout) {
  let current: ToastState | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let seq = 0;
  const listeners = new Set<Listener>();
  const emit = () => listeners.forEach((l) => l(current));
  return {
    show(message: string) {
      if (timer) cancel(timer);
      current = { id: ++seq, message };
      emit();
      timer = schedule(() => {
        current = null;
        timer = null;
        emit();
      }, durationMs);
    },
    hide() {
      if (timer) cancel(timer);
      timer = null;
      current = null;
      emit();
    },
    get: () => current,
    subscribe(l: Listener) {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
  };
}

export const toasts = createToastStore();
export const showToast = (message: string) => toasts.show(message);
