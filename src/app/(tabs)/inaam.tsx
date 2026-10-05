import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Card, SoonBadge } from '@/components/card';
import { Icon } from '@/components/icons';
import { DotBorder } from '@/components/motifs';
import { PressableScale } from '@/components/pressable-scale';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { badgeStates, computePoints, EMPTY_ACTIVITY, levelFor, POINTS, type Activity } from '@/core';
import { loadActivity } from '@/features/rewards/store';
import { useLoad } from '@/hooks/use-load';
import { getModule } from '@/modules/registry';
import { go } from '@/nav';
import { BORDER, colors, radius, spacing, type } from '@/theme';

/** Still-to-come reward modules (opened as the shared "coming soon" page). The live points/badges above are worked out on the phone. */
const CARDS = [
  { id: 'checkin', sub: 'रोज़ आएँ, इनाम पाएँ' },
  { id: 'videos', sub: 'वीडियो देखें, इनाम पाएँ' },
  { id: 'referral', sub: 'दोस्त बुलाएँ, इनाम पाएँ' },
] as const;

/** इनाम: points and badges worked out on this phone from what has been written. No cash value yet. */
export default function Inaam() {
  const { data: a } = useLoad<Activity>((db, ledgerId) => loadActivity(db, ledgerId), EMPTY_ACTIVITY);
  const points = computePoints(a);
  const info = levelFor(points);
  const badges = badgeStates(a);
  return (
    <Screen tab title="इनाम">
      <Card tint="haldi" style={styles.wallet} testID="inaam-level">
        <View style={styles.walletTop}>
          <View style={styles.walletDisc}>
            <Icon name="trophy" size={28} color={colors.ink} />
          </View>
          <Text style={[type.heading, styles.ink]}>मेरा इनाम</Text>
        </View>
        <Text style={[type.caption, styles.muted]}>आपका स्तर</Text>
        <Text style={[type.title, { color: colors.received }]}>{info.level.name}</Text>
        <Text style={[type.amountXL, styles.ink]}>{points} अंक</Text>
        <View style={styles.track} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(info.progress * 100) }}>
          <View style={[styles.fill, { width: `${Math.round(info.progress * 100)}%` }]} />
        </View>
        <Text style={[type.caption, styles.muted]}>
          {info.next ? `${info.next.name} के लिए ${info.toNext} अंक और` : 'आप सबसे ऊँचे स्तर पर हैं'}
        </Text>
        {a.streak > 0 ? <Text style={[type.caption, styles.muted]}>लगातार {a.streak} दिन</Text> : null}
        <DotBorder />
      </Card>

      <Card style={styles.how}>
        <Text style={[type.bodyBold, styles.ink]}>अंक कैसे मिलते हैं</Text>
        <Text style={[type.caption, styles.muted]}>
          हर एंट्री +{POINTS.entry} · नया नोतरा +{POINTS.event} · बैकअप +{POINTS.backup}
        </Text>
      </Card>

      <Text style={[type.heading, styles.ink]} accessibilityRole="header">
        उपलब्धियाँ
      </Text>
      <View style={styles.grid}>
        {badges.map(({ badge, unlocked }) => (
          <View
            key={badge.id}
            testID={`badge-${badge.id}`}
            style={[styles.badge, unlocked && styles.badgeOn]}
            accessible
            accessibilityLabel={`${badge.title}, ${unlocked ? 'मिल गया' : `बंद। ${badge.hint}`}`}
          >
            <Icon name={unlocked ? 'star' : 'lock'} size={28} color={unlocked ? colors.received : colors.muted} />
            <Text style={[type.captionBold, { color: unlocked ? colors.ink : colors.muted }, styles.center]} numberOfLines={2} importantForAccessibility="no">
              {badge.title}
            </Text>
            {unlocked ? null : (
              <Text style={[type.caption, styles.muted, styles.center]} numberOfLines={2} importantForAccessibility="no">
                {badge.hint}
              </Text>
            )}
          </View>
        ))}
      </View>

      {CARDS.map(({ id, sub }) => {
        const m = getModule(id);
        if (!m) return null;
        return (
          <PressableScale key={id} testID={`card-${id}`} accessibilityRole="button" accessibilityLabel={`${m.title}, जल्द आ रहा है`} onPress={() => go(m.route)} style={styles.row}>
            <Icon name={m.icon} size={32} color={colors.received} />
            <View style={styles.flex}>
              <Text style={[type.bodyBold, styles.ink]}>{m.title}</Text>
              <Text style={[type.caption, styles.muted]}>{sub}</Text>
            </View>
            <SoonBadge />
          </PressableScale>
        );
      })}

      <Text style={[type.caption, styles.muted, styles.center]}>अंक अभी सिर्फ़ उपलब्धि के लिए हैं</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wallet: { gap: spacing.xs, alignItems: 'center', padding: spacing.lg, paddingBottom: spacing.sm },
  walletTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  walletDisc: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
  how: { gap: spacing.xs },
  track: { alignSelf: 'stretch', height: 12, borderRadius: radius.pill, backgroundColor: colors.card, overflow: 'hidden' },
  fill: { height: 12, borderRadius: radius.pill, backgroundColor: colors.received },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  badge: {
    width: '48%', flexGrow: 1, minHeight: 120, alignItems: 'center', justifyContent: 'center', gap: spacing.xs, padding: spacing.sm,
    backgroundColor: colors.paper, borderWidth: BORDER, borderColor: colors.hairline, borderRadius: radius.card,
  },
  badgeOn: { backgroundColor: colors.receivedTint, borderColor: colors.received },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 72, paddingHorizontal: spacing.md,
    backgroundColor: colors.card, borderWidth: BORDER, borderColor: colors.hairline, borderRadius: radius.card,
  },
  flex: { flex: 1 },
  muted: { color: colors.muted },
  ink: { color: colors.ink },
  center: { textAlign: 'center' },
});
