import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { colors, MIN_TOUCH, spacing, type } from '@/theme';

interface Props {
  title: string;
  subtitle: string;
  amount: string;
  ink: 'blue' | 'red';
  onPress?: () => void;
}

/** Big tappable card. Ink colour marks direction only; never a warning colour. */
export function TotalCard({ title, subtitle, amount, ink, onPress }: Props) {
  const color = ink === 'blue' ? colors.inkBlue : colors.inkRed;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${amount}`}
      accessibilityHint="पूरी सूची खोलें"
      onPress={onPress}
      style={({ pressed }) => [styles.card, { borderColor: color }, pressed && styles.pressed]}
    >
      <View>
        <Text style={[styles.title, { color }]}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
      <Text style={[styles.amount, { color }]} adjustsFontSizeToFit numberOfLines={1}>
        {amount}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: MIN_TOUCH * 2.5,
    borderWidth: 3,
    borderRadius: 16,
    backgroundColor: colors.card,
    padding: spacing.md,
    justifyContent: 'space-between',
  },
  pressed: { opacity: 0.8 },
  title: type.label,
  subtitle: { ...type.body, color: colors.textMuted },
  amount: { ...type.amount, textAlign: 'right' },
});
