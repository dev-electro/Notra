import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { DIRECTION_LABEL, displayDate, entryValuePaise, formatINR } from '@/core';
import type { EntryWithState } from '@/db';
import { colors, MIN_TOUCH, spacing } from '@/theme';

export const ENTRY_ROW_HEIGHT = 112;

interface Props {
  entry: EntryWithState;
  showWho?: boolean;
  onPress?: (e: EntryWithState) => void;
  /** Label of the small action button (e.g. "सुधारें"); shown only for entries that still count. */
  actionLabel?: string;
  onAction?: (e: EntryWithState) => void;
}

/** One ledger line: ink colour = direction; corrected (superseded) lines are greyed, never deleted. */
export const EntryRow = React.memo(function EntryRow({ entry: e, showWho, onPress, actionLabel, onAction }: Props) {
  const ink = e.direction === 'AAYA' ? colors.inkBlue : colors.inkRed;
  const muted = e.superseded;
  const detail = [displayDate(e.createdAt), e.inKindItem, e.correctsEntryId ? 'सुधारी हुई' : '', muted ? 'बदली गई' : '']
    .filter(Boolean)
    .join(' · ');
  return (
    <Pressable onPress={onPress ? () => onPress(e) : undefined} style={[styles.row, muted && styles.muted]}>
      <View style={styles.main}>
        <Text style={[styles.top, { color: muted ? colors.neutral : ink }]} numberOfLines={1}>
          {DIRECTION_LABEL[e.direction]}
          {showWho ? `  ${e.who.headName}` : ''}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {showWho ? `${[e.who.fatherName && `${e.who.fatherName} का`, e.who.village].filter(Boolean).join(' · ')} — ` : ''}
          {detail}
        </Text>
      </View>
      <View style={styles.side}>
        <Text style={[styles.amount, { color: muted ? colors.neutral : ink }, muted && styles.struck]}>
          {formatINR(entryValuePaise(e))}
        </Text>
        {actionLabel && onAction && !muted ? (
          <Pressable accessibilityRole="button" hitSlop={{ top: 8, bottom: 8 }} onPress={() => onAction(e)} style={styles.action}>
            <Text style={styles.actionText}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    height: ENTRY_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.rule,
  },
  muted: { opacity: 0.6 },
  main: { flex: 1 },
  top: { fontSize: 22, lineHeight: 30, fontWeight: '700' },
  sub: { fontSize: 16, lineHeight: 24, color: colors.textMuted },
  side: { alignItems: 'flex-end' },
  amount: { fontSize: 26, fontWeight: '700' },
  struck: { textDecorationLine: 'line-through' },
  action: { minHeight: MIN_TOUCH - 16, minWidth: MIN_TOUCH, justifyContent: 'center', paddingHorizontal: spacing.sm },
  actionText: { fontSize: 18, color: colors.inkBlue, fontWeight: '700', textDecorationLine: 'underline' },
});
