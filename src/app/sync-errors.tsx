import React from 'react';
import { StyleSheet, View } from 'react-native';
import { BigButton } from '@/components/big-button';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { getDb, type Db } from '@/db';
import { useLoad } from '@/hooks/use-load';
import { listRejected, retryRejected, type RejectedRow } from '@/sync/rejected';
import { syncSoon } from '@/sync/runtime';
import { colors, spacing, type } from '@/theme';

/** The rows the server could not accept. They stay safe on the phone; this just shows which ones. */
export default function SyncErrors() {
  const { data, reload } = useLoad<RejectedRow[]>((db) => listRejected(db), []);
  return (
    <Screen title={`${data.length} एंट्री नहीं भेजी जा सकीं`}>
      <Text style={styles.body}>ये फ़ोन में सुरक्षित हैं, और आपके हिसाब में गिनी जा रही हैं। बस इनकी कॉपी इंटरनेट पर नहीं पहुँची।</Text>
      {data.map((r) => (
        <View key={`${r.table}${r.id}`} style={styles.row}>
          <Text style={styles.label}>{r.label}</Text>
          <Text style={styles.code}>{r.reason}</Text>
        </View>
      ))}
      <BigButton
        icon="🔁"
        label="फिर से कोशिश करें"
        onPress={async () => {
          await retryRejected((await getDb()) as unknown as Db);
          syncSoon();
          reload();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { ...type.body, color: colors.text },
  row: { borderWidth: 2, borderColor: colors.border, borderRadius: 12, padding: spacing.md, backgroundColor: colors.card, gap: spacing.xs },
  label: { ...type.label, color: colors.text },
  code: { ...type.body, color: colors.textMuted },
});
