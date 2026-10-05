import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BigButton } from '@/components/big-button';
import { Field } from '@/components/field';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import type { Increment } from '@/core';
import { createHousehold, getDb, getMyHouseholdId, setIncrement, setMyHouseholdId, type Db } from '@/db';
import { replace } from '@/nav';
import { guarded } from '@/services/guard';
import { colors, spacing, type } from '@/theme';

const CHOICES: { label: string; value: Increment }[] = [
  { label: '₹51', value: { type: 'FIXED', rupees: 51 } },
  { label: '₹101', value: { type: 'FIXED', rupees: 101 } },
  { label: '10%', value: { type: 'PERCENT', pct: 10 } },
];

/** First launch: my household + the village custom for how much more to return. */
export default function Setup() {
  const [f, setF] = useState({ name: '', father: '', jati: '', village: '', fala: '', atak: '' });
  const [inc, setInc] = useState(0);
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  // A restored phone gets "my household" from the cloud profile: never make a second one.
  useEffect(() => {
    (async () => {
      try {
        if (await getMyHouseholdId((await getDb()) as unknown as Db)) replace('/');
      } catch {
        /* stay on the form */
      }
    })();
  }, []);

  const save = async () => {
    const ok = await guarded(async () => {
      const db = (await getDb()) as unknown as Db;
      if (await getMyHouseholdId(db)) return true; // arrived from the cloud while the form was open
      const h = await createHousehold(db, {
        headName: f.name.trim(), fatherName: f.father.trim(), jati: f.jati.trim(),
        village: f.village.trim(), fala: f.fala.trim(), atak: f.atak.trim(),
      });
      await setMyHouseholdId(db, h.id);
      await setIncrement(db, CHOICES[inc].value);
      return true;
    });
    if (ok) replace('/');
  };

  return (
    <Screen title="मेरा परिवार" noBack action={{ testID: 'btn-save', label: 'शुरू करें', icon: 'check', onPress: save, disabled: !f.name.trim() }}>
      <Field testID="field-name" label="नाम" value={f.name} onChangeText={set('name')} />
      <Field testID="field-father" label="पिता का नाम" value={f.father} onChangeText={set('father')} />
      <Field testID="field-jati" label="जाति" value={f.jati} onChangeText={set('jati')} />
      <Field testID="field-village" label="गाँव" value={f.village} onChangeText={set('village')} />
      <Field testID="field-fala" label="फला" value={f.fala} onChangeText={set('fala')} />
      <Field testID="field-atak" label="अटक" value={f.atak} onChangeText={set('atak')} />
      <Text style={[type.heading, styles.q]}>हमारे गाँव में लौटाते समय कितना ज़्यादा देते हैं?</Text>
      <View style={styles.row}>
        {CHOICES.map((c, i) => (
          <BigButton key={c.label} testID={`chip-${c.label.replace(/\W/g, '')}`} third label={c.label} selected={inc === i} onPress={() => setInc(i)} />
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  q: { color: colors.ink },
  row: { flexDirection: 'row', gap: spacing.sm },
});
