import { usePathname } from 'expo-router';
import React from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BigButton } from '@/components/big-button';
import { Icon } from '@/components/icons';
import { DotBorder } from '@/components/motifs';
import { Text } from '@/components/text';
import { go } from '@/nav';
import { updateState } from '@/remote/config';
import { appVersion, PLAY_STORE_ID, PLAY_STORE_URL } from '@/remote/device';
import { useRemoteConfig } from '@/remote/use-remote';
import { colors, GUTTER, spacing, type } from '@/theme';

/** Opens the Play Store listing (the store app if present, else the web page). */
export async function openStore(): Promise<void> {
  try {
    await Linking.openURL(`market://details?id=${PLAY_STORE_ID}`);
  } catch {
    await Linking.openURL(PLAY_STORE_URL).catch(() => undefined);
  }
}

/**
 * Full-screen message when this version is older than the server's min_supported_version. The person is never trapped: the
 * "बैकअप फ़ाइल बनाएं" button opens the backup-file screen (the overlay steps aside there), so the diary can always be saved
 * to a file before updating. There is deliberately no "not now" below the minimum.
 */
export function ForceUpdate() {
  const config = useRemoteConfig();
  const path = usePathname();
  if (updateState(appVersion(), config) !== 'forced') return null;
  if (path.startsWith('/backup')) return null; // the backup-file screen must stay reachable
  return (
    <View style={styles.cover} testID="force-update">
      <SafeAreaView style={styles.safe}>
        <DotBorder />
        <View style={styles.body}>
          <Icon name="refresh" size={56} color={colors.received} />
          <Text style={[type.title, styles.title]} accessibilityRole="header">
            ऐप अपडेट करना ज़रूरी है
          </Text>
          <Text style={[type.body, styles.text]}>{config.force_update_message_hi}</Text>
          <Text style={[type.body, styles.text]}>आपका हिसाब फ़ोन में सुरक्षित है। चाहें तो पहले उसकी बैकअप फ़ाइल बना लें।</Text>
        </View>
        <View style={styles.actions}>
          <BigButton testID="btn-update" tone="primary" icon="refresh" label="अपडेट करें" onPress={() => void openStore()} hint="प्ले स्टोर खुलेगा" />
          <BigButton testID="btn-update-backup" icon="share" label="बैकअप फ़ाइल बनाएं" onPress={() => go('/backup?mode=create')} hint="हिसाब की ताले वाली फ़ाइल बनाकर भेजें" />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.paper },
  safe: { flex: 1 },
  body: { flex: 1, padding: GUTTER, gap: spacing.md, justifyContent: 'center' },
  title: { color: colors.received },
  text: { color: colors.ink },
  actions: { padding: GUTTER, gap: spacing.sm },
});
