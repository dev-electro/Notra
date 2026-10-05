import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { DirectionTag } from '@/components/direction';
import { Icon, type IconName } from '@/components/icons';
import { PressableScale } from '@/components/pressable-scale';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { formatINR } from '@/core';
import { sqlTotals } from '@/db';
import { useLoad } from '@/hooks/use-load';
import { go } from '@/nav';
import { BORDER, colors, GUTTER, MIN_TOUCH, radius, spacing, type } from '@/theme';

interface Item {
  id: string;
  route: string;
  icon: IconName;
  title: string;
  sub: string;
}

/** The report hub. Each report can be filtered by year (or dates) and sent as a PDF or a photo. */
const REPORTS: Item[] = [
  { id: 'given', route: '/reports/given', icon: 'moneyOut', title: 'किसको, किस दिन, कितना दिया', sub: 'हर दिया हुआ नोतरा: तारीख, परिवार, उतार/चढ़ाव' },
  { id: 'guests', route: '/reports/guests', icon: 'moneyIn', title: 'मेरे प्रोग्राम में कौन आया', sub: 'अपना नोतरा चुनें: कौन आया, कितना दिया' },
  { id: 'year', route: '/reports/year', icon: 'calendar', title: 'साल भर का हिसाब', sub: 'साल का कुल मिला, दिया, महीने-महीने' },
  { id: 'notcome', route: '/reports/notcome', icon: 'families', title: 'मेरे नोतरे में कौन नहीं आया', sub: 'जिनका लौटाना बाकी था और एंट्री नहीं है' },
  { id: 'person', route: '/reports/person', icon: 'hisaab', title: 'किसका कितना', sub: 'हर परिवार के साथ कितना मिला, कितना दिया' },
  { id: 'occasion', route: '/reports/occasion', icon: 'kalash', title: 'अवसर के हिसाब से', sub: 'शादी, गृहप्रवेश, मुंडन संस्कार...' },
  { id: 'pending', route: '/reports/pending', icon: 'doc', title: 'लौटाना बाकी', sub: 'जिन परिवारों को लौटाना है' },
  { id: 'self', route: '/reports/self', icon: 'write', title: 'मेरा खाता (क्रम से)', sub: 'तारीख के क्रम में सारी एंट्री और जोड़' },
];

function TotalRow({ aaya, amount, onPress }: { aaya: boolean; amount: string; onPress: () => void }) {
  const ink = aaya ? colors.received : colors.given;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${aaya ? 'कुल मिला' : 'कुल दिया'}, ${amount}`}
      accessibilityHint={aaya ? 'मिले हुए नोतरा की पूरी सूची' : 'दिए हुए नोतरा की पूरी सूची'}
      onPress={onPress}
      style={[styles.total, { backgroundColor: aaya ? colors.receivedTint : colors.givenTint }]}
    >
      <DirectionTag direction={aaya ? 'AAYA' : 'GAYA'} paired iconSize={26} />
      <Text style={[type.amount, styles.totalAmount, { color: ink }]} numberOfLines={1} adjustsFontSizeToFit>
        {amount}
      </Text>
      <Icon name="chevron" size={22} color={ink} />
    </PressableScale>
  );
}

export default function Hisab() {
  const { data: t } = useLoad((db, ledgerId) => sqlTotals(db, ledgerId), { receivedPaise: 0, givenPaise: 0 });
  return (
    <Screen
      tab
      title="हिसाब"
      scroll={false}
      action={{ testID: 'btn-old', icon: 'doc', label: 'पुराना हिसाब जोड़ें', onPress: () => go('/old'), hint: 'पुरानी डायरी का हिसाब पिछली तारीख से लिखें' }}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <TotalRow aaya amount={formatINR(t.receivedPaise)} onPress={() => go('/ledger/aaya')} />
        <TotalRow aaya={false} amount={formatINR(t.givenPaise)} onPress={() => go('/ledger/gaya')} />
        {REPORTS.map((r) => (
          <PressableScale
            key={r.id}
            testID={`report-${r.id}`}
            accessibilityRole="button"
            accessibilityLabel={r.title}
            accessibilityHint={r.sub}
            onPress={() => go(r.route)}
            style={styles.item}
          >
            <View style={styles.disc}>
              <Icon name={r.icon} size={28} color={colors.received} />
            </View>
            <View style={styles.flex}>
              <Text style={[type.bodyBold, styles.ink]} numberOfLines={2} importantForAccessibility="no">
                {r.title}
              </Text>
              <Text style={[type.caption, styles.muted]} numberOfLines={2} importantForAccessibility="no">
                {r.sub}
              </Text>
            </View>
            <Icon name="chevron" size={22} color={colors.muted} />
          </PressableScale>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: spacing.lg, gap: spacing.sm },
  total: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 72, paddingHorizontal: spacing.md, borderRadius: radius.card, borderWidth: BORDER, borderColor: colors.hairline },
  totalAmount: { flex: 1, textAlign: 'right' },
  item: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: MIN_TOUCH + spacing.md, padding: spacing.md,
    backgroundColor: colors.card, borderWidth: BORDER, borderColor: colors.hairline, borderRadius: radius.card,
  },
  disc: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.receivedTint, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  ink: { color: colors.ink },
  muted: { color: colors.muted },
});
