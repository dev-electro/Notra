import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { MONTHS_HI, shiftDate } from '@/core';
import { colors, MIN_TOUCH, spacing } from '@/theme';

interface Props {
  value: string;
  onChange: (iso: string) => void;
}

function Part({ name, label, onUp, onDown }: { name: string; label: string; onUp: () => void; onDown: () => void }) {
  return (
    <View style={styles.part}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${name} बढ़ाएँ`} accessibilityHint={`अभी ${label}`} onPress={onUp} style={styles.step}>
        <Text style={styles.stepText}>＋</Text>
      </Pressable>
      <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
        {label}
      </Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`${name} घटाएँ`} accessibilityHint={`अभी ${label}`} onPress={onDown} style={styles.step}>
        <Text style={styles.stepText}>－</Text>
      </Pressable>
    </View>
  );
}

/** Date without a keyboard: big plus/minus on day, month and year. */
export function DateStepper({ value, onChange }: Props) {
  const [y, m, d] = value.split('-').map(Number);
  return (
    <View style={styles.row}>
      <Part name="दिन" label={String(d)} onUp={() => onChange(shiftDate(value, { days: 1 }))} onDown={() => onChange(shiftDate(value, { days: -1 }))} />
      <Part name="महीना" label={MONTHS_HI[m - 1]} onUp={() => onChange(shiftDate(value, { months: 1 }))} onDown={() => onChange(shiftDate(value, { months: -1 }))} />
      <Part name="साल" label={String(y)} onUp={() => onChange(shiftDate(value, { years: 1 }))} onDown={() => onChange(shiftDate(value, { years: -1 }))} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  part: { flex: 1, alignItems: 'center', gap: spacing.xs },
  step: {
    width: '100%',
    height: MIN_TOUCH,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.inkBlue,
    backgroundColor: colors.card,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepText: { fontSize: 32, color: colors.inkBlue, fontWeight: '700' },
  value: { fontSize: 28, fontWeight: '700', color: colors.text, height: 40 },
});
