import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon } from '@/components/icons';
import { PressableScale } from '@/components/pressable-scale';
import { Text } from '@/components/text';
import { BORDER, BORDER_TONE, colors, MIN_TOUCH, radius, spacing, type } from '@/theme';

/** A big check box row. Checked = filled indigo box with a tick (and the state is spoken), never colour alone. */
export function ConsentCheck({ checked, onChange, label, testID }: { checked: boolean; onChange: (v: boolean) => void; label: string; testID?: string }) {
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      onPress={() => onChange(!checked)}
      style={styles.row}
    >
      <View style={[styles.box, checked && styles.on]}>{checked ? <Icon name="check" size={22} color={colors.onSolid} /> : null}</View>
      <Text style={[type.body, styles.label]} importantForAccessibility="no">{label}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, minHeight: MIN_TOUCH, padding: spacing.md, backgroundColor: colors.card, borderWidth: BORDER, borderColor: colors.hairline, borderRadius: radius.card },
  box: { width: 32, height: 32, borderRadius: 8, borderWidth: BORDER_TONE, borderColor: colors.received, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  on: { backgroundColor: colors.received },
  label: { flex: 1 },
});
