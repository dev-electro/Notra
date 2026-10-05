import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { KEY_BACK, Keypad } from '@/components/keypad';
import { BORDER_TONE, colors, spacing } from '@/theme';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', KEY_BACK] as const;
const LENGTH = 4;
const DOT = 28;

interface Props {
  /** Called once with the 4 digits; the pad clears itself right after. */
  onComplete: (pin: string) => void;
  disabled?: boolean;
}

/** Big 4-digit PIN pad with filled dots. Digits are never shown on screen. */
export const PinPad = React.memo(function PinPad({ onComplete, disabled }: Props) {
  const [digits, setDigits] = useState('');
  const press = useCallback(
    (k: string) => {
      if (disabled) return;
      if (k === KEY_BACK) return setDigits((d) => d.slice(0, -1));
      const next = digits + k;
      if (next.length < LENGTH) return setDigits(next);
      setDigits('');
      onComplete(next);
    },
    [digits, disabled, onComplete],
  );
  return (
    <View style={styles.wrap}>
      <View style={styles.dots} accessibilityLabel={`${digits.length} अंक डाले, कुल ${LENGTH}`} accessible>
        {Array.from({ length: LENGTH }, (_, i) => (
          <View key={i} style={[styles.dot, i < digits.length && styles.dotOn]} />
        ))}
      </View>
      <Keypad keys={KEYS} onKey={press} disabled={disabled} />
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: spacing.lg },
  dots: { flexDirection: 'row', gap: spacing.md, justifyContent: 'center', minHeight: DOT },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2, borderWidth: BORDER_TONE, borderColor: colors.received, backgroundColor: 'transparent' },
  dotOn: { backgroundColor: colors.received },
});
