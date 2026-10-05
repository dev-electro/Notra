import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { BigButton } from '@/components/big-button';
import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { Field } from '@/components/field';
import { Screen } from '@/components/screen';
import { SettingRow } from '@/components/setting-row';
import { Text } from '@/components/text';
import { ProfileRow } from '@/features/rishte/discovery';
import { ConsentCheck } from '@/features/rishte/ConsentCheck';
import { go } from '@/nav';
import { defaultSeeking, GENDER_LABEL, type Gender, type PublicProfile, type SearchFilters } from '@/rishtey/logic';
import { errorText, getMyProfile, searchProfiles } from '@/rishtey/service';
import { colors, GUTTER, spacing, type } from '@/theme';

/**
 * रिश्ते खोजें: a short filter card, then the list. Only approved profiles, public details only. The server hides blocked people
 * and (unless asked) people of my own gotra. You can search only once your own profile is approved.
 */
export default function Search() {
  const [f, setF] = useState<SearchFilters>({ gender: 'female', ageMin: '', ageMax: '', district: '', sameGotra: false });
  const [items, setItems] = useState<PublicProfile[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const seq = useRef(0);
  const seeded = useRef(false);

  const load = useCallback(async (filters: SearchFilters, offset: number) => {
    const my = ++seq.current;
    setLoading(true);
    setMsg('');
    try {
      const r = await searchProfiles(filters, offset);
      if (my !== seq.current) return;
      setItems((cur) => (offset ? [...cur, ...r.items] : r.items));
      setNext(r.next_offset);
    } catch (e) {
      if (my === seq.current) {
        setMsg(errorText(e));
        if (!offset) setItems([]);
      }
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    (async () => {
      let g: Gender = 'female';
      try {
        g = defaultSeeking((await getMyProfile()).profile?.gender ?? null);
      } catch { /* offline: the search below reports it */ }
      const nf = { ...f, gender: g };
      setF(nf);
      void load(nf, 0);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- once, on open

  const header = (
    <View style={styles.head}>
      <Card>
        <Text style={type.bodyBold}>किसे खोज रहे हैं?</Text>
        <View style={styles.wrap}>
          {(['female', 'male'] as const).map((id) => (
            <BigButton key={id} testID={`rs-gender-${id}`} compact tone="plain" selected={f.gender === id} label={GENDER_LABEL[id]} onPress={() => setF({ ...f, gender: id })} />
          ))}
        </View>
        <View style={styles.wrap}>
          <View style={styles.half}><Field testID="rs-agemin" label="उम्र से" value={f.ageMin} onChangeText={(t) => setF({ ...f, ageMin: t })} keyboardType="number-pad" maxLength={2} /></View>
          <View style={styles.half}><Field testID="rs-agemax" label="उम्र तक" value={f.ageMax} onChangeText={(t) => setF({ ...f, ageMax: t })} keyboardType="number-pad" maxLength={2} /></View>
        </View>
        <Field testID="rs-district" label="ज़िला (मर्ज़ी से)" value={f.district} onChangeText={(t) => setF({ ...f, district: t })} maxLength={60} />
        <ConsentCheck checked={f.sameGotra} onChange={(v) => setF({ ...f, sameGotra: v })} label="अपने गोत्र के लोग भी दिखाएँ" />
        <BigButton testID="btn-rishtey-find" tone="primary" icon="search" label="खोजें" onPress={() => void load(f, 0)} disabled={loading} />
      </Card>
      <SettingRow icon="families" label="आई और भेजी हुई रुचि" sub="किसने आपमें रुचि दिखाई" onPress={() => go('/rishtey/interests')} />
      {msg ? <Text style={[type.bodyBold, styles.bad]} accessibilityLiveRegion="polite">{msg}</Text> : null}
    </View>
  );

  return (
    <Screen title="रिश्ते खोजें" scroll={false}>
      <FlatList
        data={items}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={header}
        renderItem={({ item }) => <ProfileRow p={item} onPress={() => go(`/rishtey/${item.id}`)} />}
        ItemSeparatorComponent={Sep}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={loading || msg ? null : <EmptyState icon="families" text="अभी कोई प्रोफ़ाइल नहीं मिली। फ़िल्टर बदलकर देखें।" />}
        ListFooterComponent={next !== null ? <BigButton tone="plain" label={loading ? 'आ रहा है…' : 'और दिखाएँ'} onPress={() => void load(f, next)} disabled={loading} /> : null}
      />
    </Screen>
  );
}

const Sep = () => <View style={styles.sep} />;

const styles = StyleSheet.create({
  list: { paddingHorizontal: GUTTER, paddingBottom: spacing.xl },
  head: { gap: spacing.md, paddingBottom: spacing.md },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  half: { flex: 1, minWidth: 130 },
  sep: { height: spacing.sm },
  bad: { color: colors.given },
});
