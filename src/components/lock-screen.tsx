import React, { useCallback } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BigButton } from '@/components/big-button';
import { Icon } from '@/components/icons';
import { DotBorder } from '@/components/motifs';
import { PinFlow } from '@/components/pin-flow';
import { Text } from '@/components/text';
import { clearAllLocalData, getDb, verifyAppLockPin, type Db } from '@/db';
import { relockLedgers } from '@/ledgers/session';
import { colors, GUTTER, spacing, type } from '@/theme';

interface Props {
  onUnlock: () => void;
  onWiped: () => void;
}

/** Full-screen PIN prompt shown over the app when the app lock is on. */
export function LockScreen({ onUnlock, onWiped }: Props) {
  const check = useCallback(async (pin: string) => verifyAppLockPin((await getDb()) as unknown as Db, pin), []);
  const forgot = () =>
    Alert.alert(
      'पिन भूल गए?',
      'पिन वापस नहीं मिल सकता। ताला खोलने का एक ही तरीका है: इस फ़ोन का सारा हिसाब मिटाना। अगर आपने बैकअप लिया है तो हिसाब बाद में वापस आ सकता है।',
      [
        { text: 'रुकें', style: 'cancel' },
        {
          text: 'हाँ, फ़ोन साफ़ करें',
          style: 'destructive',
          onPress: async () => {
            await clearAllLocalData((await getDb()) as unknown as Db);
            relockLedgers();
            onWiped();
          },
        },
      ],
    );
  return (
    <View style={styles.page} accessibilityViewIsModal>
      <SafeAreaView style={styles.safe}>
        <DotBorder />
        <View style={styles.body}>
          <View style={styles.head}>
            <Icon name="lock" size={40} color={colors.received} />
            <Text style={[type.title, styles.name]} accessibilityRole="header">
              नोतरा डायरी
            </Text>
          </View>
          <PinFlow verify askNew={false} check={check} verifyTitle="पिन डालें" onDone={onUnlock} />
          <BigButton label="पिन भूल गए?" tone="plain" onPress={forgot} />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.paper },
  safe: { flex: 1 },
  body: { flex: 1, padding: GUTTER, gap: spacing.md, justifyContent: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { color: colors.received },
});
