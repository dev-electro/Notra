import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { formatINR, rupeesInWords } from '@/core';
import { BORDER_TONE, colors, radius, spacing, type } from '@/theme';

interface Props {
  rupees: number;
  /** Ink of the amount (indigo for मिला, kumkum for दिया). */
  color: string;
  /** Shown instead of the words while nothing is typed. */
  placeholder?: string;
}

/** The sum typed so far, drawn like an input box (outline + blinking caret), and the same sum in Hindi words underneath. */
export const AmountDisplay = React.memo(function AmountDisplay({ rupees, color, placeholder = 'नीचे से रकम दबाएँ' }: Props) {
  const words = rupeesInWords(rupees);
  const blink = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(blink, { toValue: 0, duration: 500, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [blink]);
  return (
    <View style={styles.wrap}>
      <View style={[styles.box, { borderColor: color }]}>
        <Text style={[type.amountXL, styles.amt, { color }]} adjustsFontSizeToFit numberOfLines={1}>
          {formatINR(rupees * 100)}
        </Text>
        <Animated.View style={[styles.caret, { backgroundColor: color, opacity: blink }]} />
      </View>
      <Text style={[type.body, styles.words]} numberOfLines={3}>
        {words || placeholder}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { alignItems: 'stretch', gap: spacing.xs },
  box: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, minHeight: 72,
    borderWidth: BORDER_TONE, borderRadius: radius.button, backgroundColor: colors.card, paddingHorizontal: spacing.md,
  },
  amt: { flexShrink: 1 },
  caret: { width: 3, height: 40, borderRadius: 2 },
  words: { color: colors.muted, textAlign: 'center', minHeight: 54 },
});
