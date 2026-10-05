import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Avatar } from '@/components/avatar';
import { Icon } from '@/components/icons';
import { PressableScale } from '@/components/pressable-scale';
import { Text } from '@/components/text';
import { GENDER_LABEL, heightLabel, placeOf, STATUS_LABEL, type ProfileStatus, type PublicProfile } from '@/rishtey/logic';
import { BORDER, colors, MIN_TOUCH, radius, spacing, type } from '@/theme';

const CHIP: Record<ProfileStatus, { bg: string; fg: string }> = {
  draft: { bg: colors.card, fg: colors.muted },
  pending: { bg: colors.haldiTint, fg: colors.ink },
  approved: { bg: colors.successTint, fg: colors.successInk },
  rejected: { bg: colors.givenTint, fg: colors.given },
  hidden: { bg: colors.card, fg: colors.muted },
};

/** Where my profile stands. Always a word, never colour alone. */
export function StatusChip({ status }: { status: ProfileStatus }) {
  const c = CHIP[status];
  return (
    <View style={[styles.chip, { backgroundColor: c.bg }]} accessible accessibilityLabel={`स्थिति: ${STATUS_LABEL[status]}`}>
      <Text style={[type.captionBold, { color: c.fg }]}>{STATUS_LABEL[status]}</Text>
    </View>
  );
}

/** "आशा, 28" with "उदयपुर, राजस्थान · कश्यप" underneath; initials avatar (no photos yet). */
export function ProfileRow({ p, onPress, right }: { p: PublicProfile; onPress: () => void; right?: React.ReactNode }) {
  const sub = [placeOf(p), p.gotra ? `गोत्र ${p.gotra}` : ''].filter(Boolean).join(' · ');
  return (
    <PressableScale accessibilityRole="button" accessibilityLabel={`${p.first_name}, ${p.age} साल`} accessibilityHint="पूरी जानकारी देखें" onPress={onPress} style={styles.row}>
      <Avatar name={p.first_name} size={52} />
      <View style={styles.text}>
        <Text style={type.bodyBold} numberOfLines={1}>{p.first_name}, {p.age}</Text>
        {sub ? <Text style={[type.caption, styles.sub]} numberOfLines={2}>{sub}</Text> : null}
      </View>
      {right ?? <Icon name="chevron" size={22} color={colors.muted} />}
    </PressableScale>
  );
}

/** The public facts, one per line (empty ones left out). */
export function ProfileFacts({ p }: { p: PublicProfile }) {
  const rows: [string, string][] = [
    ['लड़का/लड़की', GENDER_LABEL[p.gender]],
    ['कद', heightLabel(p.height_cm)],
    ['गोत्र', p.gotra ?? ''],
    ['शिक्षा', p.education ?? ''],
    ['व्यवसाय', p.occupation ?? ''],
    ['जगह', placeOf(p)],
  ];
  return (
    <View style={styles.facts}>
      {rows.filter(([, v]) => v).map(([k, v]) => (
        <View key={k} style={styles.fact}>
          <Text style={[type.caption, styles.k]}>{k}</Text>
          <Text style={[type.bodyBold, styles.v]}>{v}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: BORDER, borderColor: colors.hairline },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: MIN_TOUCH + spacing.md, padding: spacing.md, backgroundColor: colors.card, borderWidth: BORDER, borderColor: colors.hairline, borderRadius: radius.card },
  text: { flex: 1 },
  sub: { color: colors.muted },
  facts: { gap: spacing.sm },
  fact: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  k: { color: colors.muted },
  v: { flexShrink: 1, textAlign: 'right' },
});
