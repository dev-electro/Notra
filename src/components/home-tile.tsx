import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon, type IconName } from '@/components/icons';
import { PressableScale } from '@/components/pressable-scale';
import { Text } from '@/components/text';
import { BORDER, colors, radius, spacing, type } from '@/theme';

export type TileTone = 'haldi' | 'given' | 'received' | 'success';
const TONE: Record<TileTone, { bg: string; fg: string }> = {
  haldi: { bg: colors.haldiTint, fg: colors.ink },
  given: { bg: colors.givenTint, fg: colors.given },
  received: { bg: colors.receivedTint, fg: colors.received },
  success: { bg: colors.successTint, fg: colors.successInk },
};

interface Props {
  icon: IconName;
  /** One plain word or short phrase. */
  word: string;
  /** Few words under it. */
  sub: string;
  tone: TileTone;
  onPress: () => void;
}

/** Big picture tile for Home: round tinted icon, one word, one small line. */
export const HomeTile = React.memo(function HomeTile({ icon, word, sub, tone, onPress }: Props) {
  const c = TONE[tone];
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={word}
      accessibilityHint={sub}
      onPress={onPress}
      outerStyle={styles.outer}
      style={styles.tile}
    >
      <View style={[styles.disc, { backgroundColor: c.bg }]}>
        <Icon name={icon} size={36} color={c.fg} />
      </View>
      <Text style={[type.heading, styles.word]} numberOfLines={2}>
        {word}
      </Text>
      <Text style={[type.caption, styles.sub]} numberOfLines={2}>
        {sub}
      </Text>
    </PressableScale>
  );
});

const DISC = 64;
const styles = StyleSheet.create({
  outer: { flexBasis: '47%', flexGrow: 1 },
  tile: {
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.md,
    backgroundColor: colors.card,
    borderWidth: BORDER,
    borderColor: colors.hairline,
    borderRadius: radius.card,
  },
  disc: { width: DISC, height: DISC, borderRadius: DISC / 2, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs },
  word: { color: colors.ink, textAlign: 'center' },
  sub: { color: colors.muted, textAlign: 'center' },
});
