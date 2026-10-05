import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AmountDisplay } from '@/components/amount-display';
import { Avatar } from '@/components/avatar';
import { BigButton } from '@/components/big-button';
import { Card, SectionTitle } from '@/components/card';
import { DatePickerField } from '@/components/calendar';
import { DIRECTION_INK } from '@/components/direction';
import { inputStyle } from '@/components/field';
import { HouseholdPicker } from '@/components/household-picker';
import { IN_KIND_ICON } from '@/components/icons';
import { NumberPad } from '@/components/number-pad';
import { SaveCheck } from '@/components/save-check';
import { Screen } from '@/components/screen';
import { Text, TextInput } from '@/components/text';
import {
  displayDate, directionForHost, entryDateFor, formatINR, IN_KIND_KINDS, isMyEvent, LEGACY_EVENT_LABEL, isLegacyEventId, occasionName,
  readBackWithSettlement, SHAGUN_QUICK_RUPEES, utarChadhavText,
  type Entry, type Household, type NotraEvent, type PaymentMode,
} from '@/core';
import {
  addEntry, correctEntry, getDb, getEntry, getEvent, getHousehold, getIncrement, getMyHouseholdId, sqlBalances, sqlEntrySettlement, type Db,
} from '@/db';
import { useActiveLedgerId } from '@/hooks/use-active-ledger';
import { back, replace } from '@/nav';
import { HELP_ENTRY } from '@/onboarding/help';
import { guarded } from '@/services/guard';
import { tapLight } from '@/services/haptics';
import { speak } from '@/services/speech';
import { colors, spacing, type } from '@/theme';

/**
 * ONE entry, always inside a program (?eventId=). The direction is never chosen: my program = "कौन आया" (received from the family
 * picked here), another family's program = "मैंने दिया" (given to its host). ?correctId= edits an earlier entry. Saving speaks the
 * read-back, including उतार/चढ़ाव, and asks "सही है?".
 */
export default function NewEntry() {
  const params = useLocalSearchParams<{ householdId?: string; correctId?: string; eventId?: string; old?: string }>();
  const ledgerId = useActiveLedgerId();
  const [event, setEvent] = useState<NotraEvent | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [household, setHousehold] = useState<Household | null>(null);
  const [digits, setDigits] = useState('');
  const [kind, setKind] = useState<string | null>(null);
  const [kindText, setKindText] = useState('');
  const [kindValue, setKindValue] = useState('');
  const [mode, setMode] = useState<PaymentMode>('CASH');
  const [date, setDate] = useState<string | null>(null);
  const [suggested, setSuggested] = useState<number | null>(null);
  const [correctOf, setCorrectOf] = useState<Entry | null>(null);
  const [saved, setSaved] = useState<{ entry: Entry; text: string; settle: string } | null>(null);

  useEffect(() => {
    (async () => {
      const db = (await getDb()) as unknown as Db;
      setMyId(await getMyHouseholdId(db));
      let eventId = params.eventId;
      if (params.correctId) {
        const e = await getEntry(db, params.correctId);
        if (e) {
          setCorrectOf(e);
          eventId = e.eventId ?? eventId;
          setDigits(String(Math.round(e.cashPaise / 100)));
          setMode(e.paymentMode);
          setDate(e.occurredOn ?? null);
          if (e.inKindItem) {
            setKind('other');
            setKindText(e.inKindItem);
            setKindValue(String(Math.round(e.inKindValuePaise / 100)));
          }
          setHousehold(await getHousehold(db, e.otherHouseholdId));
        }
      }
      const ev = eventId ? await getEvent(db, eventId) : null;
      setEvent(ev);
      if (ev && !params.correctId) setDate(entryDateFor(ev.date));
      if (params.householdId && !params.correctId) setHousehold(await getHousehold(db, params.householdId));
    })();
  }, [params.correctId, params.householdId, params.eventId]);

  const mine = event ? isMyEvent(event, myId) : true;
  const direction = event && myId ? directionForHost(event.hostHouseholdId, myId) : mine ? 'AAYA' : 'GAYA';
  // giving: the family IS the host of the program
  useEffect(() => {
    if (!event || mine || household) return;
    (async () => setHousehold(await getHousehold((await getDb()) as unknown as Db, event.hostHouseholdId)))();
  }, [event, mine, household]);

  const hid = household?.id;
  useEffect(() => {
    if (!hid || direction !== 'GAYA') return;
    (async () => {
      const db = (await getDb()) as unknown as Db;
      const [b] = await sqlBalances(db, await getIncrement(db), ledgerId, hid);
      setSuggested(b?.suggestedNext ?? null);
    })();
  }, [hid, ledgerId, direction]);

  const cashPaise = Number(digits || 0) * 100;
  const item = useMemo(() => {
    if (!kind) return undefined;
    const k = IN_KIND_KINDS.find((x) => x.key === kind)!;
    const t = kindText.trim();
    return kind === 'other' ? t || k.label : t ? `${k.label} ${t}` : k.label;
  }, [kind, kindText]);
  const canSave = !!household && !!event && !!date && (cashPaise > 0 || !!item);

  const save = async () => {
    if (!household || !event || !canSave) return;
    // A failed write shows a message and keeps the form as it is, so nothing typed is lost.
    const done = await guarded(async () => {
      const db = (await getDb()) as unknown as Db;
      const fields = {
        otherHouseholdId: household.id, direction, cashPaise, inKindItem: item, inKindValuePaise: item ? Number(kindValue || 0) * 100 : 0,
        paymentMode: mode, eventId: event.id, occurredOn: date ?? undefined,
      };
      const entry = correctOf
        ? await correctEntry(db, correctOf, fields)
        : await addEntry(db, { ...fields, ledgerId, recordedBy: (await getMyHouseholdId(db)) ?? 'self' });
      return { entry, settle: await sqlEntrySettlement(db, entry.id) };
    });
    if (!done) return;
    tapLight();
    const text = readBackWithSettlement(done.entry, household, done.settle.utarPaise, done.settle.chadhavPaise);
    setSaved({ entry: done.entry, text, settle: utarChadhavText(done.settle.utarPaise, done.settle.chadhavPaise) });
    speak(text);
  };

  if (saved) {
    const ink = DIRECTION_INK[saved.entry.direction];
    return (
      <Screen title="सही है?" noBack action={{ testID: 'btn-confirm', icon: 'check', label: 'हाँ, सही है', onPress: back }}>
        <SaveCheck />
        <Text style={[type.title, styles.readback]}>{saved.text}</Text>
        <Text style={[type.amountXL, styles.big, { color: ink }]} adjustsFontSizeToFit numberOfLines={1}>
          {formatINR(saved.entry.cashPaise + saved.entry.inKindValuePaise)}
        </Text>
        {saved.settle ? <Text style={[type.heading, styles.center]}>{saved.settle}</Text> : null}
        <View style={styles.row}>
          <BigButton
            testID="btn-change"
            compact
            icon="write"
            label="बदलें"
            onPress={() => {
              setCorrectOf(saved.entry);
              setSaved(null);
            }}
          />
          <BigButton compact icon="speaker" label="फिर से सुनें" onPress={() => speak(saved.text)} />
        </View>
        {saved.entry.direction === 'GAYA' ? (
          <BigButton testID="btn-another" icon="plus" label="एक और नोतरे में गए" tone="plain" onPress={() => replace(`/others/new${params.old === '1' ? '?old=1' : ''}`)} />
        ) : null}
      </Screen>
    );
  }

  if (!event) {
    return (
      <Screen title="नोतरा लिखें">
        <View />
      </Screen>
    );
  }

  if (mine && !household) {
    return (
      <Screen title="कौन आया?" scroll={false} speakText={HELP_ENTRY}>
        <HouseholdPicker
          onPick={(h, amt) => {
            setHousehold(h);
            if (amt) setDigits(String(amt));
          }}
        />
      </Screen>
    );
  }

  const ink = DIRECTION_INK[direction];
  const programName = event ? (isLegacyEventId(event.id) ? LEGACY_EVENT_LABEL : occasionName(event.occasion, event.occasionLabel)) : '';
  return (
    <Screen
      title={correctOf ? 'एंट्री सुधारें' : mine ? 'कौन आया' : 'मैंने दिया'}
      speakText={HELP_ENTRY}
      action={{ testID: 'btn-save', icon: 'check', label: 'सेव करें', onPress: save, disabled: !canSave }}
    >
      {correctOf ? (
        <Card tint="haldi">
          <Text style={type.body}>सही रकम डालें। पुरानी एंट्री हिसाब से हट जाएगी, मिटेगी नहीं।</Text>
        </Card>
      ) : null}
      {household ? (
        <Card style={styles.who}>
          <Avatar name={household.headName} photoUri={household.photoUri} />
          <View style={styles.flex}>
            <Text style={[type.heading, styles.name]} numberOfLines={1}>
              {household.headName}
            </Text>
            <Text style={[type.caption, styles.sub]} numberOfLines={1}>
              {[household.fatherName && `${household.fatherName} का`, household.village].filter(Boolean).join(' · ')}
            </Text>
            {event ? (
              <Text style={[type.caption, styles.sub]} numberOfLines={2}>
                {programName} · {displayDate(event.date)}
              </Text>
            ) : null}
          </View>
          {correctOf || !mine ? null : <BigButton testID="btn-change-family" compact label="बदलें" tone="plain" onPress={() => setHousehold(null)} />}
        </Card>
      ) : null}

      <AmountDisplay rupees={Number(digits || 0)} color={ink} />
      <View style={styles.row}>
        {SHAGUN_QUICK_RUPEES.map((r) => (
          <BigButton key={r} testID={`chip-${r}`} compact label={formatINR(r * 100)} selected={digits === String(r)} onPress={() => setDigits(String(r))} />
        ))}
        {direction === 'GAYA' && suggested ? (
          <BigButton testID="chip-suggested" compact label={`सुझाव ${formatINR(suggested)}`} selected={digits === String(suggested / 100)} onPress={() => setDigits(String(suggested / 100))} />
        ) : null}
      </View>
      <NumberPad value={digits} onChange={setDigits} />

      {date ? <DatePickerField testID="field-date" label="किस तारीख को" value={date} onChange={setDate} /> : null}

      <SectionTitle icon="grain">सामान (ज़रूरी नहीं)</SectionTitle>
      <View style={styles.row}>
        {IN_KIND_KINDS.map((k) => (
          <BigButton key={k.key} testID={`kind-${k.key}`} compact icon={IN_KIND_ICON[k.key]} label={k.label} selected={kind === k.key} onPress={() => setKind(kind === k.key ? null : k.key)} />
        ))}
      </View>
      {kind ? (
        <>
          <TextInput
            testID="field-kind-text"
            style={inputStyle}
            value={kindText}
            onChangeText={setKindText}
            accessibilityLabel="सामान का नाम या मात्रा"
            placeholder={kind === 'other' ? 'क्या दिया?' : 'कितना? (जैसे 10 किलो)'}
            placeholderTextColor={colors.muted}
          />
          <TextInput
            testID="field-kind-value"
            style={inputStyle}
            value={kindValue}
            onChangeText={(t) => setKindValue(t.replace(/\D/g, ''))}
            keyboardType="number-pad"
            accessibilityLabel="सामान की अंदाज़न कीमत, रुपये में"
            placeholder="अंदाज़न कीमत ₹"
            placeholderTextColor={colors.muted}
          />
        </>
      ) : null}

      <SectionTitle icon="cash">कैसे?</SectionTitle>
      <View style={styles.row}>
        <BigButton compact label="नकद" icon="cash" selected={mode === 'CASH'} onPress={() => setMode('CASH')} />
        <BigButton compact label="यूपीआई" icon="phone" selected={mode === 'UPI'} onPress={() => setMode('UPI')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  who: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  name: { color: colors.ink },
  sub: { color: colors.muted },
  readback: { color: colors.ink, textAlign: 'center' },
  center: { color: colors.ink, textAlign: 'center' },
  big: { textAlign: 'center' },
});
