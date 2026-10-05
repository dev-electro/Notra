import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { BigButton } from '@/components/big-button';
import { SectionTitle } from '@/components/card';
import { Field } from '@/components/field';
import type { Biodata } from '@/core';
import { pickPhoto } from '@/services/photo';
import { BORDER, colors, radius, spacing } from '@/theme';

type Key = keyof Biodata;
interface Spec {
  key: Key;
  label: string;
  multiline?: boolean;
  keyboardType?: 'phone-pad';
}

const GROUPS: { title: string; fields: Spec[] }[] = [
  {
    title: 'व्यक्तिगत जानकारी',
    fields: [
      { key: 'name', label: 'नाम' },
      { key: 'dobDate', label: 'जन्म तिथि' },
      { key: 'dobTime', label: 'जन्म समय' },
      { key: 'birthPlace', label: 'जन्म स्थान' },
      { key: 'height', label: 'कद' },
      { key: 'gotra', label: 'गोत्र' },
    ],
  },
  { title: 'शिक्षा और व्यवसाय', fields: [{ key: 'education', label: 'शिक्षा' }, { key: 'occupation', label: 'व्यवसाय' }] },
  { title: 'परिवार', fields: [{ key: 'father', label: 'पिता का नाम' }, { key: 'mother', label: 'माता का नाम' }, { key: 'siblings', label: 'भाई-बहन' }] },
  { title: 'संपर्क', fields: [{ key: 'address', label: 'पता', multiline: true }, { key: 'contact', label: 'संपर्क नंबर', keyboardType: 'phone-pad' }] },
];

/** One scrolling form in four groups. The parent screen scrolls; nothing here scrolls on its own. */
export function BiodataForm({ value, onChange }: { value: Biodata; onChange: (b: Biodata) => void }) {
  const set = (key: Key, v: string) => onChange({ ...value, [key]: v });
  const choose = async (src: 'camera' | 'gallery') => {
    const uri = await pickPhoto(src);
    if (uri) set('photoUri', uri);
  };
  return (
    <View style={styles.wrap}>
      <SectionTitle>फ़ोटो (मर्ज़ी से)</SectionTitle>
      {value.photoUri ? <Image source={{ uri: value.photoUri }} style={styles.photo} accessibilityLabel="चुनी हुई फ़ोटो" /> : null}
      <View style={styles.row}>
        <BigButton compact icon="image" tone="plain" label="गैलरी से" onPress={() => choose('gallery')} />
        <BigButton compact icon="camera" tone="plain" label="कैमरा" onPress={() => choose('camera')} />
      </View>
      {value.photoUri ? <BigButton tone="plain" label="फ़ोटो हटाएँ" onPress={() => set('photoUri', '')} /> : null}
      {GROUPS.map((g) => (
        <View key={g.title} style={styles.group}>
          <SectionTitle>{g.title}</SectionTitle>
          {g.fields.map((f) => (
            <Field
              key={f.key}
              testID={`bio-${f.key}`}
              label={f.label}
              value={value[f.key]}
              onChangeText={(t) => set(f.key, t)}
              multiline={f.multiline}
              keyboardType={f.keyboardType}
              style={f.multiline ? styles.multi : undefined}
              maxLength={300}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  group: { gap: spacing.md },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  photo: { width: 120, height: 120, borderRadius: radius.card, borderWidth: BORDER, borderColor: colors.hairline },
  multi: { minHeight: 96, textAlignVertical: 'top', paddingTop: spacing.sm },
});
