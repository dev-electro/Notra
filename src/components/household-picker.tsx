import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { BigButton } from '@/components/big-button';
import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { Field } from '@/components/field';
import { HOUSEHOLD_ROW_HEIGHT, HouseholdRow } from '@/components/household-row';
import { BottomBar, listContent } from '@/components/screen';
import { Text } from '@/components/text';
import { VoiceButton } from '@/components/voice-button';
import { resolveVoiceEntry, type Household, type ResolvedVoiceEntry } from '@/core';
import { createHousehold, getDb, listHouseholds, searchHouseholds, type Db } from '@/db';
import { colors, spacing, type } from '@/theme';

const PAGE = 30;

interface Props {
  /** amountRupees is set when the choice came from a spoken entry. */
  onPick: (h: Household, amountRupees?: number) => void;
  /** Lets a caller add content (e.g. a title) above the search box. */
  headline?: string;
  /** Any content above everything else; it scrolls with the list (e.g. the running total of an event ledger). */
  top?: React.ReactNode;
}

const keyOf = (h: Household) => h.id;
const layout = (_: unknown, index: number) => ({ length: HOUSEHOLD_ROW_HEIGHT, offset: HOUSEHOLD_ROW_HEIGHT * index, index });

/**
 * Pick a household: search (name / father / village), speak, or quick-add name + father + village.
 * Voice results are only suggestions; the user taps the right family (or adds a new one).
 * The bottom button adds a new family (the one main action here); choosing is done by tapping a row.
 */
export function HouseholdPicker({ onPick, headline, top }: Props) {
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
        {top}
        {headline ? <Text style={[type.heading, styles.headline]}>{headline}</Text> : null}
        <Field testID="picker-search" label="खोजें (नाम, पिता, गाँव, मोबाइल)" value={query} onChangeText={onSearch} />
        <VoiceButton onTranscript={onTranscript} />
        {voice ? (
          <Card tint="haldi" style={styles.voiceBox}>
            <Text style={[type.bodyBold, styles.voiceTitle]}>
              {voice.matches.length ? 'क्या ये वही हैं? चुनें' : 'नया परिवार जोड़ें'}
              {voice.parsed.amountRupees ? `  (₹${voice.parsed.amountRupees})` : ''}
            </Text>
            {voice.matches.map((m) => (
              <HouseholdRow key={m.household.id} household={m.household} onPress={pick} />
            ))}
          </Card>
        ) : null}
        {adding ? (
          <Card style={styles.addBox}>
            <Field testID="picker-new-name" label="नाम" value={draft.name} onChangeText={(name) => setDraft((d) => ({ ...d, name }))} />
            <Field testID="picker-new-father" label="पिता का नाम" value={draft.father} onChangeText={(father) => setDraft((d) => ({ ...d, father }))} />
            <Field testID="picker-new-village" label="गाँव" value={draft.village} onChangeText={(village) => setDraft((d) => ({ ...d, village }))} />
            <BigButton label="रहने दें" tone="plain" onPress={() => setAdding(false)} />
          </Card>
        ) : null}
      </View>
    ),
    [top, headline, query, onSearch, onTranscript, voice, adding, draft, pick],
  );

  return (
    <View style={styles.flex}>
      <FlatList
        data={rows}
        keyExtractor={keyOf}
        renderItem={renderItem}
        getItemLayout={layout}
        ListHeaderComponent={header}
        ListEmptyComponent={query || adding ? null : <EmptyState icon="families" text="अभी कोई परिवार नहीं" />}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={10}
        windowSize={5}
        maxToRenderPerBatch={10}
        removeClippedSubviews
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        contentContainerStyle={listContent}
      />
      <BottomBar>
        {adding ? (
          <BigButton testID="btn-save" tone="primary" icon="check" label="जोड़ें" onPress={saveNew} disabled={!draft.name.trim()} />
        ) : (
          <BigButton testID="btn-new-household" tone="primary" icon="plus" label={rows.length || query ? 'नया परिवार' : 'पहला परिवार जोड़ें'} onPress={() => setAdding(true)} />
        )}
      </BottomBar>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { gap: spacing.md, paddingBottom: spacing.md },
  headline: { color: colors.ink },
  voiceBox: { gap: spacing.sm },
  voiceTitle: { color: colors.ink },
  addBox: { gap: spacing.md },
});
