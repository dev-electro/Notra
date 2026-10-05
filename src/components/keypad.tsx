import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon } from '@/components/icons';
import { PressableScale } from '@/components/pressable-scale';
import { Text } from '@/components/text';
import { tapLight, warmHaptics } from '@/services/haptics';
import { BORDER, colors, radius, spacing, type } from '@/theme';

export const KEY_BACK = '⌫';
const KEY_HEIGHT = 64;

interface Props {
  /** Key labels in reading order; '' leaves a gap; KEY_BACK is the erase key. */
  keys: readonly string[];
  onKey: (k: string) => void;
  disabled?: boolean;
}

/** Big rounded keys (64dp) with a light tick on each tap. Shared by the amount pad and the PIN pad. */
export const Keypad = React.memo(function Keypad({ keys, onKey, disabled }: Props) {
  useEffect(() => warmHaptics(), []);
  return (
    <View style={styles.grid}>
      {keys.map((k, i) =>
        k === '' ? (
          <View key={i} style={styles.slot} />
        ) : (
          <PressableScale
            key={i}
            testID={k === KEY_BACK ? 'key-back' : `key-${k}`}
            accessibilityRole="button"
            accessibilityLabel={k === KEY_BACK ? 'आख़िरी अंक मिटाएँ' : k}
            disabled={disabled}
            outerStyle={styles.slot}
            style={[styles.key, k === KEY_BACK && styles.erase, disabled && styles.disabled]}
            onPress={() => {
              tapLight();
              onKey(k);
            }}
          >
            {k === KEY_BACK ? (
              <Icon name="backspace" size={32} color={colors.given} />
            ) : (
              <Text style={[type.key, { color: colors.ink }]} importantForAccessibility="no">
                {k}
              </Text>
            )}
          </PressableScale>
        ),
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  slot: { width: '31.5%', flexGrow: 1, height: KEY_HEIGHT },
  key: {
    height: KEY_HEIGHT,
    borderRadius: radius.button,
    borderWidth: BORDER,
    borderColor: colors.hairline,
    backgroundColor: colors.card,
    justifyContent: 'center',
    alignItems: 'center',
  },
  erase: { backgroundColor: colors.givenTint },
  disabled: { opacity: 0.4 },
});
