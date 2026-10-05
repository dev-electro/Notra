import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BigButton } from '@/components/big-button';
import { Field } from '@/components/field';
import { PinFlow } from '@/components/pin-flow';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { needsUnlock, type Ledger } from '@/core';
import { createLedger, getDb, listLedgers, setLedgerPin, verifyLedgerPin, type Db } from '@/db';
import { useActiveLedgerId } from '@/hooks/use-active-ledger';
import { useLoad } from '@/hooks/use-load';
import { getUnlocked, markUnlocked, setActiveLedger } from '@/ledgers/session';
import { back } from '@/nav';
import { guarded } from '@/services/guard';
import { newPinHash } from '@/services/pin-hash';
import { showToast } from '@/services/toast';
import { colors, spacing, type } from '@/theme';

type Mode =
  | { kind: 'list' }
  | { kind: 'unlock'; ledger: Ledger }
  | { kind: 'name' }
  | { kind: 'newpin'; name: string }
  | { kind: 'changepin'; ledger: Ledger }
  | { kind: 'removepin'; ledger: Ledger }
  | { kind: 'setpin'; ledger: Ledger };

const dbOf = async () => (await getDb()) as unknown as Db;

/**
 * "खाते": the household ledger plus an optional private ledger for each family member (own name, optional 4-digit PIN).
 * One screen with small steps, so it is only one level below Settings.
 */
export default function Ledgers() {
  const active = useActiveLedgerId();
  const [mode, setMode] = useState<Mode>({ kind: 'list' });
  const [name, setName] = useState('');
  const { data: ledgers, reload } = useLoad<Ledger[]>((db) => listLedgers(db), []);
  const list = () => {
    setMode({ kind: 'list' });
    reload();
  };

  const open = (l: Ledger) => {
    if (needsUnlock(l, getUnlocked())) setMode({ kind: 'unlock', ledger: l });
    else {
      setActiveLedger(l.id);
      back();
    }
  };

  const checkOf = useCallback((id: string) => async (pin: string) => verifyLedgerPin(await dbOf(), id, pin), []);

  if (mode.kind === 'unlock') {
    const l = mode.ledger;
    return (
      <Screen title={l.name} onBack={list}>
        <PinFlow
          verify
          askNew={false}
          check={checkOf(l.id)}
          verifyTitle="इस खाते का पिन डालें"
          onDone={() => {
            markUnlocked(l.id);
            setActiveLedger(l.id);
            back();
          }}
        />
      </Screen>
    );
  }

  if (mode.kind === 'name') {
    return (
      <Screen
        title="नया निजी खाता"
        onBack={list}
        action={{ icon: 'lock', label: 'पिन लगाएं', disabled: !name.trim(), onPress: () => setMode({ kind: 'newpin', name }) }}
      >
        <Text style={styles.note}>यह खाता सिर्फ़ उसका होगा जिसका नाम आप लिखेंगे। चाहें तो पिन भी लगा सकते हैं।</Text>
        <Field label="किसका खाता? (नाम)" value={name} onChangeText={setName} />
        <BigButton
          icon="check"
          label="बिना पिन के बनाएं"
          tone="plain"
          disabled={!name.trim()}
          onPress={async () => {
            const l = await guarded(async () => createLedger(await dbOf(), name));
            if (l) {
              setName('');
              list();
            }
          }}
        />
      </Screen>
    );
  }

  if (mode.kind === 'newpin') {
    const n = mode.name;
    return (
      <Screen title="खाते का पिन" onBack={() => setMode({ kind: 'name' })}>
        <PinFlow
          verify={false}
          askNew
          onDone={async (pin) => {
            const l = await guarded(async () => createLedger(await dbOf(), n, newPinHash(pin!)));
            if (l) {
              markUnlocked(l.id);
              setName('');
              showToast('खाता बन गया');
              list();
            }
          }}
        />
      </Screen>
    );
  }

  if (mode.kind === 'setpin') {
    const l = mode.ledger;
    return (
      <Screen title="खाते का पिन" onBack={list}>
        <PinFlow
          verify={false}
          askNew
          onDone={async (pin) => {
            const ok = await guarded(async () => {
              await setLedgerPin(await dbOf(), l.id, newPinHash(pin!));
              return true;
            });
            if (ok) {
              markUnlocked(l.id);
              showToast('पिन लग गया');
              list();
            }
          }}
        />
      </Screen>
    );
  }

  if (mode.kind === 'changepin' || mode.kind === 'removepin') {
    const l = mode.ledger;
    const change = mode.kind === 'changepin';
    return (
      <Screen title={change ? 'पिन बदलें' : 'पिन हटाएँ'} onBack={list}>
        <PinFlow
          verify
          askNew={change}
          check={checkOf(l.id)}
          verifyTitle="अभी का पिन डालें"
          onDone={async (pin) => {
            const ok = await guarded(async () => {
              await setLedgerPin(await dbOf(), l.id, change ? newPinHash(pin!) : null);
              return true;
            });
            if (ok) {
              showToast(change ? 'पिन बदल गया' : 'पिन हट गया');
              list();
            }
          }}
        />
      </Screen>
    );
  }

  const unlocked = getUnlocked();
  return (
    <Screen
      title="खाते"
      action={{ icon: 'plus', label: 'नया निजी खाता', onPress: () => setMode({ kind: 'name' }), hint: 'परिवार के किसी सदस्य का अलग खाता' }}
    >
      {ledgers.map((l) => (
        <View key={l.id} style={styles.item}>
          <BigButton
            icon={l.hasPin ? 'lock' : 'hisaab'}
            label={l.name}
            selected={l.id === active}
            hint={l.id === active ? 'यह खाता अभी खुला है' : 'इस खाते को खोलें'}
            onPress={() => open(l)}
          />
          {l.kind === 'PERSONAL' && !l.hasPin ? (
            <BigButton icon="lock" label="पिन लगाएं" tone="plain" onPress={() => setMode({ kind: 'setpin', ledger: l })} />
          ) : null}
          {l.kind === 'PERSONAL' && l.hasPin && unlocked.has(l.id) ? (
            <View style={styles.row}>
              <BigButton compact icon="refresh" label="पिन बदलें" tone="plain" onPress={() => setMode({ kind: 'changepin', ledger: l })} />
              <BigButton compact icon="unlock" label="पिन हटाएँ" tone="plain" onPress={() => setMode({ kind: 'removepin', ledger: l })} />
            </View>
          ) : null}
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: { ...type.body, color: colors.ink },
  item: { gap: spacing.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
