import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BigButton } from '@/components/big-button';
import type { IconName } from '@/components/icons';
import { NoticeBanners } from '@/components/notice-banners';
import { Calendar, type DayMarkers } from '@/components/calendar';
import { Card, SectionTitle } from '@/components/card';
import { Icon } from '@/components/icons';
import { OccasionBadge } from '@/components/occasion';
import { PressableScale } from '@/components/pressable-scale';
import { Text } from '@/components/text';
import { DEFAULT_LEDGER_ID, firstRunRoute, formatINR, LEGACY_EVENT_LABEL, longDateHi, monthRange, occasionName, todayIso, type Occasion } from '@/core';
import { getMyHousehold, getMyHouseholdId, sqlEventCards, type EventCard } from '@/db';
import { FEATURES } from '@/features';
import { touchToday } from '@/features/rewards/store';
import { useActiveLedger } from '@/hooks/use-active-ledger';
import { useLedgerTotals } from '@/hooks/use-ledger-totals';
import { useLoad } from '@/hooks/use-load';
import { go, replace } from '@/nav';
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

function QuickAction({ id, icon, label, hint, onPress }: { id: string; icon: IconName; label: string; hint: string; onPress: () => void }) {
  return (
    <PressableScale testID={id} accessibilityRole="button" accessibilityLabel={label} accessibilityHint={hint} onPress={onPress} outerStyle={styles.qaOuter} style={styles.qa}>
      <Icon name={icon} size={28} color={colors.received} />
      <Text style={[type.captionBold, styles.qaText]} numberOfLines={2} importantForAccessibility="no">
        {label}
      </Text>
    </PressableScale>
  );
}

function DiscoverCard({ id, icon, title, sub, onPress }: { id: string; icon: IconName; title: string; sub: string; onPress: () => void }) {
  return (
    <PressableScale testID={id} accessibilityRole="button" accessibilityLabel={`${title}, ${sub}`} onPress={onPress} outerStyle={styles.qaOuter} style={styles.discover}>
      <Icon name={icon} size={28} color={colors.muted} />
      <Text style={[type.bodyBold, styles.ink]} numberOfLines={1} importantForAccessibility="no">
        {title}
      </Text>
      <Text style={[type.caption, styles.muted]} numberOfLines={2} importantForAccessibility="no">
        {sub}
      </Text>
    </PressableScale>
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
    else void touchToday(); // daily-use streak for इनाम (on the phone only)
  }, [loading, error, setupDone, signinPrompted, onboardingSeen]);

  return (
    <View style={styles.page}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.top}>
            <View style={styles.flex}>
              <Text style={[type.title, styles.ink]} numberOfLines={2} accessibilityRole="header">
                {greeting}
              </Text>
              <Text style={[type.caption, styles.muted]}>{longDateHi(todayIso())}</Text>
            </View>
            <PressableScale
              accessibilityRole="button"
              testID="btn-settings"
              accessibilityLabel="सेटिंग"
              accessibilityHint="बैकअप, ताला और जानकारी"
              onPress={() => go('/settings')}
              outerStyle={styles.gearOuter}
              style={styles.gear}
            >
              <Icon name="settings" size={28} color={colors.muted} />
            </PressableScale>
          </View>

          <NoticeBanners scope="home" />

          {ledger.id !== DEFAULT_LEDGER_ID ? (
            <BigButton icon="lock" label={`खाता: ${ledger.name}`} tone="plain" hint="दूसरा खाता खोलें" onPress={() => go('/ledgers')} />
          ) : null}

          <Card style={styles.summary}>
            <SummaryRow tone="received" word="कुल मिला" paired="(आया)" amount={show(receivedPaise)} />
            <View style={styles.divider} />
            <SummaryRow tone="given" word="कुल दिया" paired="(गया)" amount={show(givenPaise)} />
          </Card>

          <View style={styles.row}>
            <QuickAction id="qa-new" icon="write" label="नया नोतरा लिखें" hint="अपना नया नोतरा बनाएँ" onPress={() => go('/events/new')} />
            <QuickAction id="qa-give" icon="moneyOut" label="दूसरों में दें" hint="किसी और के नोतरे में जो दिया वह लिखें" onPress={() => go('/others/new')} />
            <QuickAction id="qa-report" icon="doc" label="रिपोर्ट" hint="हिसाब और रिपोर्ट खोलें" onPress={() => go('/notra?seg=hisab')} />
          </View>

          <View style={styles.block}>
            <SectionTitle icon="calendar">कैलेंडर</SectionTitle>
            <Calendar value={day} onSelect={setDay} markers={markers} onMonthChange={onMonth} />
            <DayPrograms day={day} items={dayItems} />
          </View>

          <PressableScale testID="btn-families" accessibilityRole="button" accessibilityLabel="परिवार" accessibilityHint="सब परिवारों की सूची और खोज" onPress={() => go('/households')} style={styles.link}>
            <Icon name="families" size={28} color={colors.received} />
            <Text style={[type.bodyBold, styles.flex, { color: colors.received }]} importantForAccessibility="no">
              परिवार
            </Text>
            <Icon name="chevron" size={22} color={colors.muted} />
          </PressableScale>

          <View style={styles.row}>
            {FEATURES.rishte ? <DiscoverCard id="discover-rishte" icon="rings" title="रिश्ते" sub="अपना बायोडाटा बनाएँ" onPress={() => go('/rishte')} /> : null}
            <DiscoverCard id="discover-inaam" icon="trophy" title="इनाम" sub="अंक और उपलब्धियाँ" onPress={() => go('/inaam')} />
          </View>

          {error ? (
            <Card tint="given">
              <Text style={[type.bodyBold, { color: colors.given }]}>डेटा नहीं खुल पाया। ऐप दोबारा खोलें।</Text>
            </Card>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.paper },
  safe: { flex: 1 },
  content: { paddingHorizontal: GUTTER, paddingTop: spacing.md, paddingBottom: spacing.lg, gap: spacing.lg },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  gearOuter: { width: MIN_TOUCH, height: MIN_TOUCH },
  gear: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: BORDER,
    borderColor: colors.hairline,
    backgroundColor: colors.card,
  },
  summary: { paddingVertical: spacing.sm, gap: 0 },
  sumRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: MIN_TOUCH + spacing.sm },
  sumDisc: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  sumWords: { flexShrink: 0 },
  sumAmount: { flex: 1, textAlign: 'right' },
  row: { flexDirection: 'row', gap: spacing.sm },
  qaOuter: { flex: 1 },
  qa: {
    minHeight: 96, alignItems: 'center', justifyContent: 'center', gap: spacing.xs, padding: spacing.sm,
    backgroundColor: colors.card, borderWidth: BORDER, borderColor: colors.hairline, borderRadius: radius.card,
  },
  qaText: { color: colors.ink, textAlign: 'center' },
  discover: {
    minHeight: 112, gap: spacing.xs, padding: spacing.md,
    backgroundColor: colors.card, borderWidth: BORDER, borderColor: colors.hairline, borderRadius: radius.card,
  },
  link: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: MIN_TOUCH, paddingHorizontal: spacing.md,
    backgroundColor: colors.card, borderWidth: BORDER, borderColor: colors.hairline, borderRadius: radius.card,
  },
  block: { gap: spacing.sm },
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
