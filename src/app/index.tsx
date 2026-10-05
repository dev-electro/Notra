import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RuledPaper } from '@/components/ruled-paper';
import { TotalCard } from '@/components/total-card';
import { formatINR } from '@/core';
import { useLedgerTotals } from '@/hooks/use-ledger-totals';
import { colors, spacing, type } from '@/theme';

export default function Home() {
  const { loading, error, receivedPaise, givenPaise } = useLedgerTotals();
  const show = (p: number) => (loading ? '…' : formatINR(p));
  return (
    <RuledPaper>
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.heading}>नोतरा डायरी</Text>
          <View style={styles.cards}>
            {/* Stage 2 wires these to the received / given ledgers. */}
            <TotalCard title="मेरा नोतरा" subtitle="जो मेरे यहाँ आया" amount={show(receivedPaise)} ink="blue" />
            <TotalCard title="दूसरों का नोतरा" subtitle="जो मैंने दिया" amount={show(givenPaise)} ink="red" />
          </View>
          {error ? <Text style={styles.note}>डेटा नहीं खुल पाया। ऐप दोबारा खोलें।</Text> : null}
        </ScrollView>
      </SafeAreaView>
    </RuledPaper>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: spacing.md, paddingLeft: 44, gap: spacing.lg },
  heading: { ...type.title, color: colors.inkBlue },
  cards: { gap: spacing.lg },
  note: { ...type.body, color: colors.textMuted },
});
