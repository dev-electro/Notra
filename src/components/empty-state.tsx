import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { IconName } from '@/components/icons';
import { BigButton } from '@/components/big-button';
import { EmptyArt } from '@/components/motifs';
import { Text } from '@/components/text';
import { colors, spacing, type } from '@/theme';

interface Props {
  icon: IconName;
  /** One short, friendly sentence. */
  text: string;
  /** Optional single button (leave out when the screen's bottom button already does this). */
  actionLabel?: string;
  onAction?: () => void;
}

/** Friendly empty page: small motif picture, one sentence, at most one button. */
export function EmptyState({ icon, text, actionLabel, onAction }: Props) {
  return (
    <View style={styles.wrap}>
      <EmptyArt icon={icon} />
      <Text style={[type.heading, styles.text]}>{text}</Text>
      {actionLabel && onAction ? (
        <View style={styles.btn}>
          <BigButton tone="primary" icon="plus" label={actionLabel} onPress={onAction} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl, paddingHorizontal: spacing.md },
  text: { color: colors.muted, textAlign: 'center' },
  btn: { alignSelf: 'stretch' },
});
