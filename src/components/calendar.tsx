import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BigButton } from '@/components/big-button';
import { Icon } from '@/components/icons';
import { OCCASION_TONE } from '@/components/occasion';
import { PressableScale } from '@/components/pressable-scale';
import { Text } from '@/components/text';
import { displayDate, longDateHi, monthGrid, MONTHS_HI, occasionName, todayIso, WEEKDAYS_HI, type Occasion } from '@/core';
import { BORDER, colors, GUTTER, MIN_TOUCH, radius, spacing, type } from '@/theme';

const CELL_H = 56;
const MAX_DOTS = 3;

/** One dot per program on a day (up to 3, in the occasion's colour); the day list under the calendar names them. */
export type DayMarkers = Record<string, Occasion[]>;

interface Props {
  /** The chosen day (ISO). */
  value?: string;
  onSelect: (iso: string) => void;
  /** Programs per day, for dots. */
  markers?: DayMarkers;
  /** Called with the visible month whenever it changes (and once at the start) so a screen can load that month's programs. */
  onMonthChange?: (year: number, month1: number) => void;
}

function Nav({ icon, label, onPress, testID }: { icon: 'back' | 'chevron'; label: string; onPress: () => void; testID?: string }) {
  return (
    <PressableScale testID={testID} accessibilityRole="button" accessibilityLabel={label} onPress={onPress} outerStyle={styles.navOuter} style={styles.nav}>
      <Icon name={icon} size={26} color={colors.received} />
    </PressableScale>
  );
}

/**
 * Lightweight month grid (plain Views, no calendar library): Hindi month and weekday names, today ringed, the chosen day in haldi,
 * occasion dots on days that have programs. Tap the month name to jump by year / month.
 */
export const Calendar = React.memo(function Calendar({ value, onSelect, markers, onMonthChange }: Props) {
  const start = value ?? todayIso();
  const [cursor, setCursor] = useState({ y: Number(start.slice(0, 4)), m: Number(start.slice(5, 7)) });
  const [quick, setQuick] = useState(false);
  const today = todayIso();

  const move = useCallback(
    (y: number, m: number) => {
      const ny = y + Math.floor((m - 1) / 12);
      const nm = ((((m - 1) % 12) + 12) % 12) + 1;
      setCursor({ y: ny, m: nm });
      onMonthChange?.(ny, nm);
    },
    [onMonthChange],
  );
  // announce the first month once, so the screen can load its programs
  useEffect(() => {
    onMonthChange?.(cursor.y, cursor.m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const weeks = useMemo(() => monthGrid(cursor.y, cursor.m), [cursor.y, cursor.m]);

  if (quick) {
    return (
      <View style={styles.wrap}>
        <View style={styles.head}>
          <Nav icon="back" label="पिछला साल" onPress={() => setCursor((c) => ({ ...c, y: c.y - 1 }))} />
          <Text style={[type.heading, styles.title]} accessibilityRole="header">
            {cursor.y}
          </Text>
          <Nav icon="chevron" label="अगला साल" onPress={() => setCursor((c) => ({ ...c, y: c.y + 1 }))} />
        </View>
        <View style={styles.months}>
          {MONTHS_HI.map((name, i) => (
            <BigButton
              key={name}
              testID={`cal-month-${i + 1}`}
              third
              label={name}
              selected={cursor.m === i + 1}
              onPress={() => {
                move(cursor.y, i + 1);
                setQuick(false);
              }}
            />
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Nav testID="cal-prev" icon="back" label="पिछला महीना" onPress={() => move(cursor.y, cursor.m - 1)} />
        <PressableScale
          testID="cal-title"
          accessibilityRole="button"
          accessibilityLabel={`${MONTHS_HI[cursor.m - 1]} ${cursor.y}`}
          accessibilityHint="साल या महीना बदलें"
          onPress={() => setQuick(true)}
          outerStyle={styles.titleOuter}
          style={styles.titleBtn}
        >
          <Text style={[type.heading, styles.title]} numberOfLines={1} importantForAccessibility="no">
            {MONTHS_HI[cursor.m - 1]} {cursor.y}
          </Text>
        </PressableScale>
        <Nav testID="cal-next" icon="chevron" label="अगला महीना" onPress={() => move(cursor.y, cursor.m + 1)} />
      </View>
      <View style={styles.week}>
        {WEEKDAYS_HI.map((d) => (
          <Text key={d} style={[type.captionBold, styles.weekday]} numberOfLines={1} importantForAccessibility="no">
            {d}
          </Text>
        ))}
      </View>
      {weeks.map((w, wi) => (
        <View key={wi} style={styles.week}>
          {w.map((iso, di) => {
            if (!iso) return <View key={di} style={styles.cell} />;
            const marks = markers?.[iso];
            const picked = iso === value;
            const day = Number(iso.slice(8, 10));
            return (
              <PressableScale
                key={di}
                testID={`cal-day-${iso}`}
                accessibilityRole="button"
                accessibilityLabel={`${longDateHi(iso)}${marks?.length ? `, ${marks.length} कार्यक्रम: ${[...new Set(marks.map((o) => occasionName(o)))].join(', ')}` : ''}`}
                accessibilityState={{ selected: picked }}
                onPress={() => onSelect(iso)}
                outerStyle={styles.cell}
                style={[styles.day, iso === today && styles.today, picked && styles.picked]}
              >
                <Text style={[type.bodyBold, { color: colors.ink }]} importantForAccessibility="no">
                  {day}
                </Text>
                <View style={styles.dots}>
                  {(marks ?? []).slice(0, MAX_DOTS).map((o, i) => (
                    <View key={i} style={[styles.dot, { backgroundColor: OCCASION_TONE[o].fg }]} />
                  ))}
                </View>
              </PressableScale>
            );
          })}
        </View>
      ))}
    </View>
  );
});

interface FieldProps {
  testID?: string;
  label: string;
  value: string;
  onChange: (iso: string) => void;
}

/**
 * A date as one big button ("तारीख: 05/10/2026"); tapping opens the calendar in a sheet. Past dates are allowed (old diaries).
 * Used for the event date, the entry date and the old-records date.
 */
export function DatePickerField({ label, value, onChange, testID }: FieldProps) {
  const [open, setOpen] = useState(false);
  const pick = useCallback(
    (iso: string) => {
      onChange(iso);
      setOpen(false);
    },
    [onChange],
  );
  return (
    <>
      <PressableScale
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${longDateHi(value)}`}
        accessibilityHint="कैलेंडर खोलकर तारीख चुनें"
        onPress={() => setOpen(true)}
        style={styles.field}
      >
        <Icon name="calendar" size={28} color={colors.received} />
        <View style={styles.flex}>
          <Text style={[type.caption, styles.muted]} importantForAccessibility="no">
            {label}
          </Text>
          <Text style={[type.heading, { color: colors.ink }]} importantForAccessibility="no">
            {displayDate(value)}
          </Text>
        </View>
        <Icon name="chevron" size={22} color={colors.muted} />
      </PressableScale>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)} statusBarTranslucent>
        <View style={styles.backdrop} accessibilityViewIsModal>
          <SafeAreaView style={styles.sheetSafe}>
            <View style={styles.sheet}>
              <Text style={[type.heading, styles.sheetTitle]} accessibilityRole="header">
                {label}
              </Text>
              <Calendar value={value} onSelect={pick} />
              <View style={styles.sheetRow}>
                <BigButton testID="cal-today" compact label="आज" icon="calendar" onPress={() => pick(todayIso())} />
                <BigButton testID="cal-close" compact label="बंद करें" tone="plain" onPress={() => setOpen(false)} />
              </View>
            </View>
          </SafeAreaView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  muted: { color: colors.muted },
  wrap: { gap: spacing.xs },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  navOuter: { width: MIN_TOUCH, height: MIN_TOUCH },
  nav: {
    width: MIN_TOUCH, height: MIN_TOUCH, alignItems: 'center', justifyContent: 'center', borderRadius: radius.button,
    borderWidth: BORDER, borderColor: colors.hairline, backgroundColor: colors.card,
  },
  titleOuter: { flex: 1 },
  titleBtn: { minHeight: MIN_TOUCH, alignItems: 'center', justifyContent: 'center', borderRadius: radius.button, backgroundColor: colors.haldiTint },
  title: { color: colors.ink, textAlign: 'center', flex: 1, textAlignVertical: 'center' },
  week: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', color: colors.muted },
  cell: { flex: 1, height: CELL_H },
  day: { flex: 1, margin: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.card, borderWidth: BORDER, borderColor: colors.hairline },
  today: { borderColor: colors.received, borderWidth: 2 },
  picked: { backgroundColor: colors.haldi, borderColor: colors.haldi },
  dots: { flexDirection: 'row', gap: 3, height: 8, alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  months: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  field: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: MIN_TOUCH + spacing.sm, paddingHorizontal: spacing.md,
    backgroundColor: colors.card, borderWidth: BORDER, borderColor: colors.hairline, borderRadius: radius.card,
  },
  backdrop: { flex: 1, backgroundColor: 'rgba(42,33,24,0.55)', justifyContent: 'center' },
  sheetSafe: { paddingHorizontal: GUTTER },
  sheet: { backgroundColor: colors.paper, borderRadius: radius.card, padding: spacing.md, gap: spacing.sm, borderWidth: BORDER, borderColor: colors.hairline },
  sheetTitle: { color: colors.ink },
  sheetRow: { flexDirection: 'row', gap: spacing.sm },
});
