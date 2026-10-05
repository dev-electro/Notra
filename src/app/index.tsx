import React, { useEffect } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BigButton } from '@/components/big-button';
import { Card } from '@/components/card';
import { HomeTile } from '@/components/home-tile';
import { Icon } from '@/components/icons';
import { Toran } from '@/components/motifs';
import { PressableScale } from '@/components/pressable-scale';
import { SpeakerButton } from '@/components/speaker-button';
import { Text } from '@/components/text';
import { DEFAULT_LEDGER_ID, firstRunRoute, formatINR } from '@/core';
import { getMyHousehold } from '@/db';
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

export default function Home() {
  const { loading, error, receivedPaise, givenPaise, setupDone, signinPrompted, onboardingSeen } = useLedgerTotals();
  const ledger = useActiveLedger();
  const { data: family } = useLoad(async (db) => (await getMyHousehold(db))?.headName ?? '', '');
  const show = (p: number) => (loading ? '…' : formatINR(p));
  const greeting = family ? `राम राम, ${family} परिवार` : 'राम राम';

  useEffect(() => {
    if (loading || error) return;
    // First launch: picture cards, then the (skippable) sign-in so a new phone can restore its data, then setup.
    const next = firstRunRoute({ onboardingSeen, signinPrompted, setupDone });
    if (next) replace(next);
  }, [loading, error, setupDone, signinPrompted, onboardingSeen]);

  return (
    <View style={styles.page}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
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

            <View style={styles.grid}>
              <HomeTile icon="write" tone="haldi" word="नोतरा लिखें" sub="मिला या दिया" onPress={() => go('/entry/new')} />
              <HomeTile icon="events" tone="given" word="कार्यक्रम" sub="अपने कार्यक्रम" onPress={() => go('/events')} />
              <HomeTile icon="families" tone="received" word="परिवार" sub="सबके नाम" onPress={() => go('/households')} />
              <HomeTile icon="hisaab" tone="success" word="हिसाब" sub="पूरा हिसाब" onPress={() => go('/reports')} />
            </View>
            {error ? (
              <Card tint="given">
                <Text style={[type.bodyBold, { color: colors.given }]}>डेटा नहीं खुल पाया। ऐप दोबारा खोलें।</Text>
              </Card>
            ) : null}
          </View>
        </ScrollView>
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
  divider: { height: BORDER, backgroundColor: colors.hairline },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
});
