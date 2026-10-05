import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { errorText } from './service';

export interface Served<T> {
  data: T | null;
  loading: boolean;
  /** Plain Hindi, or '' when fine. */
  error: string;
  reload: () => void;
}

/** Run a server call whenever the screen gains focus (and again when `key` changes). Failures become a Hindi sentence in `error`; `data` keeps the last good value. */
export function useServer<T>(fn: () => Promise<T>, key = ''): Served<T> {
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: string }>({ data: null, loading: true, error: '' });
  const ref = useRef(fn);
  ref.current = fn; // eslint-disable-line react-hooks/refs
  const run = useCallback(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    ref.current().then(
      (data) => alive && setState({ data, loading: false, error: '' }),
      (e) => alive && setState((s) => ({ data: s.data, loading: false, error: errorText(e) })),
    );
    return () => {
      alive = false;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps -- `key`: the screen's own filter; the call re-runs when it changes
  useFocusEffect(run);
  return { ...state, reload: run };
}
