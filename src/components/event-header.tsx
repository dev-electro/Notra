import React from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { DirectionTag } from '@/components/direction';
import { OccasionBadge } from '@/components/occasion';
import { RiceGrains } from '@/components/motifs';
import { Text } from '@/components/text';
import { formatINR, OCCASION_LABEL, type Occasion } from '@/core';
import { BORDER, colors, GUTTER, radius, spacing, type } from '@/theme';

const TINT: Record<Occasion, string> = {
  SHAADI: colors.haldiTint,
  BIMARI: colors.successTint,
  MAKAAN: colors.receivedTint,
  OTHER: colors.haldiTint,
};

interface Props {
  occasion: Occasion;
  /** Small line under the occasion name (date, host...). */
  subtitle?: string;
  /** Status word such as "तय हुआ". */
  status?: string;
  totalPaise: number;
  giverCount: number;
  /** Smaller variant for crowded screens. */
  compact?: boolean;
}

/** Festive top of an event: occasion picture (yellow rice for a wedding), the huge running total and how many families gave. */
export const EventHeader = React.memo(function EventHeader({ occasion, subtitle, status, totalPaise, giverCount, compact }: Props) {
  const { width } = useWindowDimensions();
  const w = width - GUTTER * 2;
  return (
    <View style={[styles.card, { backgroundColor: TINT[occasion] }]}>
      {occasion === 'SHAADI' ? <RiceGrains width={w} height={compact ? 150 : 230} count={compact ? 26 : 42} seed={11} opacity={0.55} /> : null}
      <View style={styles.top}>
        <OccasionBadge occasion={occasion} size={compact ? 48 : 64} />
        <View style={styles.flex}>
          <Text style={[type.title, styles.name]} numberOfLines={1}>
            {OCCASION_LABEL[occasion]}
          </Text>
          {subtitle ? (
            <Text style={[type.caption, styles.sub]} numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {status ? (
          <View style={styles.status}>
            <Text style={[type.captionBold, styles.statusText]}>{status}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.sum}>
        <DirectionTag direction="AAYA" paired />
        <Text style={[compact ? type.amount : type.amountXL, styles.total]} adjustsFontSizeToFit numberOfLines={1}>
          {formatINR(totalPaise)}
        </Text>
        <Text style={[type.heading, styles.count]}>{giverCount} परिवार</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.card,
    borderWidth: BORDER,
    borderColor: colors.hairline,
  },
  flex: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  name: { color: colors.ink },
  sub: { color: colors.muted },
  status: { backgroundColor: colors.card, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderWidth: BORDER, borderColor: colors.hairline },
  statusText: { color: colors.ink },
  sum: { gap: spacing.xs },
  total: { color: colors.received },
  count: { color: colors.ink },
});
