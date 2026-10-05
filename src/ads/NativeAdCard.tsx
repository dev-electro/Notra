import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { markOnline } from '@/remote/online';
import { BORDER, colors, MIN_TOUCH, radius, spacing, type } from '@/theme';
import type { AdScreen } from './policy';
import { adUnits, requestOptions } from './service';
import { useAdGate } from './use-ad-gate';

type Lib = typeof import('react-native-google-mobile-ads');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const lib = () => require('react-native-google-mobile-ads') as Lib;
type NativeAdT = Awaited<ReturnType<Lib['NativeAd']['createForAdRequest']>>;

// A virtualised list unmounts cards that scroll away; keep a few loaded ads so scrolling back does not request again.
const POOL_MAX = 4;
const POOL_TTL_MS = 10 * 60_000;
const pool = new Map<string, { ad: NativeAdT; at: number }>();
function remember(key: string, ad: NativeAdT) {
  pool.set(key, { ad, at: Date.now() });
  while (pool.size > POOL_MAX) {
    const first = pool.keys().next().value as string;
    pool.get(first)?.ad.destroy();
    pool.delete(first);
  }
}

interface Props {
  /** Unique within the list, e.g. "mera:1". */
  slotKey: string;
  screen: AdScreen;
  itemCount: number;
  /** Position of this card in the list (1 = after the first item). */
  index: number;
}

/**
 * Native ad drawn with our tokens: same card shape as the list's cards but tinted haldi, with a "विज्ञापन" label, so it can
 * never be mistaken for an entry. Renders nothing (no gap) until an ad has loaded, and nothing if it fails.
 */
export function NativeAdCard({ slotKey, screen, itemCount, index }: Props) {
  const allowed = useAdGate('native', screen, { itemCount, index });
  const [ad, setAd] = useState<NativeAdT | null>(() => {
    const hit = pool.get(slotKey);
    return hit && Date.now() - hit.at < POOL_TTL_MS ? hit.ad : null;
  });
  useEffect(() => {
    if (!allowed || ad) return;
    let alive = true;
    lib()
      .NativeAd.createForAdRequest(adUnits().units.native, requestOptions())
      .then((a) => {
        markOnline(true);
        remember(slotKey, a);
        if (alive) setAd(a);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [allowed, ad, slotKey]);
  if (!allowed || !ad) return null;
  const { NativeAdView, NativeAsset, NativeAssetType, NativeMediaView } = lib();
  return (
    <NativeAdView nativeAd={ad} style={styles.card} testID="ad-native">
      <View style={styles.top}>
        <View style={styles.tag}>
          <Text style={[type.captionBold, styles.tagText]}>विज्ञापन</Text>
        </View>
        {ad.advertiser ? (
          <NativeAsset assetType={NativeAssetType.ADVERTISER}>
            <Text style={[type.caption, styles.muted]} numberOfLines={1}>
              {ad.advertiser}
            </Text>
          </NativeAsset>
        ) : null}
      </View>
      <View style={styles.row}>
        {ad.icon ? (
          <NativeAsset assetType={NativeAssetType.ICON}>
            <Image source={{ uri: ad.icon.url }} style={styles.icon} />
          </NativeAsset>
        ) : null}
        <View style={styles.flex}>
          <NativeAsset assetType={NativeAssetType.HEADLINE}>
            <Text style={[type.bodyBold, styles.ink]} numberOfLines={2}>
              {ad.headline}
            </Text>
          </NativeAsset>
          {ad.body ? (
            <NativeAsset assetType={NativeAssetType.BODY}>
              <Text style={[type.caption, styles.muted]} numberOfLines={2}>
                {ad.body}
              </Text>
            </NativeAsset>
          ) : null}
        </View>
      </View>
      <NativeMediaView style={styles.media} resizeMode="cover" />
      {ad.callToAction ? (
        <NativeAsset assetType={NativeAssetType.CALL_TO_ACTION}>
          <Text style={[type.button, styles.cta]} numberOfLines={1}>
            {ad.callToAction}
          </Text>
        </NativeAsset>
      ) : null}
    </NativeAdView>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm, padding: spacing.md, backgroundColor: colors.haldiTint, borderWidth: BORDER, borderColor: colors.haldi, borderRadius: radius.card },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  tag: { paddingHorizontal: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.haldi },
  tagText: { color: colors.onHaldi },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1 },
  icon: { width: 48, height: 48, borderRadius: radius.card / 2 },
  media: { height: 140, width: '100%', borderRadius: radius.card / 2, overflow: 'hidden' },
  cta: { minHeight: MIN_TOUCH - 8, textAlign: 'center', textAlignVertical: 'center', backgroundColor: colors.haldi, color: colors.onHaldi, borderRadius: radius.button, overflow: 'hidden', paddingHorizontal: spacing.md },
  ink: { color: colors.ink },
  muted: { color: colors.muted },
});
