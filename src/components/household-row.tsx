import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Household } from '@/core';
import { Avatar } from '@/components/avatar';
import { colors, spacing } from '@/theme';

export const HOUSEHOLD_ROW_HEIGHT = 84;

interface Props {
  household: Household;
  onPress: (h: Household) => void;
  right?: string;
}

/** Same names are common, so father and village always appear under the name. */
export const HouseholdRow = React.memo(function HouseholdRow({ household: h, onPress, right }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onPress(h)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Avatar name={h.headName} photoUri={h.photoUri} />
      <View style={styles.text}>
        <Text style={styles.name} numberOfLines={1}>
          {h.headName}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {[h.fatherName && `${h.fatherName} का`, h.village].filter(Boolean).join(' · ')}
        </Text>
      </View>
      {right ? <Text style={styles.right}>{right}</Text> : null}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    height: HOUSEHOLD_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingRight: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.rule,
  },
  pressed: { opacity: 0.7 },
  text: { flex: 1 },
  name: { fontSize: 24, lineHeight: 32, fontWeight: '700', color: colors.text },
  sub: { fontSize: 18, lineHeight: 26, color: colors.textMuted },
  right: { fontSize: 22, fontWeight: '700', color: colors.inkBlue },
});
