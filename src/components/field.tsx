import React, { useState } from 'react';
import { StyleSheet, View, type TextInputProps } from 'react-native';
import { Text, TextInput } from '@/components/text';
import { colors, MIN_TOUCH, radius, spacing, type } from '@/theme';

interface Props extends TextInputProps {
  label: string;
  /** Icon drawn inside the box, at the start. */
  leading?: React.ReactNode;
}

/** Labelled text box: the label sits above in bold, the box has a clear border that thickens when it is being typed in. */
export function Field({ label, leading, style, onFocus, onBlur, ...rest }: Props) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.wrap}>
      <Text style={[type.bodyBold, styles.label]}>{label}</Text>
      <View>
      {leading ? <View style={styles.leading} pointerEvents="none">{leading}</View> : null}
      <TextInput
        {...rest}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[styles.input, leading ? styles.withLeading : null, focused && styles.focused, style]}
        placeholderTextColor={colors.muted}
        accessibilityLabel={label}
      />
      </View>
    </View>
  );
}

export const inputStyle = {
  minHeight: MIN_TOUCH,
  borderWidth: 1.5,
  borderColor: colors.outline,
  borderRadius: radius.card,
  backgroundColor: colors.card,
  paddingHorizontal: spacing.md,
  ...type.body,
  fontSize: 22,
  color: colors.ink,
} as const;

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  label: { color: colors.ink },
  input: inputStyle,
  leading: { position: 'absolute', left: spacing.md, top: 0, bottom: 0, justifyContent: 'center', zIndex: 1 },
  withLeading: { paddingLeft: spacing.md + 24 + spacing.sm },
  focused: { borderColor: colors.received, borderWidth: 3 },
});
