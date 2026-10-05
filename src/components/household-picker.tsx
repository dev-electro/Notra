import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { resolveVoiceEntry, type Household, type ResolvedVoiceEntry } from '@/core';
import { createHousehold, getDb, listHouseholds, searchHouseholds, type Db } from '@/db';
import { BigButton } from '@/components/big-button';
import { Field } from '@/components/field';
import { HOUSEHOLD_ROW_HEIGHT, HouseholdRow } from '@/components/household-row';
import { VoiceButton } from '@/components/voice-button';
import { colors, spacing } from '@/theme';

const PAGE = 30;

interface Props {
  /** amountRupees is set when the choice came from a spoken entry. */
  onPick: (h: Household, amountRupees?: number) => void;
  /** Lets a caller add content (e.g. a title) above the search box. */
  headline?: string;
}

const keyOf = (h: Household) => h.id;
const layout = (_: unknown, index: number) => ({ length: HOUSEHOLD_ROW_HEIGHT, offset: HOUSEHOLD_ROW_HEIGHT * index, index });

/**
 * Pick a household: search (name / father / village), speak, or quick-add name + father + village.
 * Voice results are only suggestions; the user taps the right family (or adds a new one).
 */
export function HouseholdPicker({ onPick, headline }: Props) {
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [rows, setRows] = useState<Household[]>([]);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: '', father: '', village: '' });
  const [voice, setVoice] = useState<ResolvedVoiceEntry | null>(null);

  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const db = (await getDb()) as unknown as Db;
        const r = await searchHouseholds(db, query, limit);
        if (alive) setRows(r);
      } catch {
        /* keep the previous rows */
      }
    }, 120);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [query, limit]);

  const onSearch = useCallback((t: string) => {
    setQuery(t);
    setLimit(PAGE);
  }, []);

  const amount = voice?.parsed.amountRupees;
  const pick = useCallback((h: Household) => onPick(h, amount), [onPick, amount]);

  const onTranscript = useCallback(async (text: string) => {
    try {
      const db = (await getDb()) as unknown as Db;
      const r = resolveVoiceEntry(text, await listHouseholds(db));
      setVoice(r);
      if (!r.matches.length) {
        setDraft({ name: r.parsed.name ?? '', father: r.parsed.fatherName ?? '', village: r.parsed.village ?? '' });
        setAdding(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const saveNew = useCallback(async () => {
    if (!draft.name.trim()) return;
    const db = (await getDb()) as unknown as Db;
    const h = await createHousehold(db, {
      headName: draft.name.trim(), fatherName: draft.father.trim(), village: draft.village.trim(),
      jati: '', atak: '', fala: '',
    });
    onPick(h, amount);
  }, [draft, onPick, amount]);

  const renderItem = useCallback(({ item }: { item: Household }) => <HouseholdRow household={item} onPress={pick} />, [pick]);
  const loadMore = useCallback(() => setLimit((l) => (rows.length >= l ? l + PAGE : l)), [rows.length]);

  const header = useMemo(
    () => (
      <View style={styles.header}>
        {headline ? <Text style={styles.headline}>{headline}</Text> : null}
        <Field label="खोजें (नाम, पिता, गाँव)" value={query} onChangeText={onSearch} />
        <VoiceButton onTranscript={onTranscript} />
        {voice ? (
          <View style={styles.voiceBox}>
            <Text style={styles.voiceTitle}>
              {voice.matches.length ? 'क्या ये वही हैं? चुनें' : 'नया परिवार जोड़ें'}
              {voice.parsed.amountRupees ? `  (₹${voice.parsed.amountRupees})` : ''}
            </Text>
            {voice.matches.map((m) => (
              <HouseholdRow key={m.household.id} household={m.household} onPress={pick} />
            ))}
          </View>
        ) : null}
        {adding ? (
          <View style={styles.addBox}>
            <Field label="नाम" value={draft.name} onChangeText={(name) => setDraft((d) => ({ ...d, name }))} />
            <Field label="पिता का नाम" value={draft.father} onChangeText={(father) => setDraft((d) => ({ ...d, father }))} />
            <Field label="गाँव" value={draft.village} onChangeText={(village) => setDraft((d) => ({ ...d, village }))} />
            <BigButton label="जोड़ें" icon="✔" onPress={saveNew} disabled={!draft.name.trim()} />
          </View>
        ) : (
          <BigButton label="नया परिवार" icon="＋" tone="red" onPress={() => setAdding(true)} />
        )}
      </View>
    ),
    [headline, query, onSearch, onTranscript, voice, adding, draft, pick, saveNew],
  );

  return (
    <FlatList
      data={rows}
      keyExtractor={keyOf}
      renderItem={renderItem}
      getItemLayout={layout}
      ListHeaderComponent={header}
      keyboardShouldPersistTaps="handled"
      initialNumToRender={10}
      windowSize={5}
      maxToRenderPerBatch={10}
      removeClippedSubviews
      onEndReached={loadMore}
      onEndReachedThreshold={0.5}
      contentContainerStyle={styles.list}
    />
  );
}

const styles = StyleSheet.create({
  list: { paddingLeft: 44, paddingRight: spacing.md, paddingBottom: spacing.xl * 2 },
  header: { gap: spacing.md, paddingBottom: spacing.md },
  headline: { fontSize: 24, fontWeight: '700', color: colors.text },
  voiceBox: { borderWidth: 2, borderColor: colors.inkRed, borderRadius: 12, padding: spacing.sm, backgroundColor: colors.card },
  voiceTitle: { fontSize: 20, fontWeight: '700', color: colors.inkRed },
  addBox: { gap: spacing.md, borderWidth: 2, borderColor: colors.border, borderRadius: 12, padding: spacing.sm, backgroundColor: colors.card },
});
