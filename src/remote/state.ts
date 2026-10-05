/** In-memory holder of the live remote config and the "account suspended" message, with a subscribe for React. No imports of the api. */
import { DEFAULT_CONFIG, type RemoteConfig } from './config';

export interface RemoteSnapshot {
  config: RemoteConfig;
  /** The server's Hindi text when it answered 403 "suspended"; null otherwise. Sync stays stopped while this is set. */
  suspended: string | null;
}

let snap: RemoteSnapshot = { config: DEFAULT_CONFIG, suspended: null };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const getRemote = () => snap;
export const subscribeRemote = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
export function setRemoteConfig(config: RemoteConfig) {
  snap = { ...snap, config };
  emit();
}
export function setSuspended(message: string | null) {
  if (snap.suspended === message) return;
  snap = { ...snap, suspended: message };
  emit();
}
/** Sync (and only sync) pauses while the server says maintenance or the account is suspended. The diary itself never pauses. */
export const syncPaused = () => snap.config.maintenance.enabled || snap.suspended !== null;
export function resetRemoteForTests() {
  snap = { config: DEFAULT_CONFIG, suspended: null };
  emit();
}
