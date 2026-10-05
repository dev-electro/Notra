import React from 'react';
import {
  Text as RNText, TextInput as RNTextInput, type TextInputProps, type TextProps,
} from 'react-native';

/**
 * Text that follows the phone's font-size setting, but only up to 1.3x, so big-print users get larger writing without the
 * fixed-height rows and number pad breaking. Every screen imports Text/TextInput from here, not from react-native
 * (an ESLint rule enforces it).
 */
export const MAX_FONT_SCALE = 1.3;

export const Text = React.forwardRef<RNText, TextProps>(function Text(props, ref) {
  return <RNText ref={ref} maxFontSizeMultiplier={MAX_FONT_SCALE} {...props} />;
});

export const TextInput = React.forwardRef<RNTextInput, TextInputProps>(function TextInput(props, ref) {
  return <RNTextInput ref={ref} maxFontSizeMultiplier={MAX_FONT_SCALE} {...props} />;
});
