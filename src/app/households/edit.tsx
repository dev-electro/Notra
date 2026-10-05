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
import { guarded } from '@/services/guard';
import { canPickContact, pickContactPhone } from '@/services/contact-picker';
import { showToast } from '@/services/toast';
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

  const [canPick, setCanPick] = useState(false);
  useEffect(() => {
    (async () => setCanPick(await canPickContact()))();
  }, []);
  /** The system contact picker: ONE contact comes back (name + number). No READ_CONTACTS permission. */
  const pickContact = async () => {
    const c = await pickContactPhone();
    if (!c) return;
    if (!c.phone) {
      showToast('यह नंबर मोबाइल नंबर जैसा नहीं है। खुद लिख लें।');
      return;
    }
    setF((s) => ({ ...s, phone: c.phone!, headName: s.headName.trim() ? s.headName : c.name }));
  };
  const set = (k: keyof typeof EMPTY) => (v: string) => setF((s) => ({ ...s, [k]: v }));
  const photo = async (source: 'camera' | 'gallery') => {
    const uri = await pickPhoto(source);
    if (uri) setF((s) => ({ ...s, photoUri: uri }));
  };

  const save = async () => {
    const data = {
      headName: f.headName.trim(), fatherName: f.fatherName.trim(), jati: f.jati.trim(), village: f.village.trim(),
      fala: f.fala.trim(), atak: f.atak.trim(), phone: f.phone.trim() || undefined, photoUri: f.photoUri || undefined,
    };
    const ok = await guarded(async () => {
      const db = (await getDb()) as unknown as Db;
      if (id) await updateHousehold(db, { ...(data as Household), id });
      else await createHousehold(db, data);
      return true;
    });
    if (ok) back();
  };

  return (
    <Screen title={id ? 'परिवार बदलें' : 'नया परिवार'} action={{ testID: 'btn-save', icon: 'check', label: 'सेव करें', onPress: save, disabled: !f.headName.trim() }}>
      <View style={styles.photoRow}>
        <Avatar name={f.headName} photoUri={f.photoUri || undefined} size={96} />
        <View style={styles.photoBtns}>
          <BigButton testID="btn-camera" compact icon="camera" label="कैमरा" onPress={() => photo('camera')} />
          <BigButton compact icon="image" label="गैलरी" onPress={() => photo('gallery')} />
        </View>
      </View>
      <Field testID="field-name" label="नाम" value={f.headName} onChangeText={set('headName')} />
      <Field testID="field-father" label="पिता का नाम" value={f.fatherName} onChangeText={set('fatherName')} />
      <Field testID="field-jati" label="जाति" value={f.jati} onChangeText={set('jati')} />
      <Field testID="field-village" label="गाँव" value={f.village} onChangeText={set('village')} />
      <Field testID="field-fala" label="फला" value={f.fala} onChangeText={set('fala')} />
      <Field testID="field-atak" label="अटक" value={f.atak} onChangeText={set('atak')} />
      <Field testID="field-phone" label="फ़ोन (ज़रूरी नहीं)" value={f.phone} onChangeText={set('phone')} keyboardType="phone-pad" />
      {canPick ? <BigButton testID="btn-pick-contact" icon="phone" label="फ़ोन से नंबर चुनें" tone="plain" hint="फ़ोन की संपर्क सूची खुलेगी; आप एक नाम चुनेंगे और सिर्फ़ वही नंबर आएगा" onPress={pickContact} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  photoBtns: { flex: 1, gap: spacing.sm },
});
