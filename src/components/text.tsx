import React from 'react';
import {
  Text as RNText, TextInput as RNTextInput, type TextInputProps, type TextProps,
} from 'react-native';
import { colors, type } from '@/theme';

/**
 * Text that follows the phone's font-size setting, but only up to 1.3x, so big-print users get larger writing without the
 * fixed-height rows and number pad breaking. Every screen imports Text/TextInput from here, not from react-native
 * (an ESLint rule enforces it). Defaults: Mukta Medium, body size, ink colour; pass a style from the theme to change it.
 */
export const MAX_FONT_SCALE = 1.3;

const base = { ...type.body, color: colors.ink };

export const Text = React.forwardRef<RNText, TextProps>(function Text({ style, ...rest }, ref) {
  return <RNText ref={ref} maxFontSizeMultiplier={MAX_FONT_SCALE} style={[base, style]} {...rest} />;
});

export const TextInput = React.forwardRef<RNTextInput, TextInputProps>(function TextInput({ style, ...rest }, ref) {
  return <RNTextInput ref={ref} maxFontSizeMultiplier={MAX_FONT_SCALE} style={[base, style]} {...rest} />;
});
