import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Animated, Easing, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BigButton } from '@/components/big-button';
import { NoticeBanners } from '@/components/notice-banners';
import { Calendar, type DayMarkers } from '@/components/calendar';
import { Card, SectionTitle, SoonBadge } from '@/components/card';
import { Icon } from '@/components/icons';
import { OccasionBadge } from '@/components/occasion';
import { DotBorder, Toran } from '@/components/motifs';
import { PressableScale } from '@/components/pressable-scale';
import { SpeakerButton } from '@/components/speaker-button';
import { Text } from '@/components/text';
import { BottomBar } from '@/components/screen';
import { DEFAULT_LEDGER_ID, firstRunRoute, formatINR, LEGACY_EVENT_LABEL, longDateHi, monthRange, occasionName, todayIso, type Occasion } from '@/core';
import { getMyHousehold, getMyHouseholdId, sqlEventCards, type EventCard } from '@/db';
import { isReduceMotion } from '@/hooks/use-reduce-motion';
import { useActiveLedger } from '@/hooks/use-active-ledger';
import { useLedgerTotals } from '@/hooks/use-ledger-totals';
import { useLoad } from '@/hooks/use-load';
import { MODULES } from '@/modules/registry';
import { go, replace } from '@/nav';
import { HELP_HOME } from '@/onboarding/help';
import { BORDER, colors, GUTTER, MIN_TOUCH, radius, spacing, type } from '@/theme';

interface TileProps {
  tone: 'received' | 'given';
  word: string;
  paired: string;
  /** Spoken label (the app's older words, kept for screen readers and tests). */
  spoken: string;
  amount: string;
}

/** Big summary tile: arrow in a disc, the word, the amount. Arrow + word + colour + left bar, never colour alone. */
function SummaryTile({ tone, word, paired, spoken, amount }: TileProps) {
  const received = tone === 'received';
  const ink = received ? colors.received : colors.given;
  return (
    <Card tint={tone} accent={tone} style={styles.sumTile} accessible accessibilityLabel={`${spoken}, ${amount}`}>
      <View style={styles.sumHead}>
        <View style={styles.sumDisc}>
          <Icon name={received ? 'arrowDown' : 'arrowUp'} size={28} color={ink} strokeWidth={2.5} />
        </View>
        <View style={styles.flex}>
          <Text style={[type.heading, { color: ink }]} numberOfLines={1}>{word}</Text>
          <Text style={[type.caption, styles.muted]} numberOfLines={1}>{paired}</Text>
        </View>
      </View>
      <Text style={[type.amount, { color: ink }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
        {amount}
      </Text>
    </Card>
  );
}

/** Cheap one-shot fade + 12dp slide-up (native driver); off with "remove animations". */
function FadeIn({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const [v] = useState(() => new Animated.Value(isReduceMotion() ? 1 : 0));
  useEffect(() => {
    if (isReduceMotion()) return;
    Animated.timing(v, { toValue: 1, duration: 280, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [v, delay]);
  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [spacing.sm + spacing.xs, 0] });
  return <Animated.View style={{ opacity: v, transform: [{ translateY }] }}>{children}</Animated.View>;
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

/** The next few programs from today on (mine and others'), soonest first. */
function useUpcoming() {
  const { data } = useLoad(
    async (db, ledgerId) => {
      const from = todayIso();
      const me = await getMyHouseholdId(db);
      const [mine, theirs] = await Promise.all([
        sqlEventCards(db, ledgerId, me, { mine: true, from, limit: 5 }),
        sqlEventCards(db, ledgerId, me, { mine: false, from, limit: 5 }),
      ]);
      return [...mine.map((c) => ({ ...c, mine: true })), ...theirs.map((c) => ({ ...c, mine: false }))]
        .sort((x, y) => x.event.date.localeCompare(y.event.date))
        .slice(0, 5) as MonthProgram[];
    },
    [] as MonthProgram[],
    todayIso(),
  );
  return data;
}

/** "आने वाले नोतरे": a sideways strip of the next programs. Hidden when there are none. */
function UpcomingStrip({ items }: { items: MonthProgram[] }) {
  if (items.length === 0) return null;
  return (
    <View style={styles.upWrap}>
      <SectionTitle icon="events">आने वाले नोतरे</SectionTitle>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.upRow} style={styles.upScroll}>
        {items.map((c) => {
          const name = c.event.legacy ? LEGACY_EVENT_LABEL : occasionName(c.event.occasion, c.event.occasionLabel);
          return (
            <PressableScale
              key={c.event.id}
              testID={`upcoming-${c.event.id}`}
              accessibilityRole="button"
              accessibilityLabel={`${name}, ${c.mine ? 'मेरा नोतरा' : c.host.headName}, ${longDateHi(c.event.date)}`}
              accessibilityHint="नोतरे की जानकारी खोलें"
              onPress={() => go(`/events/${c.event.id}`)}
              style={styles.upCard}
            >
              <OccasionBadge occasion={c.event.occasion as Occasion} size={48} />
              <Text style={[type.bodyBold, styles.ink]} numberOfLines={1}>{name}</Text>
              <Text style={[type.caption, styles.muted]} numberOfLines={1}>{c.mine ? 'मेरा नोतरा' : c.host.headName}</Text>
              <Text style={[type.captionBold, { color: c.mine ? colors.received : colors.given }]} numberOfLines={1}>{longDateHi(c.event.date)}</Text>
            </PressableScale>
          );
        })}
      </ScrollView>
    </View>
  );
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

/** "सेवाएँ": small tiles for every module. Notra opens the ledger; the rest open the shared "coming soon" page. */
function Services() {
  return (
    <View style={styles.grid}>
      {MODULES.map((m) => (
        <PressableScale
          key={m.id}
          testID={`tile-${m.id}`}
          accessibilityRole="button"
          accessibilityLabel={m.status === 'soon' ? `${m.title}, जल्द आ रहा है` : m.title}
          onPress={() => go(m.route)}
          outerStyle={styles.tileOuter}
          style={[styles.tile, m.status === 'live' && styles.tileLive]}
        >
          <View style={styles.tileDisc}>
            <Icon name={m.icon} size={32} color={colors.received} />
          </View>
          <Text style={[type.captionBold, styles.ink, styles.tileLabel]} numberOfLines={2}>{m.title}</Text>
          {m.status === 'soon' ? <SoonBadge /> : null}
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
  const upcoming = useUpcoming();
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
            <View style={styles.band}>
              <View style={styles.top}>
                <View style={styles.flex}>
                  <Text style={[type.title, styles.greeting]} accessibilityRole="header">
                    {greeting}
                  </Text>
                  <Text style={[type.caption, styles.muted]}>{longDateHi(todayIso())}</Text>
                </View>
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
              <DotBorder />
            </View>

            <NoticeBanners scope="home" />

            {ledger.id !== DEFAULT_LEDGER_ID ? (
              <BigButton icon="lock" label={`खाता: ${ledger.name}`} tone="plain" hint="दूसरा खाता खोलें" onPress={() => go('/ledgers')} />
            ) : null}

            <FadeIn>
              <View style={styles.sumRow}>
                <SummaryTile tone="received" word="कुल आया" paired="(मिला)" spoken="कुल मिला" amount={show(receivedPaise)} />
                <SummaryTile tone="given" word="कुल गया" paired="(दिया)" spoken="कुल दिया" amount={show(givenPaise)} />
              </View>
            </FadeIn>

            <FadeIn delay={80}>
              <UpcomingStrip items={upcoming} />
            </FadeIn>

            <SectionTitle icon="star">सेवाएँ</SectionTitle>
            <Services />

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
  band: { backgroundColor: colors.haldiTint, borderWidth: BORDER, borderColor: colors.hairline, borderRadius: radius.card, overflow: 'hidden' },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, paddingBottom: spacing.sm },
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
  sumRow: { flexDirection: 'row', gap: spacing.sm },
  sumTile: { flex: 1, gap: spacing.sm, paddingLeft: spacing.md + spacing.xs },
  sumHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sumDisc: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
  upWrap: { gap: spacing.sm },
  upScroll: { marginHorizontal: -GUTTER },
  upRow: { paddingHorizontal: GUTTER, gap: spacing.sm },
  upCard: {
    width: 176, gap: spacing.xs, padding: spacing.md, backgroundColor: colors.card, borderWidth: BORDER, borderColor: colors.hairline, borderRadius: radius.card,
  },
  muted: { color: colors.muted },
  ink: { color: colors.ink },
  flex: { flex: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tileOuter: { width: '31%', flexGrow: 1 },
  tile: {
    minHeight: 112, alignItems: 'center', justifyContent: 'center', gap: spacing.xs, padding: spacing.sm,
    backgroundColor: colors.card, borderWidth: BORDER, borderColor: colors.hairline, borderRadius: radius.card,
  },
  tileLive: { backgroundColor: colors.haldiTint },
  tileDisc: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.receivedTint },
  tileLabel: { textAlign: 'center' },
  dayList: { gap: spacing.sm },
  dayRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: MIN_TOUCH + spacing.sm, paddingHorizontal: spacing.md,
    backgroundColor: colors.card, borderWidth: BORDER, borderColor: colors.hairline, borderRadius: radius.card,
  },
});
