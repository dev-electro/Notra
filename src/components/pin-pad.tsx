import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { colors, spacing, type } from '@/theme';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'] as const;
const LENGTH = 4;

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
      if (k === '⌫') return setDigits((d) => d.slice(0, -1));
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
      <View style={styles.grid}>
        {KEYS.map((k, i) =>
          k === '' ? (
            <View key={i} style={styles.key} />
          ) : (
            <Pressable
              key={i}
              accessibilityRole="button"
              accessibilityLabel={k === '⌫' ? 'आख़िरी अंक मिटाएँ' : k}
              disabled={disabled}
              onPress={() => press(k)}
              style={({ pressed }) => [styles.key, styles.keyBtn, pressed && styles.pressed, disabled && styles.disabled]}
            >
              <Text style={styles.keyText} importantForAccessibility="no">
                {k}
              </Text>
            </Pressable>
          ),
        )}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: spacing.lg, alignItems: 'center' },
  dots: { flexDirection: 'row', gap: spacing.md, minHeight: 32 },
  dot: { width: spacing.lg + spacing.xs, height: spacing.lg + spacing.xs, borderRadius: spacing.md, borderWidth: 3, borderColor: colors.inkBlue, backgroundColor: 'transparent' },
  dotOn: { backgroundColor: colors.inkBlue },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, width: '100%' },
  key: { width: '31.5%', height: 72 },
  keyBtn: { borderRadius: 14, borderWidth: 2, borderColor: colors.inkBlue, backgroundColor: colors.card, justifyContent: 'center', alignItems: 'center' },
  pressed: { backgroundColor: colors.rule },
  disabled: { opacity: 0.4 },
  keyText: { ...type.amount, color: colors.inkBlue },
});
