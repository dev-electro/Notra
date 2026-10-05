import { useCallback, useState } from 'react';
import type { Db } from '@/db';
import { useLoad } from './use-load';

/**
 * A paged SQL list for report screens: LIMIT grows by `page` when the list nears its end. `key` is the screen's filter; when it
 * changes the list starts again from the first page.
 */
export function usePaged<T>(fetch: (db: Db, ledgerId: string, limit: number) => Promise<T[]>, key: string, page = 30) {
  const [st, setSt] = useState({ key, limit: page });
  const limit = st.key === key ? st.limit : page;
  const { data, loading, reload } = useLoad((db, ledgerId) => fetch(db, ledgerId, limit), [] as T[], `${key}|${limit}`);
  const more = useCallback(() => {
    if (data.length >= limit) setSt({ key, limit: limit + page });
  }, [data.length, limit, key, page]);
  return { rows: data, loading, more, reload };
}
