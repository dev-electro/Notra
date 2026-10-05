/** Tiny pub/sub so the sync layer can debounce a push after any local write without the repo knowing about sync. */
type Listener = () => void;
const listeners = new Set<Listener>();

export function onLocalWrite(cb: Listener): () => void {
  listeners.add(cb);
  return () => void listeners.delete(cb);
}

export function notifyLocalWrite(): void {
  for (const cb of listeners) {
    try {
      cb();
    } catch {
      /* a listener must never break a write */
    }
  }
}
