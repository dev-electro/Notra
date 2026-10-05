import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text, TextInput } from '@/components/text';
import { BigButton } from '@/components/big-button';
import { HouseholdPicker } from '@/components/household-picker';
import { NumberPad } from '@/components/number-pad';
import { Screen } from '@/components/screen';
import {
  displayDate, formatINR, IN_KIND_KINDS, OCCASION_ICON, OCCASION_LABEL, readBack, SHAGUN_QUICK_RUPEES,
  type Direction, type Entry, type Household, type NotraEvent, type PaymentMode,
} from '@/core';
import {
  addEntry, correctEntry, getDb, getEntry, getHousehold, getIncrement, getMyHouseholdId, listEvents, sqlBalances, type Db,
} from '@/db';
import { useActiveLedgerId } from '@/hooks/use-active-ledger';
import { back } from '@/nav';
import { HELP_ENTRY } from '@/onboarding/help';
import { guarded } from '@/services/guard';
import { speak } from '@/services/speech';
import { colors, spacing } from '@/theme';

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
    const text = readBack(entry, household);
    setSaved({ entry, text });
    speak(text);
  };

  if (saved) {
    return (
      <Screen title="सही है?" noBack>
        <Text style={styles.readback}>{saved.text}</Text>
        <Text style={styles.big}>{formatINR(saved.entry.cashPaise + saved.entry.inKindValuePaise)}</Text>
        <BigButton icon="👍" label="हाँ, सही है" onPress={back} />
        <BigButton
          icon="✏️"
          label="बदलें"
          tone="red"
          onPress={() => {
            setCorrectOf(saved.entry);
            setSaved(null);
          }}
        />
        <BigButton icon="🔊" label="फिर से सुनें" tone="plain" onPress={() => speak(saved.text)} />
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

  return (
    <Screen title={correctOf ? 'एंट्री सुधारें' : 'नई एंट्री'} speakText={HELP_ENTRY}>
      {correctOf ? <Text style={styles.note}>सही रकम डालें। पुरानी एंट्री हिसाब से हट जाएगी, मिटेगी नहीं।</Text> : null}
      <View style={styles.who}>
        <View style={styles.flex}>
          <Text style={styles.name}>{household.headName}</Text>
          <Text style={styles.sub}>{[household.fatherName && `${household.fatherName} का`, household.village].filter(Boolean).join(' · ')}</Text>
        </View>
        {correctOf ? null : <BigButton compact label="बदलें" tone="plain" onPress={() => setHousehold(null)} />}
      </View>

      <View style={styles.row}>
        <BigButton compact label="आया" icon="⬇️" selected={direction === 'AAYA'} onPress={() => setDirection('AAYA')} />
        <BigButton compact label="गया" icon="⬆️" tone="red" selected={direction === 'GAYA'} onPress={() => setDirection('GAYA')} />
      </View>

      <Text style={[styles.amount, { color: direction === 'AAYA' ? colors.inkBlue : colors.inkRed }]} accessibilityLabel="रकम">
        {formatINR(cashPaise)}
      </Text>
      <View style={styles.row}>
        {SHAGUN_QUICK_RUPEES.map((r) => (
          <BigButton key={r} compact label={formatINR(r * 100)} tone="plain" selected={digits === String(r)} onPress={() => setDigits(String(r))} />
        ))}
        {direction === 'GAYA' && suggested ? (
          <BigButton compact label={`सुझाव ${formatINR(suggested)}`} selected={digits === String(suggested / 100)} onPress={() => setDigits(String(suggested / 100))} />
        ) : null}
      </View>
      <NumberPad value={digits} onChange={setDigits} />

      <Text style={styles.section}>सामान (ज़रूरी नहीं)</Text>
      <View style={styles.row}>
        {IN_KIND_KINDS.map((k) => (
          <BigButton key={k.key} compact icon={k.icon} label={k.label} tone="plain" selected={kind === k.key} onPress={() => setKind(kind === k.key ? null : k.key)} />
        ))}
      </View>
      {kind ? (
        <>
          <TextInput
            style={styles.input}
            value={kindText}
            onChangeText={setKindText}
            accessibilityLabel="सामान का नाम या मात्रा"
            placeholder={kind === 'other' ? 'क्या दिया?' : 'कितना? (जैसे 10 किलो)'}
            placeholderTextColor={colors.textMuted}
          />
          <TextInput
            style={styles.input}
            value={kindValue}
            onChangeText={(t) => setKindValue(t.replace(/\D/g, ''))}
            keyboardType="number-pad"
            accessibilityLabel="सामान की अंदाज़न कीमत, रुपये में"
            placeholder="अंदाज़न कीमत ₹"
            placeholderTextColor={colors.textMuted}
          />
        </>
      ) : null}

      <Text style={styles.section}>कैसे?</Text>
      <View style={styles.row}>
        <BigButton compact label="नकद" icon="💵" tone="plain" selected={mode === 'CASH'} onPress={() => setMode('CASH')} />
        <BigButton compact label="UPI" icon="📱" tone="plain" selected={mode === 'UPI'} onPress={() => setMode('UPI')} />
      </View>

      {events.length ? (
        <>
          <Text style={styles.section}>कार्यक्रम (ज़रूरी नहीं)</Text>
          <View style={styles.row}>
            <BigButton compact label="कोई नहीं" tone="plain" selected={!eventId} onPress={() => setEventId(undefined)} />
            {events.map((e) => (
              <BigButton
                key={e.id}
                compact
                icon={OCCASION_ICON[e.occasion]}
                label={`${OCCASION_LABEL[e.occasion]} ${displayDate(e.date)}`}
                tone="plain"
                selected={eventId === e.id}
                onPress={() => setEventId(e.id)}
              />
            ))}
          </View>
        </>
      ) : null}

      <BigButton icon="✔" label="सेव करें" onPress={save} disabled={!canSave} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  who: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { fontSize: 28, lineHeight: 36, fontWeight: '700', color: colors.text },
  sub: { fontSize: 18, color: colors.textMuted },
  amount: { fontSize: 52, lineHeight: 64, fontWeight: '700', textAlign: 'right' },
  section: { fontSize: 22, fontWeight: '700', color: colors.inkBlue },
  note: { fontSize: 20, lineHeight: 28, color: colors.neutral },
  input: {
    minHeight: 64, borderWidth: 2, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.card,
    paddingHorizontal: spacing.md, fontSize: 24, color: colors.text,
  },
  readback: { fontSize: 30, lineHeight: 42, fontWeight: '700', color: colors.text },
  big: { fontSize: 52, lineHeight: 64, fontWeight: '700', color: colors.inkBlue },
});
