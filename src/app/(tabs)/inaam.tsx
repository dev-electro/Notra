import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Card } from '@/components/card';
import { Icon } from '@/components/icons';
import { PressableScale } from '@/components/pressable-scale';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { getModule } from '@/modules/registry';
import { go } from '@/nav';
import { BORDER, colors, radius, spacing, type } from '@/theme';

const CARDS = [
  { id: 'checkin', sub: 'रोज़ आएँ, इनाम पाएँ' },
  { id: 'videos', sub: 'वीडियो देखें, इनाम पाएँ' },
  { id: 'rewards', sub: 'अपनी कमाई यहाँ दिखेगी' },
  { id: 'referral', sub: 'दोस्त बुलाएँ, इनाम पाएँ' },
] as const;

/** इनाम tab: placeholders only. Everything here opens the shared "coming soon" page. */
export default function Inaam() {
  return (
    <Screen title="इनाम" tab>
      <Card tint="haldi" style={styles.wallet} testID="card-wallet">
        <Text style={[type.caption, { color: colors.muted }]}>मेरा इनाम</Text>
        <Text style={[type.title, { color: colors.ink }]}>₹0 · जल्द शुरू</Text>
      </Card>
      {CARDS.map(({ id, sub }) => {
        const m = getModule(id);
        if (!m) return null;
        return (
          <PressableScale key={id} testID={`card-${id}`} accessibilityRole="button" accessibilityLabel={`${m.title}, जल्द आ रहा है`} onPress={() => go(m.route)} style={styles.row}>
            <Icon name={m.icon} size={32} color={colors.received} />
            <View style={styles.flex}>
              <Text style={[type.bodyBold, { color: colors.ink }]}>{m.title}</Text>
              <Text style={[type.caption, { color: colors.muted }]}>{sub}</Text>
            </View>
            <View style={styles.tag}><Text style={type.captionBold}>जल्द</Text></View>
          </PressableScale>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  wallet: { gap: spacing.xs },
  flex: { flex: 1 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 72, paddingHorizontal: spacing.md,
    backgroundColor: colors.card, borderWidth: BORDER, borderColor: colors.hairline, borderRadius: radius.card,
  },
  tag: { paddingHorizontal: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.haldiTint },
});
