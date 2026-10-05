import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon, type IconName } from '@/components/icons';
import { RiceGrains } from '@/components/motifs';
import { colors } from '@/theme';
import type { Occasion } from '@/core';

export const OCCASION_ICON_NAME: Record<Occasion, IconName> = {
  SHAADI: 'kalash',
  GRIHAPRAVESH: 'grihapravesh',
  MUNDAN: 'mundan',
  BIMARI: 'medical',
  MAKAAN: 'house',
  OTHER: 'star',
};

export const OCCASION_TONE: Record<Occasion, { bg: string; fg: string }> = {
  SHAADI: { bg: colors.haldiTint, fg: colors.given },
  GRIHAPRAVESH: { bg: colors.receivedTint, fg: colors.received },
  MUNDAN: { bg: colors.givenTint, fg: colors.given },
  BIMARI: { bg: colors.successTint, fg: colors.successInk },
  MAKAAN: { bg: colors.receivedTint, fg: colors.received },
  OTHER: { bg: colors.haldiTint, fg: colors.ink },
};

/** Round picture of the occasion; the wedding one is sprinkled with yellow rice. */
export const OccasionBadge = React.memo(function OccasionBadge({ occasion, size = 64 }: { occasion: Occasion; size?: number }) {
  const t = OCCASION_TONE[occasion];
  return (
    <View style={[styles.disc, { width: size, height: size, borderRadius: size / 2, backgroundColor: t.bg }]} accessible={false} importantForAccessibility="no-hide-descendants">
      {occasion === 'SHAADI' ? (
        <View style={[StyleSheet.absoluteFill, { borderRadius: size / 2, overflow: 'hidden' }]}>
          <RiceGrains width={size} height={size} count={14} seed={3} opacity={0.75} />
        </View>
      ) : null}
      <Icon name={OCCASION_ICON_NAME[occasion]} size={size * 0.55} color={t.fg} />
    </View>
  );
});

const styles = StyleSheet.create({ disc: { alignItems: 'center', justifyContent: 'center' } });
