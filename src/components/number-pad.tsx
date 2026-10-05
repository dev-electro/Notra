import React, { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '@/theme';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', '⌫'] as const;
const MAX_DIGITS = 7;

interface Props {
  /** Rupee digits typed so far, e.g. "501". */
  value: string;
  onChange: (next: string) => void;
}

/** Large custom number pad (keys 72dp). Returns rupee digits as a string; no decimal point. */
export const NumberPad = React.memo(function NumberPad({ value, onChange }: Props) {
  const press = useCallback(
    (k: string) => {
      if (k === '⌫') return onChange(value.slice(0, -1));
      const next = (value + k).replace(/^0+/, '');
      if (next.length <= MAX_DIGITS) onChange(next);
    },
    [value, onChange],
  );
  return (
    <View style={styles.grid}>
      {KEYS.map((k) => (
        <Pressable
          key={k}
          accessibilityRole="button"
          accessibilityLabel={k === '⌫' ? 'मिटाएँ' : k}
          onPress={() => press(k)}
          style={({ pressed }) => [styles.key, pressed && styles.pressed]}
        >
          <Text style={styles.keyText}>{k}</Text>
        </Pressable>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  key: {
    width: '31.5%',
    height: 72,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.inkBlue,
    backgroundColor: colors.card,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pressed: { backgroundColor: colors.rule },
  keyText: { fontSize: 34, fontWeight: '700', color: colors.inkBlue },
});
