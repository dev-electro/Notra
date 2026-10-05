import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AmountDisplay } from '@/components/amount-display';
import { BigButton } from '@/components/big-button';
import { Card } from '@/components/card';
import { DIRECTION_INK } from '@/components/direction';
import { EventHeader } from '@/components/event-header';
import { HouseholdPicker } from '@/components/household-picker';
import { Icon } from '@/components/icons';
import { NumberPad } from '@/components/number-pad';
import { SaveCheck } from '@/components/save-check';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import {
  formatINR, displayDate, entryDateFor, occasionName, readBackWithSettlement, SHAGUN_QUICK_RUPEES, STATUS_LABEL, utarChadhavText,
  type Household, type NotraEvent,
} from '@/core';
import {
  addEntry, getDb, getEvent, getHousehold, getMyHouseholdId, lastActiveEntryForEvent, listEntriesForEvent, listHouseholds, setEventStatus,
  sqlEntrySettlement, sqlEventTotals, voidEntry, type Db, type EventTotals,
} from '@/db';
import { useActiveLedgerId } from '@/hooks/use-active-ledger';
import { replace } from '@/nav';
import { HELP_EVENT_LEDGER } from '@/onboarding/help';
import { shareEventLedger } from '@/services/export';
import { guarded } from '@/services/guard';
import { tapLight } from '@/services/haptics';
import { speak } from '@/services/speech';
import { colors, spacing, type } from '@/theme';
import { track } from '@/analytics';

type Step = 'pick' | 'amount' | 'summary';
const EMPTY: EventTotals = { cashPaise: 0, inKindValuePaise: 0, totalPaise: 0, giverCount: 0, entryCount: 0 };
const getDbTyped = async () => (await getDb()) as unknown as Db;
const FLASH_MS = 2500;

/**
 * Event ledger (खाता) of MY program: the host records who came and what they gave (only receiving happens here). <=3 taps per giver (family -> shagun amount -> save). Every entry is written to SQLite the moment
 * it is saved, so an app kill loses nothing. "आखिरी हटाएँ" appends a void entry (append-only). "पूरा करें" only marks the
 * event HELD and shows the summary; running totals come from an indexed SQL query on the event.
 */
export default function EventLedger() {
  const { id: eventId, pad: padParam } = useLocalSearchParams<{ id: string; pad?: string }>();
  const ledgerId = useActiveLedgerId();
  const [step, setStep] = useState<Step>('pick');
  const [event, setEvent] = useState<NotraEvent | null>(null);
  const [who, setWho] = useState<Household | null>(null);
  const [digits, setDigits] = useState('');
  const [pad, setPad] = useState(padParam === '1');
  const [totals, setTotals] = useState<EventTotals>(EMPTY);
  const [last, setLast] = useState<{ id: string; name: string; paise: number } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    [],
  );

  const refresh = useCallback(async () => {
    const db = await getDbTyped();
    setTotals(await sqlEventTotals(db, eventId));
    const e = await lastActiveEntryForEvent(db, eventId);
    const h = e ? await getHousehold(db, e.otherHouseholdId) : null;
    setLast(e ? { id: e.id, name: h?.headName ?? '', paise: e.cashPaise + e.inKindValuePaise } : null);
  }, [eventId]);

  useEffect(() => {
    (async () => {
      setEvent(await getEvent(await getDbTyped(), eventId));
      await refresh(); // resumes after an app kill: earlier entries are already in the database
    })();
  }, [eventId, refresh]);

  const onPick = useCallback((h: Household, amt?: number) => {
    setWho(h);
    setDigits(amt ? String(amt) : '');
    setStep('amount');
  }, []);

  const cash = Number(digits || 0) * 100;
  const add = async () => {
    if (!who || cash <= 0 || busy) return;
    setBusy(true);
    try {
      const e = await guarded(async () => {
        const db = await getDbTyped();
        const entry = await addEntry(db, {
          eventId, ledgerId, otherHouseholdId: who.id, direction: 'AAYA', cashPaise: cash, inKindValuePaise: 0,
          paymentMode: 'CASH', recordedBy: (await getMyHouseholdId(db)) ?? 'self',
          occurredOn: event ? entryDateFor(event.date) : undefined,
        });
        return { entry, settle: await sqlEntrySettlement(db, entry.id) };
      });
      if (!e) return; // a toast told the person; the amount stays on screen so they can press save again
      track('entry_saved', { side: 'mine_receive', has_in_kind: false, payment_mode: 'CASH' });
      tapLight();
      speak(readBackWithSettlement(e.entry, who, e.settle.utarPaise, e.settle.chadhavPaise));
      setFlash(`${who.headName} · ${formatINR(cash)}${utarChadhavText(e.settle.utarPaise, e.settle.chadhavPaise) ? ` — ${utarChadhavText(e.settle.utarPaise, e.settle.chadhavPaise)}` : ''}`);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlash(null), FLASH_MS);
      setWho(null);
      setDigits('');
      setStep('pick');
      await refresh();
    } finally {
      setBusy(false);
    }
  };
  const undo = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await guarded(async () => {
        const db = await getDbTyped();
        const e = await lastActiveEntryForEvent(db, eventId);
        if (e) {
          await voidEntry(db, e);
          track('entry_voided');
          speak('आखिरी एंट्री हटा दी');
        }
      });
      setFlash(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const ok = await guarded(async () => {
        const db = await getDbTyped();
        if (event?.status === 'PLANNED') await setEventStatus(db, eventId, 'HELD');
        return true;
      });
      await refresh();
      if (ok) setStep('summary');
    } finally {
      setBusy(false);
    }
  };

  const exportPdf = async () => {
    if (!event) return;
    const db = await getDbTyped();
    await shareEventLedger(event, (await getHousehold(db, event.hostHouseholdId)) ?? undefined, await listEntriesForEvent(db, eventId), await listHouseholds(db));
  };

  const title = event ? `${occasionName(event.occasion, event.occasionLabel)} का खाता` : 'नोतरा खाता';

  if (step === 'summary') {
    return (
      <Screen title="हो गया" noBack action={{ testID: 'btn-open-event', icon: 'events', label: 'नोतरा देखें', onPress: () => replace(`/events/${eventId}`) }}>
        <SaveCheck />
        <View style={styles.center}>
          <Text style={[type.heading, styles.muted]}>कुल रकम</Text>
          <Text style={[type.amountXL, styles.total]} adjustsFontSizeToFit numberOfLines={1}>
            {formatINR(totals.totalPaise)}
          </Text>
          <Text style={[type.heading, styles.ink]}>{totals.giverCount} परिवार</Text>
        </View>
        <BigButton testID="btn-more" icon="plus" label="और लोग लिखें" tone="plain" onPress={() => setStep('pick')} />
        <BigButton icon="share" label="बही भेजें" tone="plain" onPress={exportPdf} />
        <BigButton label="होम" tone="plain" onPress={() => replace('/')} />
      </Screen>
    );
  }

  const header = event ? (
    <EventHeader
      occasion={event.occasion}
      status={STATUS_LABEL[event.status]}
      subtitle={displayDate(event.date)}
      label={event.occasionLabel}
      totalPaise={totals.totalPaise}
      giverCount={totals.giverCount}
      compact={step === 'amount'}
    />
  ) : null;

  if (step === 'pick') {
    const top = (
      <View style={styles.top}>
        {header}
        {flash ? (
          <Card tint="success" style={styles.flash} accessibilityLiveRegion="polite">
            <View style={styles.flashDisc}>
              <Icon name="check" size={24} color={colors.onSolid} strokeWidth={3} />
            </View>
            <Text style={[type.bodyBold, styles.flashText]} numberOfLines={2}>
              लिख लिया: {flash}
            </Text>
          </Card>
        ) : null}
        {last ? (
          <Card style={styles.lastRow}>
            <Text style={[type.body, styles.last]} numberOfLines={2}>
              आखिरी: {last.name} · {formatINR(last.paise)}
            </Text>
            <BigButton testID="btn-undo" compact icon="undo" label="आखिरी हटाएँ" tone="plain" onPress={undo} disabled={busy} hint="आखिरी लिखी एंट्री हटाता है" />
          </Card>
        ) : null}
        {totals.entryCount > 0 ? <BigButton testID="btn-finish" icon="check" label="पूरा करें" onPress={finish} disabled={busy} hint="कार्यक्रम का खाता पूरा करके कुल देखें" /> : null}
      </View>
    );
    return (
      <Screen title={title} scroll={false} speakText={HELP_EVENT_LEDGER}>
        <HouseholdPicker onPick={onPick} top={top} headline="कौन आया?" />
      </Screen>
    );
  }

  return (
    <Screen
      title={title}
      speakText={HELP_EVENT_LEDGER}
      action={{ testID: 'btn-next', icon: 'check', label: 'सेव और अगला', onPress: add, disabled: cash <= 0 || busy }}
    >
      {header}
      {who ? (
        <Card>
          <Text style={[type.heading, styles.ink]}>{who.headName}</Text>
          <Text style={[type.caption, styles.muted]}>{[who.fatherName && `${who.fatherName} का`, who.village].filter(Boolean).join(' · ')}</Text>
        </Card>
      ) : null}
      <AmountDisplay rupees={Number(digits || 0)} color={DIRECTION_INK.AAYA} />
      <View style={styles.row}>
        {SHAGUN_QUICK_RUPEES.map((r) => (
          <BigButton key={r} testID={`chip-${r}`} compact label={formatINR(r * 100)} selected={digits === String(r)} onPress={() => setDigits(String(r))} />
        ))}
        <BigButton testID="chip-other" compact label="दूसरी रकम" selected={pad} onPress={() => setPad(!pad)} />
      </View>
      {pad ? <NumberPad value={digits} onChange={setDigits} /> : null}
      <BigButton testID="btn-change-family" label="दूसरा परिवार चुनें" tone="plain" onPress={() => setStep('pick')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { gap: spacing.md },
  center: { alignItems: 'center', gap: spacing.xs },
  total: { color: colors.received },
  ink: { color: colors.ink },
  muted: { color: colors.muted },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  flash: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flashDisc: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center' },
  flashText: { flex: 1, color: colors.successInk },
  lastRow: { gap: spacing.sm },
  last: { color: colors.ink },
});
