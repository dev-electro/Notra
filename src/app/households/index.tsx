import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { BigButton } from '@/components/big-button';
import { Field } from '@/components/field';
import { HOUSEHOLD_ROW_HEIGHT, HouseholdRow } from '@/components/household-row';
import { Screen } from '@/components/screen';
import type { Household } from '@/core';
import { searchHouseholds } from '@/db';
import { useLoad } from '@/hooks/use-load';
import { go } from '@/nav';
import { spacing } from '@/theme';

const PAGE = 40;
const keyOf = (h: Household) => h.id;
const layout = (_: unknown, index: number) => ({ length: HOUSEHOLD_ROW_HEIGHT, offset: HOUSEHOLD_ROW_HEIGHT * index, index });

export default function Households() {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(query);
      setLimit(PAGE);
    }, 150);
    return () => clearTimeout(t);
  }, [query]);

  const { data } = useLoad((db) => searchHouseholds(db, debounced, limit), [] as Household[]);
  const open = useCallback((h: Household) => go(`/households/${h.id}`), []);
  const renderItem = useCallback(({ item }: { item: Household }) => <HouseholdRow household={item} onPress={open} />, [open]);
  const more = useCallback(() => setLimit((l) => (data.length >= l ? l + PAGE : l)), [data.length]);

  return (
    <Screen title="परिवार" scroll={false}>
      <View style={styles.top}>
        <Field label="खोजें (नाम, पिता, गाँव)" value={query} onChangeText={setQuery} />
        <BigButton icon="＋" label="नया परिवार" onPress={() => go('/households/edit')} />
      </View>
      <FlatList
        data={data}
        keyExtractor={keyOf}
        renderItem={renderItem}
        getItemLayout={layout}
        initialNumToRender={10}
        windowSize={5}
        maxToRenderPerBatch={10}
        removeClippedSubviews
        onEndReached={more}
        onEndReachedThreshold={0.5}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.list}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { gap: spacing.sm, paddingLeft: 44, paddingRight: spacing.md, paddingBottom: spacing.sm },
  list: { paddingLeft: 44, paddingRight: spacing.md, paddingBottom: spacing.xl },
});
