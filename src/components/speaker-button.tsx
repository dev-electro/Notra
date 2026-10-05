import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Text } from '@/components/text';
import { speak } from '@/services/speech';
import { colors, MIN_TOUCH } from '@/theme';

interface Props {
  /** What this screen is for, in plain Hindi. Spoken aloud when the button is tapped. */
  text: string;
}

/** Small round speaker button: tap to hear what this screen is for (for people who read slowly). */
export const SpeakerButton = React.memo(function SpeakerButton({ text }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="इस स्क्रीन के बारे में सुनें"
      accessibilityHint="यह स्क्रीन किस काम की है, यह बोलकर बताता है"
      onPress={() => void speak(text)}
      style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
    >
      <Text style={styles.icon} importantForAccessibility="no">
        🔊
      </Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  btn: {
    width: MIN_TOUCH - 8,
    height: MIN_TOUCH - 8,
    borderRadius: (MIN_TOUCH - 8) / 2,
    borderWidth: 3,
    borderColor: colors.inkRed,
    backgroundColor: colors.card,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pressed: { opacity: 0.7 },
  icon: { fontSize: 26 },
});
