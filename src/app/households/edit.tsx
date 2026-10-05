import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Avatar } from '@/components/avatar';
import { BigButton } from '@/components/big-button';
import { Field } from '@/components/field';
import { Screen } from '@/components/screen';
import type { Household } from '@/core';
import { createHousehold, getDb, getHousehold, updateHousehold, type Db } from '@/db';
import { back } from '@/nav';
import { pickPhoto } from '@/services/photo';
import { spacing } from '@/theme';

const EMPTY = { headName: '', fatherName: '', jati: '', village: '', fala: '', atak: '', phone: '', photoUri: '' };

/** Add / edit a household. Column order follows the paper diary. */
export default function HouseholdEdit() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [f, setF] = useState(EMPTY);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const db = (await getDb()) as unknown as Db;
      const h = await getHousehold(db, id);
      if (h) setF({ ...EMPTY, ...h, phone: h.phone ?? '', photoUri: h.photoUri ?? '' });
    })();
  }, [id]);

  const set = (k: keyof typeof EMPTY) => (v: string) => setF((s) => ({ ...s, [k]: v }));
  const photo = async (source: 'camera' | 'gallery') => {
    const uri = await pickPhoto(source);
    if (uri) setF((s) => ({ ...s, photoUri: uri }));
  };

  const save = async () => {
    const db = (await getDb()) as unknown as Db;
    const data = {
      headName: f.headName.trim(), fatherName: f.fatherName.trim(), jati: f.jati.trim(), village: f.village.trim(),
      fala: f.fala.trim(), atak: f.atak.trim(), phone: f.phone.trim() || undefined, photoUri: f.photoUri || undefined,
    };
    if (id) await updateHousehold(db, { ...(data as Household), id });
    else await createHousehold(db, data);
    back();
  };

  return (
    <Screen title={id ? 'परिवार बदलें' : 'नया परिवार'}>
      <View style={styles.photoRow}>
        <Avatar name={f.headName} photoUri={f.photoUri || undefined} size={96} />
        <View style={styles.photoBtns}>
          <BigButton compact icon="📷" label="कैमरा" onPress={() => photo('camera')} />
          <BigButton compact icon="🖼️" label="गैलरी" tone="red" onPress={() => photo('gallery')} />
        </View>
      </View>
      <Field label="नाम" value={f.headName} onChangeText={set('headName')} />
      <Field label="पिता का नाम" value={f.fatherName} onChangeText={set('fatherName')} />
      <Field label="जाति" value={f.jati} onChangeText={set('jati')} />
      <Field label="गाँव" value={f.village} onChangeText={set('village')} />
      <Field label="फला" value={f.fala} onChangeText={set('fala')} />
      <Field label="अटक" value={f.atak} onChangeText={set('atak')} />
      <Field label="फ़ोन (ज़रूरी नहीं)" value={f.phone} onChangeText={set('phone')} keyboardType="phone-pad" />
      <BigButton icon="✔" label="सेव करें" onPress={save} disabled={!f.headName.trim()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  photoBtns: { flex: 1, gap: spacing.sm },
});
