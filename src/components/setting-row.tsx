import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon, type IconName } from '@/components/icons';
import { PressableScale } from '@/components/pressable-scale';
import { Text } from '@/components/text';
import { BORDER, colors, MIN_TOUCH, radius, spacing, type } from '@/theme';

interface Props {
  icon: IconName;
  label: string;
  /** One small line under the label. */
  sub?: string;
  onPress: () => void;
  /** Kumkum for things that cannot be undone. */
  danger?: boolean;
  /** Spoken after the label. */
  hint?: string;
}

/** A tappable settings line: round icon, label, small explanation, chevron. */
export const SettingRow = React.memo(function SettingRow({ icon, label, sub, onPress, danger, hint }: Props) {
  const ink = danger ? colors.given : colors.ink;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint ?? sub}
      onPress={onPress}
      style={styles.row}
    >
      <View style={[styles.disc, { backgroundColor: danger ? colors.givenTint : colors.haldiTint }]}>
        <Icon name={icon} size={26} color={danger ? colors.given : colors.ink} />
      </View>
      <View style={styles.text}>
        <Text style={[type.bodyBold, { color: ink }]} numberOfLines={2}>
          {label}
        </Text>
        {sub ? (
          <Text style={[type.caption, styles.sub]} numberOfLines={2}>
            {sub}
          </Text>
        ) : null}
      </View>
      <Icon name="chevron" size={22} color={colors.muted} />
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: MIN_TOUCH + spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.card,
    borderWidth: BORDER,
    borderColor: colors.hairline,
    borderRadius: radius.card,
  },
  disc: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1 },
  sub: { color: colors.muted },
});
