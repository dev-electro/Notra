import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Text } from '@/components/text';
import { colors, MIN_TOUCH, spacing } from '@/theme';

interface Props {
  label: string;
  onPress: () => void;
  icon?: string;
  tone?: 'blue' | 'red' | 'plain';
  selected?: boolean;
  disabled?: boolean;
  /** Half-width style for rows of two. */
  compact?: boolean;
  /** Spoken by TalkBack after the label; say what happens when the button is pressed. */
  hint?: string;
  /** Override the spoken label (default: the visible label, without the decorative icon). */
  accessibilityLabel?: string;
}

/** Big (>=64dp) diary-style button. Ink colour = direction/emphasis; never a warning colour. */
export const BigButton = React.memo(function BigButton({
  label, onPress, icon, tone = 'blue', selected, disabled, compact, hint, accessibilityLabel,
}: Props) {
  const ink = tone === 'red' ? colors.inkRed : tone === 'plain' ? colors.text : colors.inkBlue;
  const filled = selected === true;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={hint}
      accessibilityState={{ selected: filled, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        compact && styles.compact,
        { borderColor: ink, backgroundColor: filled ? ink : colors.card },
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.label, { color: filled ? colors.card : ink }]} numberOfLines={2}>
        {icon ? `${icon}  ` : ''}
        {label}
      </Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  btn: {
    minHeight: MIN_TOUCH,
    borderWidth: 3,
    borderRadius: 14,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  compact: { flexGrow: 1, flexBasis: '45%' },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.4 },
  label: { fontSize: 22, lineHeight: 30, fontWeight: '700', textAlign: 'center' },
});
