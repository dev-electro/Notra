import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { formatINR, rupeesInWords } from '@/core';
import { colors, spacing, type } from '@/theme';

interface Props {
  rupees: number;
  /** Ink of the amount (indigo for मिला, kumkum for दिया). */
  color: string;
  /** Shown instead of the words while nothing is typed. */
  placeholder?: string;
}

/** The sum typed so far: huge digits, and the same sum in Hindi words underneath (e.g. "पाँच सौ एक रुपये"). */
export const AmountDisplay = React.memo(function AmountDisplay({ rupees, color, placeholder = 'नीचे से रकम दबाएँ' }: Props) {
  const words = rupeesInWords(rupees);
  return (
    <View style={styles.wrap}>
      <Text style={[type.amountXL, { color }]} adjustsFontSizeToFit numberOfLines={1}>
        {formatINR(rupees * 100)}
      </Text>
      <Text style={[type.body, styles.words]} numberOfLines={3}>
        {words || placeholder}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: spacing.xs },
  words: { color: colors.muted, textAlign: 'center', minHeight: 60 },
});
