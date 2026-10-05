import React from 'react';
import { StyleSheet } from 'react-native';
import { Card } from '@/components/card';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { getDb, type Db } from '@/db';
import { useLoad } from '@/hooks/use-load';
import { listRejected, retryRejected, type RejectedRow } from '@/sync/rejected';
import { syncSoon } from '@/sync/runtime';
import { colors, type } from '@/theme';

/** The rows the server could not accept. They stay safe on the phone; this just shows which ones. */
export default function SyncErrors() {
  const { data, reload } = useLoad<RejectedRow[]>((db) => listRejected(db), []);
  return (
    <Screen
      title={`${data.length} एंट्री नहीं भेजी जा सकीं`}
      action={{
        icon: 'refresh',
        label: 'फिर से कोशिश करें',
        onPress: async () => {
          await retryRejected((await getDb()) as unknown as Db);
          syncSoon();
          reload();
        },
      }}
    >
      <Text style={[type.body, styles.body]}>ये फ़ोन में सुरक्षित हैं, और आपके हिसाब में गिनी जा रही हैं। बस इनकी कॉपी इंटरनेट पर नहीं पहुँची।</Text>
      {data.map((r) => (
        <Card key={`${r.table}${r.id}`}>
          <Text style={type.heading}>{r.label}</Text>
          <Text style={[type.caption, styles.code]}>{r.reason}</Text>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { color: colors.ink },
  code: { color: colors.muted },
});
