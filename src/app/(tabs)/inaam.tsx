import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Card } from '@/components/card';
import { Icon } from '@/components/icons';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { badgeStates, computePoints, EMPTY_ACTIVITY, levelFor, POINTS, type Activity } from '@/core';
import { loadActivity } from '@/features/rewards/store';
import { useLoad } from '@/hooks/use-load';
import { BORDER, colors, radius, spacing, type } from '@/theme';

/** इनाम: points and badges worked out on this phone from what has been written. Accent: indigo. No cash value. */
export default function Inaam() {
  const { data: a } = useLoad<Activity>((db, ledgerId) => loadActivity(db, ledgerId), EMPTY_ACTIVITY);
  const points = computePoints(a);
  const info = levelFor(points);
  const badges = badgeStates(a);
  return (
    <Screen tab title="इनाम">
      <Card style={styles.level} testID="inaam-level">
        <Text style={[type.caption, styles.muted]}>आपका स्तर</Text>
        <Text style={[type.title, { color: colors.received }]}>{info.level.name}</Text>
        <Text style={[type.body, styles.ink]}>{points} अंक</Text>
        <View style={styles.track} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(info.progress * 100) }}>
          <View style={[styles.fill, { width: `${Math.round(info.progress * 100)}%` }]} />
        </View>
        <Text style={[type.caption, styles.muted]}>
          {info.next ? `${info.next.name} के लिए ${info.toNext} अंक और` : 'आप सबसे ऊँचे स्तर पर हैं'}
        </Text>
        {a.streak > 0 ? <Text style={[type.caption, styles.muted]}>लगातार {a.streak} दिन</Text> : null}
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

      <Text style={[type.caption, styles.muted, styles.center]}>अंक अभी सिर्फ़ उपलब्धि के लिए हैं</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  level: { gap: spacing.sm, padding: spacing.lg },
  how: { gap: spacing.xs },
  track: { height: 12, borderRadius: radius.pill, backgroundColor: colors.hairline, overflow: 'hidden' },
  fill: { height: 12, borderRadius: radius.pill, backgroundColor: colors.received },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  badge: {
    width: '48%', flexGrow: 1, minHeight: 120, alignItems: 'center', justifyContent: 'center', gap: spacing.xs, padding: spacing.sm,
    backgroundColor: colors.paper, borderWidth: BORDER, borderColor: colors.hairline, borderRadius: radius.card,
  },
  badgeOn: { backgroundColor: colors.receivedTint, borderColor: colors.received },
  muted: { color: colors.muted },
  ink: { color: colors.ink },
  center: { textAlign: 'center' },
});
