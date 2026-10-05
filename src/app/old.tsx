import React from 'react';
import { StyleSheet, View } from 'react-native';
import { BigButton } from '@/components/big-button';
import { Card } from '@/components/card';
import { Icon } from '@/components/icons';
import { PressableScale } from '@/components/pressable-scale';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { diaryPhotoImportOn } from '@/features';
import { useRemoteConfig } from '@/remote/use-remote';
import { go } from '@/nav';
import { showToast } from '@/services/toast';
import { BORDER, colors, radius, spacing, type } from '@/theme';

/**
 * पुराना हिसाब जोड़ें: copy an old paper diary into the app, with the real (past) dates. The two worlds stay apart:
 * my own old Notra (who came to me) or an old visit to another family's Notra (what I gave).
 */
export default function OldRecords() {
  const photoOn = diaryPhotoImportOn(useRemoteConfig());
  return (
    <Screen title="पुराना हिसाब जोड़ें">
      <Text style={[type.body, styles.ink]}>पुरानी डायरी से हिसाब लिखें। तारीख पिछली चुन सकते हैं।</Text>
      <Card tint="received" style={styles.card}>
        <Text style={[type.heading, { color: colors.received }]}>मेरा पुराना नोतरा</Text>
        <Text style={[type.caption, styles.muted]}>मेरे यहाँ जो नोतरा हुआ और कौन-कौन आया</Text>
        <BigButton testID="btn-old-mine" tone="received" icon="moneyIn" label="मेरा पुराना नोतरा" onPress={() => go('/events/new?old=1')} />
      </Card>
      <Card tint="given" style={styles.card}>
        <Text style={[type.heading, { color: colors.given }]}>दूसरों का पुराना नोतरा</Text>
        <Text style={[type.caption, styles.muted]}>किसी और के नोतरे में जाकर जो दिया</Text>
        <BigButton testID="btn-old-others" tone="given" icon="moneyOut" label="दूसरों का पुराना नोतरा" onPress={() => go('/others/new?old=1')} />
      </Card>
      <PressableScale
        testID="card-diary-photo"
        accessibilityRole="button"
        accessibilityLabel="पुरानी डायरी की फ़ोटो से हिसाब, जल्द आ रहा है"
        accessibilityHint="यह सुविधा अभी नहीं है"
        onPress={() => showToast('यह सुविधा जल्द आएगी')}
        style={[styles.soon, photoOn && styles.soonOn]}
      >
        <View style={styles.soonDisc}>
          <Icon name="camera" size={28} color={colors.muted} />
        </View>
        <View style={styles.flex}>
          <Text style={[type.bodyBold, styles.muted]} importantForAccessibility="no">
            पुरानी डायरी की फ़ोटो से हिसाब — जल्द आ रहा है
          </Text>
          <Text style={[type.caption, styles.muted]} importantForAccessibility="no">
            डायरी के पन्ने की फ़ोटो लें, ऐप खुद हिसाब भर देगा।
          </Text>
        </View>
      </PressableScale>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  soon: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, opacity: 0.8,
    backgroundColor: colors.haldiTint, borderRadius: radius.card, borderWidth: BORDER, borderColor: colors.hairline, borderStyle: 'dashed',
  },
  soonOn: { opacity: 1, borderStyle: 'solid', borderColor: colors.haldi },
  soonDisc: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  card: { gap: spacing.sm },
  ink: { color: colors.ink },
  muted: { color: colors.muted },
});
