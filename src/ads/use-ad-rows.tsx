import React, { useCallback, useMemo } from 'react';
import type { ListRenderItem, ListRenderItemInfo } from 'react-native';
import { useRemoteConfig } from '@/remote/use-remote';
import { NativeAdCard } from './NativeAdCard';
import type { AdScreen } from './policy';
import { isAdSlot, withAdSlots, type AdSlot } from './slots';

/**
 * Turns a long list into a list with native ad cards every N items (N from remote config). With ads off, fewer than 6 items, or
 * before an ad has loaded, the rows are exactly the items (an ad slot that cannot load renders null, so there is no gap).
 */
export function useAdRows<T>(items: readonly T[], screen: AdScreen, listId: string, keyOf: (item: T, i: number) => string, renderItem: ListRenderItem<T>) {
  const { ads } = useRemoteConfig();
  const on = ads.enabled && ads.native;
  const rows = useMemo(() => withAdSlots(items, ads.native_every_n_items, on), [items, ads.native_every_n_items, on]);
  const count = items.length;
  const key = useCallback((row: T | AdSlot, i: number) => (isAdSlot(row) ? `ad-${row.n}` : keyOf(row, i)), [keyOf]);
  const render = useCallback(
    (info: ListRenderItemInfo<T | AdSlot>) =>
      isAdSlot(info.item) ? (
        <NativeAdCard slotKey={`${listId}:${info.item.n}`} screen={screen} itemCount={count} index={info.index} />
      ) : (
        renderItem(info as ListRenderItemInfo<T>)
      ),
    [renderItem, listId, screen, count],
  );
  return { rows, keyExtractor: key, renderItem: render as ListRenderItem<T | AdSlot> };
}
