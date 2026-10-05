import React from 'react';
import { StyleSheet, View } from 'react-native';
import { DIRECTION_INK, DirectionTag, DIRECTION_WORD } from '@/components/direction';
import { PressableScale } from '@/components/pressable-scale';
import { Text } from '@/components/text';
import { displayDate, entryDate, entryValuePaise, formatINR, LEGACY_EVENT_LABEL, occasionName, utarChadhavText } from '@/core';
import type { EntryWithState } from '@/db';
import { BORDER, colors, MIN_TOUCH, radius, spacing, type } from '@/theme';

const GAP = spacing.sm;
export const ENTRY_ROW_HEIGHT = 168 + GAP;

interface Props {
  entry: EntryWithState;
  showWho?: boolean;
  onPress?: (e: EntryWithState) => void;
  /** Label of the small action button (e.g. "सुधारें"); shown only for entries that still count. */
  actionLabel?: string;
  onAction?: (e: EntryWithState) => void;
}

/** One ledger line: arrow + word + amount. Corrected (superseded) lines are greyed and struck, never deleted. */
export const EntryRow = React.memo(function EntryRow({ entry: e, showWho, onPress, actionLabel, onAction }: Props) {
  const ink = e.direction === 'AAYA' ? colors.received : colors.given;
  const muted = e.superseded;
  const program = e.program ? (e.program.legacy ? LEGACY_EVENT_LABEL : occasionName(e.program.occasion, e.program.label)) : '';
  const detail = [displayDate(entryDate(e)), program, e.inKindItem, e.correctsEntryId ? 'सुधारी हुई' : '', muted ? 'बदली गई' : '']
    .filter(Boolean)
    .join(' · ');
  const settle = e.utarPaise !== null && e.chadhavPaise !== null ? utarChadhavText(e.utarPaise, e.chadhavPaise) : '';
  return (
    <View style={styles.cell}>
      <PressableScale
        accessibilityRole={onPress ? 'button' : 'text'}
        accessibilityLabel={`${DIRECTION_WORD[e.direction]}${showWho ? ` ${e.who.headName}` : ''}, ${formatINR(entryValuePaise(e))}${muted ? ', बदली गई' : ''}${settle ? `, ${settle}` : ''}`}
        accessibilityHint={onPress ? 'इस परिवार का पूरा हिसाब खोलें' : undefined}
        disabled={!onPress}
        onPress={onPress ? () => onPress(e) : undefined}
        outerStyle={styles.fill}
        style={[styles.row, muted && styles.muted]}
      >
        <View style={styles.main}>
          <View style={styles.top}>
            <DirectionTag direction={e.direction} color={muted ? colors.muted : DIRECTION_INK[e.direction]} />
          </View>
          {showWho ? (
            <Text style={[type.bodyBold, styles.who]} numberOfLines={1}>
              {e.who.headName}
            </Text>
          ) : null}
          <Text style={[type.caption, styles.sub]} numberOfLines={showWho ? 2 : 2}>
            {showWho ? `${[e.who.fatherName && `${e.who.fatherName} का`, e.who.village].filter(Boolean).join(' · ')} — ` : ''}
            {detail}
          </Text>
          {settle ? (
            <Text style={[type.captionBold, styles.settle]} numberOfLines={1}>
              {settle}
            </Text>
          ) : null}
        </View>
        <View style={styles.side}>
          <Text style={[type.money, { color: muted ? colors.muted : ink }, muted && styles.struck]}>{formatINR(entryValuePaise(e))}</Text>
          {actionLabel && onAction && !muted ? (
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel={`${actionLabel}: ${formatINR(entryValuePaise(e))}`}
              accessibilityHint="इस एंट्री को सुधारें"
              hitSlop={{ top: 8, bottom: 8 }}
              onPress={() => onAction(e)}
              outerStyle={styles.actionOuter}
              style={styles.action}
            >
              <Text style={[type.captionBold, styles.actionText]}>{actionLabel}</Text>
            </PressableScale>
          ) : null}
        </View>
      </PressableScale>
    </View>
  );
});

const styles = StyleSheet.create({
  fill: { flex: 1 },
  cell: { height: ENTRY_ROW_HEIGHT, paddingBottom: GAP },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.card,
    borderWidth: BORDER,
    borderColor: colors.hairline,
    borderRadius: radius.card,
  },
  muted: { opacity: 0.65 },
  main: { flex: 1 },
  top: { flexDirection: 'row' },
  who: { color: colors.ink },
  sub: { color: colors.muted },
  settle: { color: colors.ink },
  side: { alignItems: 'flex-end' },
  struck: { textDecorationLine: 'line-through' },
  actionOuter: { minHeight: MIN_TOUCH - 16, minWidth: MIN_TOUCH, justifyContent: 'center' },
  action: { minHeight: MIN_TOUCH - 16, justifyContent: 'center', alignItems: 'flex-end' },
  actionText: { color: colors.received, textDecorationLine: 'underline' },
});
