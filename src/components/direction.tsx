import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon } from '@/components/icons';
import { Text } from '@/components/text';
import type { Direction } from '@/core';
import { colors, spacing, type } from '@/theme';

/** मिला (आया) = received = indigo + arrow down; दिया (गया) = given = kumkum + arrow up. Colour is never the only cue. */
export const DIRECTION_WORD: Record<Direction, string> = { AAYA: 'मिला', GAYA: 'दिया' };
/** The same words paired with the older word, for the first time a person meets them on a screen. */
export const DIRECTION_PAIRED: Record<Direction, string> = { AAYA: 'मिला (आया)', GAYA: 'दिया (गया)' };
export const DIRECTION_INK: Record<Direction, string> = { AAYA: colors.received, GAYA: colors.given };
export const DIRECTION_TINT: Record<Direction, string> = { AAYA: colors.receivedTint, GAYA: colors.givenTint };

interface Props {
  direction: Direction;
  /** Show "मिला (आया)" instead of just "मिला". */
  paired?: boolean;
  color?: string;
  iconSize?: number;
}

/** Arrow + word in the direction's ink. */
export const DirectionTag = React.memo(function DirectionTag({ direction, paired, color, iconSize = 22 }: Props) {
  const ink = color ?? DIRECTION_INK[direction];
  return (
    <View style={styles.row}>
      <Icon name={direction === 'AAYA' ? 'arrowDown' : 'arrowUp'} size={iconSize} color={ink} strokeWidth={2.5} />
      <Text style={[type.bodyBold, { color: ink }]} numberOfLines={1}>
        {paired ? DIRECTION_PAIRED[direction] : DIRECTION_WORD[direction]}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs } });
