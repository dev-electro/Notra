import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { EmptyState } from '@/components/empty-state';
import { Field } from '@/components/field';
import { HOUSEHOLD_ROW_HEIGHT, HouseholdRow } from '@/components/household-row';
import { listContent, Screen } from '@/components/screen';
import type { Household } from '@/core';
import { searchHouseholds } from '@/db';
import { useLoad } from '@/hooks/use-load';
import { go } from '@/nav';
import { GUTTER, spacing } from '@/theme';

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

  const { data, loading } = useLoad((db) => searchHouseholds(db, debounced, limit), [] as Household[]);
  const open = useCallback((h: Household) => go(`/households/${h.id}`), []);
  const renderItem = useCallback(({ item }: { item: Household }) => <HouseholdRow household={item} onPress={open} />, [open]);
  const more = useCallback(() => setLimit((l) => (data.length >= l ? l + PAGE : l)), [data.length]);
  const empty = !loading && data.length === 0 && !debounced;

  return (
    <Screen
      title="परिवार"
      scroll={false}
      action={{ testID: 'btn-new-household', icon: 'plus', label: empty ? 'पहला परिवार जोड़ें' : 'नया परिवार', onPress: () => go('/households/edit') }}
    >
      <View style={styles.top}>
        <Field testID="family-search" label="खोजें (नाम, पिता, गाँव, मोबाइल)" value={query} onChangeText={setQuery} />
      </View>
      <FlatList
        data={data}
        keyExtractor={keyOf}
        renderItem={renderItem}
        getItemLayout={layout}
        ListEmptyComponent={loading ? null : <EmptyState icon="families" text={debounced ? 'कोई परिवार नहीं मिला' : 'अभी कोई परिवार नहीं'} />}
        initialNumToRender={10}
        windowSize={5}
        maxToRenderPerBatch={10}
        removeClippedSubviews
        onEndReached={more}
        onEndReachedThreshold={0.5}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={listContent}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { gap: spacing.sm, paddingHorizontal: GUTTER, paddingBottom: spacing.md },
});
