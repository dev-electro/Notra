import React from 'react';
import { StyleSheet, View } from 'react-native';
import { BigButton } from '@/components/big-button';
import { Card } from '@/components/card';
import { DatePickerField } from '@/components/calendar';
import { Icon } from '@/components/icons';
import { PressableScale } from '@/components/pressable-scale';
import { Text } from '@/components/text';
import { todayIso, type ReportFilter } from '@/core';
import { BORDER, colors, MIN_TOUCH, radius, spacing, type } from '@/theme';

interface Props {
  value: ReportFilter;
  onChange: (f: ReportFilter) => void;
  /** Offer "तारीख से छाँटें" (a from / to range) besides the year. Default true. */
  range?: boolean;
  /** Offer "सभी साल". Default true. */
  allYears?: boolean;
}

function Step({ icon, label, onPress }: { icon: 'back' | 'chevron'; label: string; onPress: () => void }) {
  return (
    <PressableScale accessibilityRole="button" accessibilityLabel={label} onPress={onPress} outerStyle={styles.stepOuter} style={styles.step}>
      <Icon name={icon} size={26} color={colors.received} />
    </PressableScale>
  );
}

/** Year chooser (◀ 2026 ▶, or all years) and an optional date range, shared by every report. */
export function RangeFilter({ value, onChange, range = true, allYears = true }: Props) {
  const ranged = !!(value.from || value.to);
  const year = value.year ?? Number(todayIso().slice(0, 4));
  return (
    <Card style={styles.card}>
      {!ranged ? (
        <View style={styles.yearRow}>
          <Step icon="back" label="पिछला साल" onPress={() => onChange({ year: year - 1 })} />
          <Text style={[type.amount, styles.year]} accessibilityRole="header">
            {value.year === null ? 'सभी साल' : value.year}
          </Text>
          <Step icon="chevron" label="अगला साल" onPress={() => onChange({ year: year + 1 })} />
        </View>
      ) : (
        <View style={styles.gap}>
          <DatePickerField label="तारीख से" value={value.from ?? `${year}-01-01`} onChange={(from) => onChange({ ...value, from })} />
          <DatePickerField label="तारीख तक" value={value.to ?? todayIso()} onChange={(to) => onChange({ ...value, to })} />
        </View>
      )}
      <View style={styles.row}>
        {allYears && !ranged ? (
          <BigButton compact label="सभी साल" selected={value.year === null} onPress={() => onChange({ year: value.year === null ? year : null })} />
        ) : null}
        {range ? (
          <BigButton
            compact
            icon="calendar"
            label={ranged ? 'साल से छाँटें' : 'तारीख से छाँटें'}
            onPress={() => onChange(ranged ? { year } : { year: null, from: `${year}-01-01`, to: todayIso() })}
          />
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  gap: { gap: spacing.sm },
  yearRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  year: { flex: 1, textAlign: 'center', color: colors.received },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  stepOuter: { width: MIN_TOUCH, height: MIN_TOUCH },
  step: { width: MIN_TOUCH, height: MIN_TOUCH, alignItems: 'center', justifyContent: 'center', borderRadius: radius.button, borderWidth: BORDER, borderColor: colors.hairline, backgroundColor: colors.card },
});
