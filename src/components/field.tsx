import React from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { colors, MIN_TOUCH, spacing } from '@/theme';

interface Props extends TextInputProps {
  label: string;
}

/** Labelled text box (label in the paper-diary column order). */
export function Field({ label, style, ...rest }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...rest}
        style={[styles.input, style]}
        placeholderTextColor={colors.textMuted}
        accessibilityLabel={label}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  label: { fontSize: 20, lineHeight: 28, fontWeight: '700', color: colors.inkBlue },
  input: {
    minHeight: MIN_TOUCH,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    fontSize: 24,
    color: colors.text,
  },
});
