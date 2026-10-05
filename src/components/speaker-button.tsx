import React from 'react';
import { StyleSheet } from 'react-native';
import { Icon } from '@/components/icons';
import { PressableScale } from '@/components/pressable-scale';
import { speak } from '@/services/speech';
import { BORDER, colors, MIN_TOUCH, radius } from '@/theme';

interface Props {
  /** What this screen is for, in plain Hindi. Spoken aloud when the button is tapped. */
  text: string;
}

/** Speaker button: tap to hear what this screen is for (for people who read slowly). */
export const SpeakerButton = React.memo(function SpeakerButton({ text }: Props) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel="इस स्क्रीन के बारे में सुनें"
      accessibilityHint="यह स्क्रीन किस काम की है, यह बोलकर बताता है"
      onPress={() => void speak(text)}
      outerStyle={styles.outer}
      style={styles.btn}
    >
      <Icon name="speaker" size={30} color={colors.given} />
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  outer: { width: MIN_TOUCH, height: MIN_TOUCH },
  btn: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    borderRadius: radius.button,
    borderWidth: BORDER,
    borderColor: colors.hairline,
    backgroundColor: colors.givenTint,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
