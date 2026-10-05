import React from 'react';
import { FlatList, StyleSheet, View, type ListRenderItem } from 'react-native';
import { useAdRows } from '@/ads/use-ad-rows';
import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import type { IconName } from '@/components/icons';
import { listContent, Screen } from '@/components/screen';
import { Text } from '@/components/text';
import type { ReportTotal, Tone } from '@/core';
import { BORDER, colors, radius, spacing, type } from '@/theme';

export const TONE_INK: Record<Tone, string> = { received: colors.received, given: colors.given, ink: colors.ink, muted: colors.muted };

/** The totals box at the top of a report: one label + value per line. */
export function SummaryCard({ lines }: { lines: ReportTotal[] }) {
  return (
    <Card style={styles.summary}>
      {lines.map((l) => (
        <View key={l.label} style={styles.line} accessible accessibilityLabel={`${l.label}, ${l.value}`}>
          <Text style={[type.body, styles.flex]}>{l.label}</Text>
          <Text style={[type.money, { color: TONE_INK[l.tone ?? 'ink'] }]}>{l.value}</Text>
        </View>
      ))}
    </Card>
  );
}

/** One row of a report as a flat card; children are the lines. */
export function RowCard({ children, testID }: { children: React.ReactNode; testID?: string }) {
  return (
    <View style={styles.row} testID={testID}>
      {children}
    </View>
  );
}

interface ShellProps<T> {
  title: string;
  header: React.ReactElement;
  data: T[];
  loading: boolean;
  keyOf: (item: T, i: number) => string;
  renderItem: ListRenderItem<T>;
  onEnd?: () => void;
  emptyIcon?: IconName;
  emptyText: string;
  onBack?: () => void;
}

/** Screen + paged list for a report: filters/totals/export sit in the header and scroll away. */
export function ReportShell<T>({ title, header, data, loading, keyOf, renderItem, onEnd, emptyIcon = 'hisaab', emptyText, onBack }: ShellProps<T>) {
  const ad = useAdRows(data, 'report_list', title, keyOf, renderItem);
  return (
    <Screen title={title} scroll={false} onBack={onBack}>
      <FlatList
        data={ad.rows}
        keyExtractor={ad.keyExtractor}
        renderItem={ad.renderItem}
        ListHeaderComponent={<View style={styles.header}>{header}</View>}
        ListEmptyComponent={loading ? null : <EmptyState icon={emptyIcon} text={emptyText} />}
        ItemSeparatorComponent={Gap}
        initialNumToRender={10}
        windowSize={5}
        maxToRenderPerBatch={10}
        removeClippedSubviews
        onEndReached={onEnd}
        onEndReachedThreshold={0.5}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={listContent}
      />
    </Screen>
  );
}
const Gap = () => <View style={styles.gap} />;

const styles = StyleSheet.create({
  summary: { gap: spacing.xs },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
  flex: { flex: 1 },
  header: { gap: spacing.md, paddingBottom: spacing.md },
  gap: { height: spacing.sm },
  row: { gap: 2, padding: spacing.md, backgroundColor: colors.card, borderWidth: BORDER, borderColor: colors.hairline, borderRadius: radius.card },
});
