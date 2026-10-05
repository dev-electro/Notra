import React, { useEffect, useState } from 'react';
import { Field } from '@/components/field';
import { Screen } from '@/components/screen';
import { createHousehold, getDb, getMyHouseholdId, setIncrement, setMyHouseholdId, type Db } from '@/db';
import { replace } from '@/nav';
import { guarded } from '@/services/guard';
import { track } from '@/analytics';

/** First launch: my household. The default return increment (₹51) is set silently. */
export default function Setup() {
  const [f, setF] = useState({ name: '', father: '', jati: '', village: '', panchayat: '', tehsil: '', district: '' });
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
        village: f.village.trim(), panchayat: f.panchayat.trim(), tehsil: f.tehsil.trim(), district: f.district.trim(), kind: 'FAMILY',
      });
      await setMyHouseholdId(db, h.id);
      await setIncrement(db, { type: 'FIXED', rupees: 51 });
      return true;
    });
    if (ok) {
      track('setup_complete');
      replace('/');
    }
  };

  return (
    <Screen title="मेरा परिवार" noBack action={{ testID: 'btn-save', label: 'शुरू करें', icon: 'check', onPress: save, disabled: !f.name.trim() }}>
      <Field testID="field-name" label="नाम" value={f.name} onChangeText={set('name')} />
      <Field testID="field-father" label="पिता का नाम" value={f.father} onChangeText={set('father')} />
      <Field testID="field-jati" label="जाति" value={f.jati} onChangeText={set('jati')} />
      <Field testID="field-village" label="गाँव" value={f.village} onChangeText={set('village')} />
      <Field testID="field-panchayat" label="ग्राम पंचायत" value={f.panchayat} onChangeText={set('panchayat')} />
      <Field testID="field-tehsil" label="तहसील" value={f.tehsil} onChangeText={set('tehsil')} />
      <Field testID="field-district" label="ज़िला" value={f.district} onChangeText={set('district')} />
    </Screen>
  );
}
