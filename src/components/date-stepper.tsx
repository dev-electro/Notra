import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon } from '@/components/icons';
import { PressableScale } from '@/components/pressable-scale';
import { Text } from '@/components/text';
import { MONTHS_HI, shiftDate } from '@/core';
import { BORDER, colors, MIN_TOUCH, radius, spacing, type } from '@/theme';

interface Props {
  value: string;
  onChange: (iso: string) => void;
}

function Step({ label, name, shown, plus, onPress }: { label: string; name: string; shown: string; plus: boolean; onPress: () => void }) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={`अभी ${shown}`}
      onPress={onPress}
      outerStyle={styles.stepOuter}
      style={styles.step}
    >
      <Icon name={plus ? 'plus' : 'minus'} size={28} color={colors.received} />
      <Text style={[type.caption, styles.stepName]} importantForAccessibility="no">
        {name}
      </Text>
    </PressableScale>
  );
}

function Part({ name, label, onUp, onDown }: { name: string; label: string; onUp: () => void; onDown: () => void }) {
  return (
    <View style={styles.part}>
      <Step label={`${name} बढ़ाएँ`} name={name} shown={label} plus onPress={onUp} />
      <View style={styles.valueBox}>
        <Text style={[type.heading, styles.value]} numberOfLines={1} adjustsFontSizeToFit>
          {label}
        </Text>
      </View>
      <Step label={`${name} घटाएँ`} name={name} shown={label} plus={false} onPress={onDown} />
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
  part: { flex: 1, gap: spacing.xs },
  stepOuter: { width: '100%' },
  step: {
    minHeight: MIN_TOUCH,
    borderRadius: radius.button,
    borderWidth: BORDER,
    borderColor: colors.hairline,
    backgroundColor: colors.card,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepName: { color: colors.muted },
  valueBox: { minHeight: 48, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.haldiTint, borderRadius: radius.button },
  value: { color: colors.ink },
});
