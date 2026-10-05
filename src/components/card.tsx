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

interface Props extends ViewProps {
  tint?: Tint;
}

/** Flat card: hairline border, optional soft tint, radius 16. */
export function Card({ tint = 'none', style, ...rest }: Props) {
  return <View {...rest} style={[styles.card, { backgroundColor: BG[tint] }, style]} />;
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
  card: { borderWidth: BORDER, borderColor: colors.hairline, borderRadius: radius.card, padding: spacing.md, gap: spacing.xs },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  titleText: { color: colors.ink, flexShrink: 1 },
});
