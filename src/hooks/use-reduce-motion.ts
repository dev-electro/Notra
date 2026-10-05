import { useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';

/** The phone's "remove animations" setting. One shared listener; animations are skipped when it is on. */
let current = false;
let started = false;
const subs = new Set<() => void>();
const set = (v: boolean) => {
  if (v === current) return;
  current = v;
  subs.forEach((f) => f());
};

function start() {
  if (started) return;
  started = true;
  try {
    void AccessibilityInfo.isReduceMotionEnabled()
      .then(set)
      .catch(() => undefined);
    AccessibilityInfo.addEventListener('reduceMotionChanged', set);
  } catch {
    /* no accessibility service: animations stay on */
  }
}

const subscribe = (f: () => void) => {
  start();
  subs.add(f);
  return () => void subs.delete(f);
};
const get = () => current;

export const isReduceMotion = (): boolean => {
  start();
  return current;
};

export const useReduceMotion = (): boolean => useSyncExternalStore(subscribe, get, get);
