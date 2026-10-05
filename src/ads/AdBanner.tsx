import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { markOnline } from '@/remote/online';
import { BORDER, colors, spacing } from '@/theme';
import type { AdScreen } from './policy';
import { adUnits, requestOptions } from './service';
import { useAdGate } from './use-ad-gate';

/**
 * Adaptive anchored banner. Mounted only where the policy allows (घर and हिसाब hub). It takes NO space until an ad has loaded:
 * before that it is laid out absolutely (so the SDK can load it) and invisible; on failure it stays that way.
 */
export function AdBanner({ screen }: { screen: AdScreen }) {
  const allowed = useAdGate('banner', screen);
  if (!allowed) return null;
  return <Loaded />;
}

function Loaded() {
  const [loaded, setLoaded] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { BannerAd, BannerAdSize } = require('react-native-google-mobile-ads') as typeof import('react-native-google-mobile-ads');
  return (
    <View testID="ad-banner" style={loaded ? styles.box : styles.hidden} pointerEvents={loaded ? 'auto' : 'none'} accessibilityElementsHidden={!loaded} importantForAccessibility={loaded ? 'auto' : 'no-hide-descendants'}>
      <BannerAd
        unitId={adUnits().units.banner}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={requestOptions()}
        onAdLoaded={() => {
          markOnline(true);
          setLoaded(true);
        }}
        onAdFailedToLoad={() => setLoaded(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', backgroundColor: colors.card, borderTopWidth: BORDER, borderTopColor: colors.hairline, paddingVertical: spacing.xs },
  hidden: { position: 'absolute', left: 0, right: 0, bottom: '100%', opacity: 0, height: 1, overflow: 'hidden' },
});
