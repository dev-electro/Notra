import { useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet } from 'react-native';
import { BigButton } from '@/components/big-button';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { afterSignIn, CANCELLED_MESSAGE } from '@/auth/after-signin';
import { getGoogleIdToken } from '@/auth/google';
import { authErrorMessage } from '@/auth/messages';
import { getDb, setSetting, type Db } from '@/db';
import { back, go, replace } from '@/nav';
import { linkGoogle, signInGoogle } from '@/sync/runtime';
import { colors, spacing, type } from '@/theme';

const SIGNIN_PROMPTED = 'signin_prompted';

/** First-launch (skippable) sign-in. Also used from Settings (link=1 adds Google to the current account). */
export default function SignIn() {
  const { first, link } = useLocalSearchParams<{ first?: string; link?: string }>();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const leave = () => (first ? replace('/') : back());

  const later = async () => {
    await setSetting((await getDb()) as unknown as Db, SIGNIN_PROMPTED, '1');
    leave();
  };

  const google = async () => {
    setBusy(true);
    setErr('');
    try {
      const idToken = await getGoogleIdToken();
      if (!idToken) return;
      if (link) {
        await linkGoogle(idToken);
        leave();
      } else if (await afterSignIn(await signInGoogle(idToken))) leave();
      else setErr(CANCELLED_MESSAGE);
    } catch (e) {
      setErr(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="साइन इन" noBack={!!first}>
      <Text style={styles.body}>
        साइन इन करने से आपका हिसाब सुरक्षित रहेगा, और फ़ोन बदलने पर वापस मिल जाएगा। बिना साइन इन के भी ऐप पूरा चलता है, बिना इंटरनेट के भी।
      </Text>
      <BigButton icon="G" label={busy ? 'रुकिए…' : 'Google से साइन इन'} hint="Google खाते से साइन इन" onPress={google} disabled={busy} />
      {link ? null : <BigButton icon="📱" label="मोबाइल नंबर से" tone="red" onPress={() => go('/phone')} disabled={busy} />}
      {err ? <Text style={styles.err}>{err}</Text> : null}
      {first ? <BigButton icon="⏭" label="बाद में" tone="plain" onPress={later} disabled={busy} /> : null}
      <Text style={styles.small}>साइन इन करने का मतलब है कि आप ये मानते हैं:</Text>
      <BigButton icon="🔒" label="गोपनीयता नीति" tone="plain" onPress={() => go('/legal/privacy')} />
      <BigButton icon="📄" label="नियम व शर्तें" tone="plain" onPress={() => go('/legal/terms')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { ...type.body, color: colors.text, marginBottom: spacing.sm },
  small: { ...type.body, color: colors.textMuted },
  err: { ...type.body, color: colors.inkRed, fontWeight: '700' },
});
