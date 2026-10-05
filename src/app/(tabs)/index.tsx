import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BigButton } from '@/components/big-button';
import { Calendar, type DayMarkers } from '@/components/calendar';
import { Card, SectionTitle } from '@/components/card';
import { Icon } from '@/components/icons';
import { OccasionBadge } from '@/components/occasion';
import { Toran } from '@/components/motifs';
import { PressableScale } from '@/components/pressable-scale';
import { SpeakerButton } from '@/components/speaker-button';
import { Text } from '@/components/text';
import { BottomBar } from '@/components/screen';
import { DEFAULT_LEDGER_ID, firstRunRoute, formatINR, LEGACY_EVENT_LABEL, longDateHi, monthRange, occasionName, todayIso, type Occasion } from '@/core';
import { getMyHousehold, getMyHouseholdId, sqlEventCards, type EventCard } from '@/db';
import { useActiveLedger } from '@/hooks/use-active-ledger';
import { useLedgerTotals } from '@/hooks/use-ledger-totals';
import { useLoad } from '@/hooks/use-load';
import { go, replace } from '@/nav';
import { HELP_HOME } from '@/onboarding/help';
import { BORDER, colors, GUTTER, MIN_TOUCH, radius, spacing, type } from '@/theme';

interface RowProps {
  tone: 'received' | 'given';
  word: string;
  paired: string;
  amount: string;
}

/** One line of the summary: arrow in a tinted disc, the word, and the big amount. Arrow + word + colour, never colour alone. */
function SummaryRow({ tone, word, paired, amount }: RowProps) {
  const received = tone === 'received';
  const ink = received ? colors.received : colors.given;
  return (
    <View style={styles.sumRow} accessible accessibilityLabel={`${word}, ${amount}`}>
      <View style={[styles.sumDisc, { backgroundColor: received ? colors.receivedTint : colors.givenTint }]}>
        <Icon name={received ? 'arrowDown' : 'arrowUp'} size={28} color={ink} strokeWidth={2.5} />
      </View>
      <View style={styles.sumWords}>
        <Text style={[type.heading, { color: ink }]} numberOfLines={1}>
          {word}
        </Text>
        <Text style={[type.caption, styles.muted]} numberOfLines={1}>
          {paired}
        </Text>
      </View>
      <Text style={[type.amount, styles.sumAmount, { color: ink }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
        {amount}
      </Text>
    </View>
  );
}

interface MonthProgram extends EventCard {
  mine: boolean;
}

/** The programs (mine and other families') whose date falls in the visible month. */
function useMonthPrograms(month: { y: number; m: number }) {
  const { data } = useLoad(
    async (db, ledgerId) => {
      const { from, to } = monthRange(month.y, month.m);
      const me = await getMyHouseholdId(db);
      const [mine, theirs] = await Promise.all([
        sqlEventCards(db, ledgerId, me, { mine: true, from, to }),
        sqlEventCards(db, ledgerId, me, { mine: false, from, to }),
      ]);
      return [...mine.map((c) => ({ ...c, mine: true })), ...theirs.map((c) => ({ ...c, mine: false }))] as MonthProgram[];
    },
    [] as MonthProgram[],
    `${month.y}-${month.m}`,
  );
  return data;
}

/** Programs of the chosen day, one line each: picture, name, whose, and a tap to open. */
function DayPrograms({ day, items }: { day: string; items: MonthProgram[] }) {
  return (
    <View style={styles.dayList}>
      <Text style={[type.bodyBold, styles.ink]} accessibilityRole="header">
        {longDateHi(day)}
      </Text>
      {items.length === 0 ? <Text style={[type.body, styles.muted]}>इस दिन कोई नोतरा नहीं</Text> : null}
      {items.map((c) => (
        <PressableScale
          key={c.event.id}
          accessibilityRole="button"
          accessibilityLabel={`${c.event.legacy ? LEGACY_EVENT_LABEL : occasionName(c.event.occasion, c.event.occasionLabel)}, ${c.host.headName}, ${c.mine ? 'मेरा नोतरा' : 'दूसरों का नोतरा'}`}
          accessibilityHint="नोतरे की जानकारी खोलें"
          onPress={() => go(`/events/${c.event.id}`)}
          style={styles.dayRow}
        >
          <OccasionBadge occasion={c.event.occasion as Occasion} size={48} />
          <View style={styles.flex}>
            <Text style={[type.bodyBold, styles.ink]} numberOfLines={1}>
              {c.event.legacy ? LEGACY_EVENT_LABEL : occasionName(c.event.occasion, c.event.occasionLabel)}
            </Text>
            <Text style={[type.caption, styles.muted]} numberOfLines={1}>
              {c.mine ? 'मेरा नोतरा' : `${c.host.headName}${c.host.village ? ` · ${c.host.village}` : ''}`}
            </Text>
          </View>
          <Icon name="chevron" size={22} color={colors.muted} />
        </PressableScale>
      ))}
    </View>
  );
}

export default function Home() {
  const { loading, error, receivedPaise, givenPaise, setupDone, signinPrompted, onboardingSeen } = useLedgerTotals();
  const ledger = useActiveLedger();
  const { data: family } = useLoad(async (db) => (await getMyHousehold(db))?.headName ?? '', '');
  const show = (p: number) => (loading ? '…' : formatINR(p));
  const greeting = family ? `राम राम, ${family} परिवार` : 'राम राम';
  const [month, setMonth] = useState(() => ({ y: Number(todayIso().slice(0, 4)), m: Number(todayIso().slice(5, 7)) }));
  const [day, setDay] = useState(todayIso());
  const programs = useMonthPrograms(month);
  const onMonth = useCallback((y: number, m: number) => setMonth((c) => (c.y === y && c.m === m ? c : { y, m })), []);
  const markers = useMemo(() => {
    const out: DayMarkers = {};
    for (const p of programs) (out[p.event.date] ??= []).push(p.event.occasion as Occasion);
    return out;
  }, [programs]);
  const dayItems = useMemo(() => programs.filter((p) => p.event.date === day), [programs, day]);

  useEffect(() => {
    if (loading || error) return;
    // First launch: picture cards, then the (skippable) sign-in so a new phone can restore its data, then setup.
    const next = firstRunRoute({ onboardingSeen, signinPrompted, setupDone });
    if (next) replace(next);
  }, [loading, error, setupDone, signinPrompted, onboardingSeen]);

  return (
    <View style={styles.page}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <ScrollView contentContainerStyle={styles.content}>
          <Toran />
          <View style={styles.body}>
            <View style={styles.top}>
              <Text style={[type.title, styles.greeting]} accessibilityRole="header">
                {greeting}
              </Text>
              <SpeakerButton text={HELP_HOME} />
              <PressableScale
                accessibilityRole="button"
                testID="btn-settings"
                accessibilityLabel="सेटिंग"
                accessibilityHint="बैकअप, ताला और जानकारी"
                onPress={() => go('/settings')}
                outerStyle={styles.gearOuter}
                style={styles.gear}
              >
                <Icon name="settings" size={30} color={colors.muted} />
              </PressableScale>
            </View>

            {ledger.id !== DEFAULT_LEDGER_ID ? (
              <BigButton icon="lock" label={`खाता: ${ledger.name}`} tone="plain" hint="दूसरा खाता खोलें" onPress={() => go('/ledgers')} />
            ) : null}

            <Card style={styles.summary}>
              <SummaryRow tone="received" word="कुल मिला" paired="(आया)" amount={show(receivedPaise)} />
              <View style={styles.divider} />
              <SummaryRow tone="given" word="कुल दिया" paired="(गया)" amount={show(givenPaise)} />
            </Card>

            <SectionTitle icon="calendar">कैलेंडर</SectionTitle>
            <Calendar value={day} onSelect={setDay} markers={markers} onMonthChange={onMonth} />
            <DayPrograms day={day} items={dayItems} />

            <BigButton testID="btn-families" icon="families" label="परिवार" tone="plain" hint="सब परिवारों की सूची और खोज" onPress={() => go('/households')} />
            {error ? (
              <Card tint="given">
                <Text style={[type.bodyBold, { color: colors.given }]}>डेटा नहीं खुल पाया। ऐप दोबारा खोलें।</Text>
              </Card>
            ) : null}
          </View>
        </ScrollView>
        <BottomBar>
          <BigButton testID="btn-old" tone="primary" icon="doc" label="पुराना हिसाब जोड़ें" hint="पुरानी डायरी का हिसाब पिछली तारीख से लिखें" onPress={() => go('/old')} />
        </BottomBar>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.paper },
  safe: { flex: 1 },
  content: { paddingBottom: spacing.lg },
  body: { paddingHorizontal: GUTTER, gap: spacing.md, paddingTop: spacing.sm },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  greeting: { flex: 1, color: colors.ink },
  gearOuter: { width: MIN_TOUCH, height: MIN_TOUCH },
  gear: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.button,
    borderWidth: BORDER,
    borderColor: colors.hairline,
    backgroundColor: colors.card,
  },
  summary: { paddingVertical: spacing.sm, gap: 0 },
  sumRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: MIN_TOUCH + spacing.sm },
  sumDisc: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  sumWords: { flexShrink: 0 },
  sumAmount: { flex: 1, textAlign: 'right' },
  muted: { color: colors.muted },
  ink: { color: colors.ink },
  flex: { flex: 1 },
  divider: { height: BORDER, backgroundColor: colors.hairline },
  dayList: { gap: spacing.sm },
  dayRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: MIN_TOUCH + spacing.sm, paddingHorizontal: spacing.md,
    backgroundColor: colors.card, borderWidth: BORDER, borderColor: colors.hairline, borderRadius: radius.card,
  },
});
