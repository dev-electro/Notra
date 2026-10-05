import React, { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { BORDER, colors, radius, spacing, type } from '@/theme';
import { KEY_BACK, Keypad } from '@/components/keypad';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', KEY_BACK] as const;
export const MAX_DIGITS = 7;

interface Props {
  /** Rupee digits typed so far, e.g. "501". */
  value: string;
  onChange: (next: string) => void;
}

/** Large custom number pad. Returns rupee digits as a string; no decimal point. */
export const NumberPad = React.memo(function NumberPad({ value, onChange }: Props) {
  const press = useCallback(
    (k: string) => {
      if (k === KEY_BACK) return onChange(value.slice(0, -1));
      const next = (value + k).replace(/^0+/, '');
      if (next.length <= MAX_DIGITS) onChange(next);
    },
    [value, onChange],
  );
  return (
    <View style={styles.card}>
      <Text style={[type.captionBold, styles.label]}>रकम डालें</Text>
      <Keypad keys={KEYS} onKey={press} />
    </View>
  );
});

const styles = StyleSheet.create({
  card: { backgroundColor: colors.haldiTint, borderRadius: radius.button, borderWidth: BORDER, borderColor: colors.haldi, padding: spacing.sm, gap: spacing.sm },
  label: { color: colors.ink, textAlign: 'center' },
});
