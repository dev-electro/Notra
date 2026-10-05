import React, { useEffect } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BigButton } from '@/components/big-button';
import { RuledPaper } from '@/components/ruled-paper';
import { TotalCard } from '@/components/total-card';
import { formatINR } from '@/core';
import { useLedgerTotals } from '@/hooks/use-ledger-totals';
import { go, replace } from '@/nav';
import { colors, spacing, type } from '@/theme';

export default function Home() {
  const { loading, error, receivedPaise, givenPaise, setupDone } = useLedgerTotals();
  const show = (p: number) => (loading ? '…' : formatINR(p));

  useEffect(() => {
    if (!loading && !error && !setupDone) replace('/setup');
  }, [loading, error, setupDone]);

  return (
    <RuledPaper>
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.heading}>नोतरा डायरी</Text>
          <View style={styles.cards}>
            <TotalCard title="मेरा नोतरा" subtitle="जो मेरे यहाँ आया" amount={show(receivedPaise)} ink="blue" onPress={() => go('/ledger/aaya')} />
            <TotalCard title="दूसरों का नोतरा" subtitle="जो मैंने दिया" amount={show(givenPaise)} ink="red" onPress={() => go('/ledger/gaya')} />
          </View>
          <BigButton icon="✍️" label="नई एंट्री" onPress={() => go('/entry/new')} />
          <View style={styles.row}>
            <BigButton compact icon="👪" label="परिवार" onPress={() => go('/households')} />
            <BigButton compact icon="📊" label="रिपोर्ट" tone="red" onPress={() => go('/reports')} />
          </View>
          <BigButton icon="🎉" label="नोतरा कार्यक्रम" tone="red" onPress={() => go('/events')} />
          <BigButton icon="⚙️" label="सेटिंग" tone="plain" onPress={() => go('/settings')} />
          {error ? <Text style={styles.note}>डेटा नहीं खुल पाया। ऐप दोबारा खोलें।</Text> : null}
        </ScrollView>
      </SafeAreaView>
    </RuledPaper>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: spacing.md, paddingLeft: 44, gap: spacing.md, paddingBottom: spacing.xl },
  heading: { ...type.title, color: colors.inkBlue },
  cards: { gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.md },
  note: { ...type.body, color: colors.textMuted },
});
