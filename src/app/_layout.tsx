import { useFonts } from 'expo-font';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { startAds } from '@/ads/service';
import { startAnalytics } from '@/analytics';
import { useScreenTracking } from '@/analytics/use-analytics';
import { BigButton } from '@/components/big-button';
import { ForceUpdate } from '@/components/force-update';
import { LockScreen } from '@/components/lock-screen';
import { Text } from '@/components/text';
import { ToastHost } from '@/components/toast-host';
import { getDb, isAppLockOn, type Db } from '@/db';
import { relockLedgers, shouldRelock } from '@/ledgers/session';
import { startRemoteConfig } from '@/remote/fetch';
import { startSync } from '@/sync/runtime';
import { colors, fonts, GUTTER, spacing, type } from '@/theme';

// Hold the splash only until the two font files are in (they are bundled, so this is a few milliseconds).
void SplashScreen.preventAutoHideAsync().catch(() => undefined);

/**
 * Shown instead of a crash. Plain views only (it must work even if the database or a screen is what broke) and no error
 * text for the person to read. There is no crash-reporting SDK: nothing leaves the phone.
 */
export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return (
    <View style={styles.error}>
      <Text style={styles.errTitle} accessibilityRole="header">
        कुछ गड़बड़ हुई, आपका डेटा सुरक्षित है
      </Text>
      <Text style={styles.errBody}>आपका हिसाब फ़ोन में जैसा था वैसा ही है। नीचे दबाकर फिर कोशिश करें।</Text>
      <BigButton tone="primary" icon="refresh" label="फिर कोशिश करें" onPress={() => void retry()} hint="ऐप का पन्ना फिर से खोलता है" />
    </View>
  );
}

/** Opens locked when the app lock is on, and locks again after 2 minutes in the background. Personal ledgers relock too. */
function useAppLock() {
  const [locked, setLocked] = useState(false);
  const leftAt = useRef<number | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (await isAppLockOn((await getDb()) as unknown as Db)) alive && setLocked(true);
      } catch {
        /* no lock if the database cannot be read: Home shows its own error */
      }
    })();
    const sub = AppState.addEventListener('change', async (st) => {
      if (st !== 'active') {
        leftAt.current ??= Date.now();
        return;
      }
      const away = shouldRelock(leftAt.current, Date.now());
      leftAt.current = null;
      if (!away) return;
      relockLedgers(); // PIN-protected ledgers need their PIN again, and the household ledger opens
      try {
        if (await isAppLockOn((await getDb()) as unknown as Db)) setLocked(true);
      } catch {
        /* ignore */
      }
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return [locked, setLocked] as const;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    [fonts.medium]: require('../../assets/fonts/Mukta-500Medium.ttf'),
    [fonts.bold]: require('../../assets/fonts/Mukta-700Bold.ttf'),
  });
  const ready = fontsLoaded || !!fontError; // on a font error the system font is used rather than a blank screen
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);
  useEffect(() => startSync(), []);
  useEffect(() => startRemoteConfig(), []); // GET /v1/config: cached copy first, then the network (silent if there is no server)
  useEffect(() => startAds(), []); // arms ads ~3 s after the first render; nothing native loads before a screen asks
  useEffect(() => startAnalytics(), []); // ~0.5 s after mount; a silent no-op without the native module
  useScreenTracking();
  const [locked, setLocked] = useAppLock();
  if (!ready) return null;
  return (
    <>
      <StatusBar style="dark" />
      <View style={styles.flex} importantForAccessibility={locked ? 'no-hide-descendants' : 'auto'}>
        <Stack screenOptions={{ headerShown: false, animation: 'none', contentStyle: { backgroundColor: colors.paper } }} />
      </View>
      <ForceUpdate />
      {locked ? <LockScreen onUnlock={() => setLocked(false)} onWiped={() => setLocked(false)} /> : null}
      <ToastHost />
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  error: { flex: 1, backgroundColor: colors.paper, padding: GUTTER, gap: spacing.md, justifyContent: 'center' },
  errTitle: { ...type.title, color: colors.received },
  errBody: { ...type.body, color: colors.ink },
});
