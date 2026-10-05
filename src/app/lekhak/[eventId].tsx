import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, BackHandler, StyleSheet, Text, View } from 'react-native';
import { BigButton } from '@/components/big-button';
import { HouseholdPicker } from '@/components/household-picker';
import { NumberPad } from '@/components/number-pad';
import { Screen } from '@/components/screen';
import {
  EventSession, formatINR, OCCASION_ICON, OCCASION_LABEL, readBack, SHAGUN_QUICK_RUPEES,
  type Household, type NotraEvent, type SessionTotals,
} from '@/core';
import { addEntry, getDb, getEvent, getHousehold, listEntriesForEvent, listHouseholds, setEventStatus, type Db } from '@/db';
import { back, replace } from '@/nav';
import { shareEventLedger } from '@/services/export';
import { speak } from '@/services/speech';
import { colors, spacing } from '@/theme';

type Step = 'pick' | 'amount' | 'summary';

/**
 * Lekhak mode: <=3 taps per giver (family -> shagun amount -> save). Entries live in an EventSession draft
 * until "पूरा करें", so the last one can be undone; finishing persists them all in one transaction.
 */
export default function Lekhak() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const [s] = useState(() => new EventSession(eventId, 'lekhak'));
  const [names] = useState(() => new Map<string, Household>());
  const [, bump] = useState(0);
  const [step, setStep] = useState<Step>('pick');
  const [event, setEvent] = useState<NotraEvent | null>(null);
  const [who, setWho] = useState<Household | null>(null);
  const [digits, setDigits] = useState('');
  const [pad, setPad] = useState(false);
  const [final, setFinal] = useState<SessionTotals | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => setEvent(await getEvent((await getDb()) as unknown as Db, eventId)))();
  }, [eventId]);

  const totals = s.totals();
  const unsaved = step !== 'summary' && totals.entryCount > 0;

  useEffect(() => {
    if (!unsaved) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      Alert.alert('अभी सेव नहीं हुआ', 'पहले "पूरा करें" दबाएँ, वरना यह एंट्रियाँ चली जाएँगी।', [
        { text: 'रुकें', style: 'cancel' },
        { text: 'छोड़ दें', style: 'destructive', onPress: back },
      ]);
      return true;
    });
    return () => sub.remove();
  }, [unsaved]);

  const onPick = useCallback((h: Household, amt?: number) => {
    setWho(h);
    setDigits(amt ? String(amt) : '');
    setPad(false);
    setStep('amount');
  }, []);

  const cash = Number(digits || 0) * 100;
  const add = () => {
    if (!who || cash <= 0) return;
    const e = s.add({ otherHouseholdId: who.id, cashPaise: cash });
    names.set(who.id, who);
    speak(readBack(e, who));
    setWho(null);
    setDigits('');
    setStep('pick');
    bump((n) => n + 1);
  };
  const undo = () => {
    const e = s.undo();
    if (e) speak('आखिरी एंट्री हटा दी');
    bump((n) => n + 1);
  };
  const last = s.entries[s.entries.length - 1];

  const finish = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const db = (await getDb()) as unknown as Db;
      await db.withTransactionAsync(async () => {
        for (const e of s.entries) await addEntry(db, e);
        if (event?.status === 'PLANNED') await setEventStatus(db, eventId, 'HELD');
      });
      setFinal(s.totals());
      setStep('summary');
    } finally {
      setBusy(false);
    }
  };

  const exportPdf = async () => {
    if (!event) return;
    const db = (await getDb()) as unknown as Db;
    await shareEventLedger(event, (await getHousehold(db, event.hostHouseholdId)) ?? undefined, await listEntriesForEvent(db, eventId), await listHouseholds(db));
  };

  const title = event ? `${OCCASION_ICON[event.occasion]} ${OCCASION_LABEL[event.occasion]}` : 'लेखक मोड';

  if (step === 'summary' && final) {
    return (
      <Screen title="हो गया" noBack>
        <Text style={styles.label}>कुल रकम</Text>
        <Text style={styles.huge}>{formatINR(final.totalPaise)}</Text>
        <Text style={styles.count}>{final.giverCount} परिवार</Text>
        <BigButton icon="📄" label="PDF बही भेजें" tone="red" onPress={exportPdf} />
        <BigButton icon="📋" label="कार्यक्रम देखें" onPress={() => replace(`/events/${eventId}`)} />
        <BigButton label="होम" tone="plain" onPress={() => replace('/')} />
      </Screen>
    );
  }

  const bar = (
    <View style={styles.bar}>
      <Text style={styles.huge} adjustsFontSizeToFit numberOfLines={1}>
        {formatINR(totals.totalPaise)}
      </Text>
      <Text style={styles.count}>{totals.giverCount} परिवार</Text>
      {last ? (
        <View style={styles.lastRow}>
          <Text style={styles.last} numberOfLines={1}>
            {names.get(last.otherHouseholdId)?.headName} · {formatINR(last.cashPaise)}
          </Text>
          <BigButton compact label="↩ वापस" tone="plain" onPress={undo} />
        </View>
      ) : null}
      {totals.entryCount > 0 ? <BigButton icon="✔" label="पूरा करें" onPress={finish} disabled={busy} /> : null}
    </View>
  );

  if (step === 'pick') {
    return (
      <Screen title={title} scroll={false}>
        {bar}
        <HouseholdPicker onPick={onPick} />
      </Screen>
    );
  }

  return (
    <Screen title={title}>
      {bar}
      {who ? (
        <Text style={styles.who}>
          {who.headName} · {[who.fatherName && `${who.fatherName} का`, who.village].filter(Boolean).join(' · ')}
        </Text>
      ) : null}
      <Text style={styles.amount}>{formatINR(cash)}</Text>
      <View style={styles.row}>
        {SHAGUN_QUICK_RUPEES.map((r) => (
          <BigButton key={r} compact label={formatINR(r * 100)} tone="plain" selected={digits === String(r)} onPress={() => setDigits(String(r))} />
        ))}
        <BigButton compact label="दूसरी रकम" tone="plain" selected={pad} onPress={() => setPad(!pad)} />
      </View>
      {pad ? <NumberPad value={digits} onChange={setDigits} /> : null}
      <BigButton icon="💾" label="सेव" onPress={add} disabled={cash <= 0} />
      <BigButton label="दूसरा परिवार चुनें" tone="plain" onPress={() => setStep('pick')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  bar: { gap: spacing.xs, paddingLeft: 44, paddingRight: spacing.md, paddingBottom: spacing.sm },
  huge: { fontSize: 64, lineHeight: 76, fontWeight: '700', color: colors.inkBlue },
  count: { fontSize: 26, fontWeight: '700', color: colors.textMuted },
  label: { fontSize: 22, color: colors.textMuted },
  lastRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  last: { flex: 1, fontSize: 20, color: colors.text },
  who: { fontSize: 26, lineHeight: 34, fontWeight: '700', color: colors.text },
  amount: { fontSize: 56, lineHeight: 68, fontWeight: '700', color: colors.inkBlue, textAlign: 'right' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
