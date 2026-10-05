import React, { useCallback } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BigButton } from '@/components/big-button';
import { PinFlow } from '@/components/pin-flow';
import { RuledPaper } from '@/components/ruled-paper';
import { Text } from '@/components/text';
import { clearAllLocalData, getDb, verifyAppLockPin, type Db } from '@/db';
import { relockLedgers } from '@/ledgers/session';
import { colors, spacing, type } from '@/theme';

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
    <View style={StyleSheet.absoluteFill} accessibilityViewIsModal>
      <RuledPaper>
        <SafeAreaView style={styles.safe}>
          <Text style={styles.name} accessibilityRole="header">
            🔒 नोतरा डायरी
          </Text>
          <PinFlow verify askNew={false} check={check} verifyTitle="पिन डालें" onDone={onUnlock} />
          <BigButton icon="❓" label="पिन भूल गए?" tone="plain" onPress={forgot} />
        </SafeAreaView>
      </RuledPaper>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, padding: spacing.md, paddingLeft: 44, gap: spacing.md, justifyContent: 'center' },
  name: { ...type.title, color: colors.inkBlue },
});
