import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AmountDisplay } from '@/components/amount-display';
import { Avatar } from '@/components/avatar';
import { BigButton } from '@/components/big-button';
import { Card, SectionTitle } from '@/components/card';
import { DIRECTION_INK } from '@/components/direction';
import { inputStyle } from '@/components/field';
import { HouseholdPicker } from '@/components/household-picker';
import { IN_KIND_ICON } from '@/components/icons';
import { NumberPad } from '@/components/number-pad';
import { OCCASION_ICON_NAME } from '@/components/occasion';
import { SaveCheck } from '@/components/save-check';
import { Screen } from '@/components/screen';
import { Text, TextInput } from '@/components/text';
import {
  displayDate, formatINR, IN_KIND_KINDS, OCCASION_LABEL, readBack, SHAGUN_QUICK_RUPEES,
  type Direction, type Entry, type Household, type NotraEvent, type PaymentMode,
} from '@/core';
import {
  addEntry, correctEntry, getDb, getEntry, getHousehold, getIncrement, getMyHouseholdId, listEvents, sqlBalances, type Db,
} from '@/db';
import { useActiveLedgerId } from '@/hooks/use-active-ledger';
import { back } from '@/nav';
import { HELP_ENTRY } from '@/onboarding/help';
import { guarded } from '@/services/guard';
import { tapLight } from '@/services/haptics';
import { speak } from '@/services/speech';
import { colors, spacing, type } from '@/theme';

/** Add an entry (or a correction of one). Saving speaks the Hindi read-back and asks "सही है?". */
export default function NewEntry() {
  const params = useLocalSearchParams<{ householdId?: string; correctId?: string; eventId?: string; direction?: string }>();
  const ledgerId = useActiveLedgerId();
  const [household, setHousehold] = useState<Household | null>(null);
  const [direction, setDirection] = useState<Direction>(params.direction === 'GAYA' ? 'GAYA' : 'AAYA');
  const [digits, setDigits] = useState('');
  const [kind, setKind] = useState<string | null>(null);
  const [kindText, setKindText] = useState('');
  const [kindValue, setKindValue] = useState('');
  const [mode, setMode] = useState<PaymentMode>('CASH');
  const [eventId, setEventId] = useState<string | undefined>(params.eventId);
  const [events, setEvents] = useState<NotraEvent[]>([]);
  const [suggested, setSuggested] = useState<number | null>(null);
  const [correctOf, setCorrectOf] = useState<Entry | null>(null);
  const [saved, setSaved] = useState<{ entry: Entry; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      const db = (await getDb()) as unknown as Db;
      setEvents((await listEvents(db, ledgerId)).slice(0, 6));
      if (params.correctId) {
        const e = await getEntry(db, params.correctId);
        if (e) {
          setCorrectOf(e);
          setDirection(e.direction);
          setDigits(String(Math.round(e.cashPaise / 100)));
          setMode(e.paymentMode);
          setEventId(e.eventId);
          if (e.inKindItem) {
            setKind('other');
            setKindText(e.inKindItem);
            setKindValue(String(Math.round(e.inKindValuePaise / 100)));
          }
        }
      }
      if (params.householdId) setHousehold(await getHousehold(db, params.householdId));
    })();
  }, [params.correctId, params.householdId, ledgerId]);

  const hid = household?.id;
  useEffect(() => {
    if (!hid) return;
    (async () => {
      const db = (await getDb()) as unknown as Db;
      const [b] = await sqlBalances(db, await getIncrement(db), ledgerId, hid);
      setSuggested(b?.suggestedNext ?? null);
    })();
  }, [hid, ledgerId]);

  const cashPaise = Number(digits || 0) * 100;
  const item = useMemo(() => {
    if (!kind) return undefined;
    const k = IN_KIND_KINDS.find((x) => x.key === kind)!;
    const t = kindText.trim();
    return kind === 'other' ? t || k.label : t ? `${k.label} ${t}` : k.label;
  }, [kind, kindText]);
  const canSave = !!household && (cashPaise > 0 || !!item);

  const save = async () => {
    if (!household || !canSave) return;
    // A failed write shows a message and keeps the form as it is, so nothing typed is lost.
    const entry = await guarded(async () => {
      const db = (await getDb()) as unknown as Db;
      const fields = {
        otherHouseholdId: household.id, direction, cashPaise,
        inKindItem: item, inKindValuePaise: item ? Number(kindValue || 0) * 100 : 0,
        paymentMode: mode, eventId,
      };
      return correctOf
        ? await correctEntry(db, correctOf, fields)
        : await addEntry(db, { ...fields, ledgerId, recordedBy: (await getMyHouseholdId(db)) ?? 'self' });
    });
    if (!entry) return;
    tapLight();
    const text = readBack(entry, household);
    setSaved({ entry, text });
    speak(text);
  };

  if (saved) {
    const ink = DIRECTION_INK[saved.entry.direction];
    return (
      <Screen title="सही है?" noBack action={{ icon: 'check', label: 'हाँ, सही है', onPress: back }}>
        <SaveCheck />
        <Text style={[type.title, styles.readback]}>{saved.text}</Text>
        <Text style={[type.amountXL, styles.big, { color: ink }]} adjustsFontSizeToFit numberOfLines={1}>
          {formatINR(saved.entry.cashPaise + saved.entry.inKindValuePaise)}
        </Text>
        <View style={styles.row}>
          <BigButton
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
      </Screen>
    );
  }

  if (!household) {
    return (
      <Screen title="किसका नोतरा?" scroll={false} speakText={HELP_ENTRY}>
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
  return (
    <Screen
      title={correctOf ? 'एंट्री सुधारें' : 'नोतरा लिखें'}
      speakText={HELP_ENTRY}
      action={{ icon: 'check', label: 'सेव करें', onPress: save, disabled: !canSave }}
    >
      {correctOf ? (
        <Card tint="haldi">
          <Text style={type.body}>सही रकम डालें। पुरानी एंट्री हिसाब से हट जाएगी, मिटेगी नहीं।</Text>
        </Card>
      ) : null}
      <Card style={styles.who}>
        <Avatar name={household.headName} photoUri={household.photoUri} />
        <View style={styles.flex}>
          <Text style={[type.heading, styles.name]} numberOfLines={1}>
            {household.headName}
          </Text>
          <Text style={[type.caption, styles.sub]} numberOfLines={1}>
            {[household.fatherName && `${household.fatherName} का`, household.village].filter(Boolean).join(' · ')}
          </Text>
        </View>
        {correctOf ? null : <BigButton compact label="बदलें" tone="plain" onPress={() => setHousehold(null)} />}
      </Card>

      <View style={styles.row}>
        <BigButton compact tone="received" icon="arrowDown" label="मिला (आया)" selected={direction === 'AAYA'} onPress={() => setDirection('AAYA')} />
        <BigButton compact tone="given" icon="arrowUp" label="दिया (गया)" selected={direction === 'GAYA'} onPress={() => setDirection('GAYA')} />
      </View>

      <AmountDisplay rupees={Number(digits || 0)} color={ink} />
      <View style={styles.row}>
        {SHAGUN_QUICK_RUPEES.map((r) => (
          <BigButton key={r} compact label={formatINR(r * 100)} selected={digits === String(r)} onPress={() => setDigits(String(r))} />
        ))}
        {direction === 'GAYA' && suggested ? (
          <BigButton compact label={`सुझाव ${formatINR(suggested)}`} selected={digits === String(suggested / 100)} onPress={() => setDigits(String(suggested / 100))} />
        ) : null}
      </View>
      <NumberPad value={digits} onChange={setDigits} />

      <SectionTitle icon="grain">सामान (ज़रूरी नहीं)</SectionTitle>
      <View style={styles.row}>
        {IN_KIND_KINDS.map((k) => (
          <BigButton key={k.key} compact icon={IN_KIND_ICON[k.key]} label={k.label} selected={kind === k.key} onPress={() => setKind(kind === k.key ? null : k.key)} />
        ))}
      </View>
      {kind ? (
        <>
          <TextInput
            style={inputStyle}
            value={kindText}
            onChangeText={setKindText}
            accessibilityLabel="सामान का नाम या मात्रा"
            placeholder={kind === 'other' ? 'क्या दिया?' : 'कितना? (जैसे 10 किलो)'}
            placeholderTextColor={colors.muted}
          />
          <TextInput
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

      {events.length ? (
        <>
          <SectionTitle icon="events">कार्यक्रम (ज़रूरी नहीं)</SectionTitle>
          <View style={styles.row}>
            <BigButton compact label="कोई नहीं" selected={!eventId} onPress={() => setEventId(undefined)} />
            {events.map((e) => (
              <BigButton
                key={e.id}
                compact
                icon={OCCASION_ICON_NAME[e.occasion]}
                label={`${OCCASION_LABEL[e.occasion]} ${displayDate(e.date)}`}
                selected={eventId === e.id}
                onPress={() => setEventId(e.id)}
              />
            ))}
          </View>
        </>
      ) : null}
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
  big: { textAlign: 'center' },
});
