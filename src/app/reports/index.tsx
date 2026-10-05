import React, { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, View } from 'react-native';
import { BigButton } from '@/components/big-button';
import { Card } from '@/components/card';
import { DirectionTag } from '@/components/direction';
import { EmptyState } from '@/components/empty-state';
import { HOUSEHOLD_ROW_HEIGHT, HouseholdRow } from '@/components/household-row';
import { Icon } from '@/components/icons';
import { OccasionBadge } from '@/components/occasion';
import { PressableScale } from '@/components/pressable-scale';
import { listContent, Screen } from '@/components/screen';
import { Text } from '@/components/text';
import {
  displayDate, formatINR, MONTHS_HI, notraCalendar, OCCASION_LABEL,
  pendingFromBalances, personRowsFromBalances, type Household, type NotraEvent, type SelfLedgerRow,
} from '@/core';
import {
  getIncrement, listEvents, listHouseholds, sqlBalances, sqlOccasionWise, sqlSelfLedgerPage, sqlTotals,
} from '@/db';
import { useLoad } from '@/hooks/use-load';
import { go } from '@/nav';
import { BORDER, colors, radius, spacing, type } from '@/theme';

type Tab = 'person' | 'pending' | 'occasion' | 'self' | 'calendar';
const MAIN_TABS: { key: Tab; label: string }[] = [
  { key: 'person', label: 'किसका कितना' },
  { key: 'pending', label: 'लौटाना बाकी' },
];
const MORE_TABS: { key: Tab; label: string }[] = [
  { key: 'occasion', label: 'अवसर' },
  { key: 'self', label: 'मेरा खाता' },
  { key: 'calendar', label: 'कैलेंडर' },
];

interface HeaderProps {
  tab: Tab;
  setTab: (t: Tab) => void;
}

/** The two big totals (tap for the full lists) and the tab chips. Lives at the top of whichever list is showing, so it scrolls away. */
function Header({ tab, setTab }: HeaderProps) {
  const { data: t } = useLoad((db, ledgerId) => sqlTotals(db, ledgerId), { receivedPaise: 0, givenPaise: 0 });
  return (
    <View style={styles.header}>
      <TotalRow aaya amount={formatINR(t.receivedPaise)} onPress={() => go('/ledger/aaya')} />
      <TotalRow aaya={false} amount={formatINR(t.givenPaise)} onPress={() => go('/ledger/gaya')} />
      <View style={styles.tabs}>
        {MAIN_TABS.map((x) => (
          <BigButton key={x.key} compact label={x.label} selected={tab === x.key} onPress={() => setTab(x.key)} />
        ))}
      </View>
      <View style={styles.tabs}>
        {MORE_TABS.map((x) => (
          <BigButton key={x.key} third label={x.label} selected={tab === x.key} onPress={() => setTab(x.key)} />
        ))}
      </View>
    </View>
  );
}

function TotalRow({ aaya, amount, onPress }: { aaya: boolean; amount: string; onPress: () => void }) {
  const ink = aaya ? colors.received : colors.given;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${aaya ? 'कुल मिला' : 'कुल दिया'}, ${amount}`}
      accessibilityHint={aaya ? 'मिले हुए नोतरा की पूरी सूची' : 'दिए हुए नोतरा की पूरी सूची'}
      onPress={onPress}
      style={[styles.total, { backgroundColor: aaya ? colors.receivedTint : colors.givenTint }]}
    >
      <DirectionTag direction={aaya ? 'AAYA' : 'GAYA'} paired iconSize={26} />
      <Text style={[type.amount, styles.totalAmount, { color: ink }]} numberOfLines={1} adjustsFontSizeToFit>
        {amount}
      </Text>
      <Icon name="chevron" size={22} color={ink} />
    </PressableScale>
  );
}

export default function Reports() {
  const [tab, setTab] = useState<Tab>('person');
  const header = <Header tab={tab} setTab={setTab} />;
  return (
    <Screen title="हिसाब" scroll={false}>
      {tab === 'person' ? <PeopleTab pending={false} header={header} /> : null}
      {tab === 'pending' ? <PeopleTab pending header={header} /> : null}
      {tab === 'occasion' ? <OccasionTab header={header} /> : null}
      {tab === 'self' ? <SelfTab header={header} /> : null}
      {tab === 'calendar' ? <CalendarTab header={header} /> : null}
    </Screen>
  );
}

// ---- person-wise and "कौन-कौन से लौटाना बाकी है" ----
interface PRow {
  household: Household;
  received: number;
  given: number;
  pending: number;
}
const keyP = (r: PRow) => r.household.id;
const layoutP = (_: unknown, index: number) => ({ length: HOUSEHOLD_ROW_HEIGHT, offset: HOUSEHOLD_ROW_HEIGHT * index, index });

function Amounts({ r, pending }: { r: PRow; pending: boolean }) {
  if (pending) {
    return (
      <View style={styles.amounts}>
        <DirectionTag direction="GAYA" iconSize={18} />
        <Text style={[type.captionBold, styles.amt, { color: colors.given }]}>{formatINR(r.pending)}</Text>
      </View>
    );
  }
  return (
    <View style={styles.amounts}>
      <View style={styles.amtRow}>
        <Icon name="arrowDown" size={18} color={colors.received} strokeWidth={2.5} />
        <Text style={[type.captionBold, styles.amt, { color: colors.received }]}>{formatINR(r.received)}</Text>
      </View>
      <View style={styles.amtRow}>
        <Icon name="arrowUp" size={18} color={colors.given} strokeWidth={2.5} />
        <Text style={[type.captionBold, styles.amt, { color: colors.given }]}>{formatINR(r.given)}</Text>
      </View>
    </View>
  );
}

function PeopleTab({ pending, header }: { pending: boolean; header: React.ReactElement }) {
  const { data, loading } = useLoad(
    async (db, ledgerId) => {
      const [bals, hs] = await Promise.all([sqlBalances(db, await getIncrement(db), ledgerId), listHouseholds(db)]);
      const rows: PRow[] = [];
      if (pending) {
        for (const r of pendingFromBalances(bals, hs)) {
          if (r.household) rows.push({ household: r.household, received: 0, given: 0, pending: r.pendingPaise });
        }
      } else {
        for (const r of personRowsFromBalances(bals, hs)) {
          if (r.household) rows.push({ household: r.household, received: r.totalReceived, given: r.totalGiven, pending: 0 });
        }
      }
      return rows;
    },
    [] as PRow[],
  );
  const open = useCallback((h: Household) => go(`/households/${h.id}`), []);
  const renderItem = useCallback(
    ({ item }: { item: PRow }) => (
      <HouseholdRow
        household={item.household}
        onPress={open}
        rightNode={<Amounts r={item} pending={pending} />}
        rightLabel={pending ? `लौटाना बाकी ${formatINR(item.pending)}` : `मिला ${formatINR(item.received)}, दिया ${formatINR(item.given)}`}
      />
    ),
    [open, pending],
  );
  return (
    <FlatList
      data={data}
      keyExtractor={keyP}
      renderItem={renderItem}
      getItemLayout={layoutP}
      ListHeaderComponent={
        <View style={styles.hintWrap}>
          {header}
          <Text style={[type.caption, styles.hint]}>{pending ? 'इनका नोतरा आया है, लौटाना बाकी है' : 'किसके साथ कितना मिला, कितना दिया'}</Text>
        </View>
      }
      ListEmptyComponent={loading ? null : <EmptyState icon="families" text={pending ? 'कुछ भी लौटाना बाकी नहीं' : 'अभी कुछ नहीं'} />}
      initialNumToRender={10}
      windowSize={5}
      maxToRenderPerBatch={10}
      removeClippedSubviews
      contentContainerStyle={listContent}
    />
  );
}

// ---- occasion-wise ----
function OccasionTab({ header }: { header: React.ReactElement }) {
  const { data, loading } = useLoad((db, ledgerId) => sqlOccasionWise(db, ledgerId), []);
  return (
    <ScrollView contentContainerStyle={[listContent, styles.gap]}>
      {header}
      {data.map((r) => (
        <Card key={r.occasion} style={styles.occasion}>
          <View style={styles.occHead}>
            <OccasionBadge occasion={r.occasion} size={48} />
            <Text style={[type.heading, styles.ink]}>{OCCASION_LABEL[r.occasion]}</Text>
          </View>
          <View style={styles.occLine}>
            <DirectionTag direction="AAYA" />
            <Text style={[type.money, { color: colors.received }]}>{formatINR(r.totalReceived)}</Text>
          </View>
          <View style={styles.occLine}>
            <DirectionTag direction="GAYA" />
            <Text style={[type.money, { color: colors.given }]}>{formatINR(r.totalGiven)}</Text>
          </View>
          <Text style={[type.caption, styles.hint]}>
            {r.eventCount} कार्यक्रम · {r.entryCount} एंट्री
          </Text>
        </Card>
      ))}
      {data.length === 0 && !loading ? <EmptyState icon="hisaab" text="अभी कुछ नहीं" /> : null}
    </ScrollView>
  );
}

// ---- self ledger (paged, newest first) ----
const SELF_GAP = spacing.sm;
const SELF_ROW = 104 + SELF_GAP;
const SELF_PAGE = 30;
const keyS = (r: SelfLedgerRow) => r.entry.id;
const layoutS = (_: unknown, index: number) => ({ length: SELF_ROW, offset: SELF_ROW * index, index });

function SelfTab({ header }: { header: React.ReactElement }) {
  const limit = useRef(SELF_PAGE);
  const { data, loading, reload } = useLoad(
    async (db, ledgerId) => {
      const [rows, hs] = await Promise.all([sqlSelfLedgerPage(db, ledgerId, limit.current), listHouseholds(db)]);
      return { rows, names: new Map(hs.map((h) => [h.id, h.headName])) };
    },
    { rows: [] as SelfLedgerRow[], names: new Map<string, string>() },
  );
  const renderItem = useCallback(
    ({ item: r }: { item: SelfLedgerRow }) => {
      const aaya = r.delta >= 0;
      const ink = aaya ? colors.received : colors.given;
      return (
        <View style={styles.selfCell}>
          <View style={styles.selfRow}>
            <View style={styles.flex}>
              <Text style={[type.bodyBold, styles.ink]} numberOfLines={1}>
                {data.names.get(r.entry.otherHouseholdId) ?? ''}
              </Text>
              <Text style={[type.caption, styles.hint]}>{displayDate(r.entry.createdAt)}</Text>
            </View>
            <View style={styles.right}>
              <View style={styles.amtRow}>
                <Icon name={aaya ? 'arrowDown' : 'arrowUp'} size={20} color={ink} strokeWidth={2.5} />
                <Text style={[type.money, { color: ink }]}>{formatINR(Math.abs(r.delta))}</Text>
              </View>
              <Text style={[type.caption, styles.hint]}>जोड़: {formatINR(r.runningBalance)}</Text>
            </View>
          </View>
        </View>
      );
    },
    [data.names],
  );
  const more = useCallback(() => {
    if (data.rows.length >= limit.current) {
      limit.current += SELF_PAGE;
      reload();
    }
  }, [data.rows.length, reload]);
  return (
    <FlatList
      data={data.rows}
      keyExtractor={keyS}
      renderItem={renderItem}
      getItemLayout={layoutS}
      ListHeaderComponent={
        <View style={styles.hintWrap}>
          {header}
          <Text style={[type.caption, styles.hint]}>नया ऊपर। जोड़ में अब तक का हिसाब।</Text>
        </View>
      }
      ListEmptyComponent={loading ? null : <EmptyState icon="hisaab" text="अभी कुछ नहीं" />}
      initialNumToRender={10}
      windowSize={5}
      maxToRenderPerBatch={10}
      removeClippedSubviews
      onEndReached={more}
      onEndReachedThreshold={0.5}
      contentContainerStyle={listContent}
    />
  );
}

// ---- yearly Notra calendar ----
function CalendarTab({ header }: { header: React.ReactElement }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const { data } = useLoad((db, ledgerId) => listEvents(db, ledgerId), [] as NotraEvent[]);
  const months = useMemo(() => notraCalendar(data, year), [data, year]);
  return (
    <ScrollView contentContainerStyle={[listContent, styles.gap]}>
      {header}
      <View style={styles.yearRow}>
        <BigButton compact icon="back" label="पिछला साल" onPress={() => setYear((y) => y - 1)} />
        <BigButton compact icon="chevron" label="अगला साल" onPress={() => setYear((y) => y + 1)} />
      </View>
      <Text style={[type.amount, styles.year]}>{year}</Text>
      {months.map((m) => (
        <Card key={m.month} style={styles.gapSm}>
          <Text style={[type.heading, styles.ink]}>{MONTHS_HI[m.month - 1]}</Text>
          {m.events.map((e) => (
            <PressableScale
              key={e.id}
              accessibilityRole="button"
              accessibilityLabel={`${e.date.slice(8, 10)} तारीख, ${OCCASION_LABEL[e.occasion]}`}
              accessibilityHint="कार्यक्रम खोलें"
              onPress={() => go(`/events/${e.id}`)}
              style={styles.calRow}
            >
              <OccasionBadge occasion={e.occasion} size={48} />
              <Text style={[type.bodyBold, styles.ink]}>
                {e.date.slice(8, 10)} · {OCCASION_LABEL[e.occasion]}
              </Text>
            </PressableScale>
          ))}
        </Card>
      ))}
      {months.length === 0 ? <EmptyState icon="calendar" text="इस साल कोई कार्यक्रम नहीं" /> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.sm, paddingBottom: spacing.sm },
  hintWrap: { gap: spacing.sm, paddingBottom: spacing.sm },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  total: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 72,
    paddingHorizontal: spacing.md,
    borderRadius: radius.card,
    borderWidth: BORDER,
    borderColor: colors.hairline,
  },
  totalAmount: { flex: 1, textAlign: 'right' },
  gap: { gap: spacing.sm },
  gapSm: { gap: spacing.sm },
  flex: { flex: 1 },
  ink: { color: colors.ink },
  hint: { color: colors.muted },
  amounts: { alignItems: 'flex-end' },
  amtRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  amt: {},
  occasion: { gap: spacing.sm },
  occHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  occLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  selfCell: { height: SELF_ROW, paddingBottom: SELF_GAP },
  selfRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.card,
    borderWidth: BORDER,
    borderColor: colors.hairline,
    borderRadius: radius.card,
  },
  right: { alignItems: 'flex-end' },
  yearRow: { flexDirection: 'row', gap: spacing.sm },
  year: { color: colors.received, textAlign: 'center' },
  calRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 64 },
});
