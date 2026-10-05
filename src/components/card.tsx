import React from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import { Icon, type IconName } from '@/components/icons';
import { Text } from '@/components/text';
import { BORDER, colors, radius, spacing, type } from '@/theme';

type Tint = 'none' | 'received' | 'given' | 'haldi' | 'success';
const BG: Record<Tint, string> = {
  none: colors.card,
  received: colors.receivedTint,
  given: colors.givenTint,
  haldi: colors.haldiTint,
  success: colors.successTint,
};

export type Accent = 'received' | 'given';
export const ACCENT_INK: Record<Accent, string> = { received: colors.received, given: colors.given };

interface Props extends ViewProps {
  tint?: Tint;
  /** Thin left bar showing direction (indigo = आया, kumkum = गया). Always paired with an arrow + word inside, never colour alone. */
  accent?: Accent;
}

/** Flat card: hairline border, optional soft tint, optional left accent bar, radius 16. */
export function Card({ tint = 'none', accent, style, children, ...rest }: Props) {
  return (
    <View {...rest} style={[styles.card, { backgroundColor: BG[tint] }, style]}>
      {accent ? <View pointerEvents="none" style={[styles.bar, { backgroundColor: ACCENT_INK[accent] }]} /> : null}
      {children}
    </View>
  );
}

/** Small "जल्द" badge: clock-less, text pill on haldi tint with a star, so it reads without colour. */
export function SoonBadge({ label = 'जल्द' }: { label?: string }) {
  return (
    <View style={styles.soon}>
      <Icon name="star" size={16} color={colors.ink} />
      <Text style={[type.captionBold, styles.soonText]}>{label}</Text>
    </View>
  );
}

/** Section heading with an optional small icon. */
export function SectionTitle({ children, icon }: { children: string; icon?: IconName }) {
  return (
    <View style={styles.titleRow} accessibilityRole="header">
      {icon ? <Icon name={icon} size={26} color={colors.received} /> : null}
      <Text style={[type.heading, styles.titleText]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: BORDER, borderColor: colors.hairline, borderRadius: radius.card, padding: spacing.md, gap: spacing.xs, overflow: 'hidden' },
  bar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: spacing.xs },
  soon: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.sm, borderRadius: radius.pill,
    backgroundColor: colors.haldiTint, borderWidth: BORDER, borderColor: colors.haldi,
  },
  soonText: { color: colors.ink },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  titleText: { color: colors.ink, flexShrink: 1 },
});
