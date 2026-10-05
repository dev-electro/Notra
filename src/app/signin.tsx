import { useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { BigButton } from '@/components/big-button';
import { Screen } from '@/components/screen';
import { getGoogleIdToken } from '@/auth/google';
import { authErrorMessage } from '@/auth/messages';
import { getDb, setSetting, type Db } from '@/db';
import { back, go, replace } from '@/nav';
import { linkGoogle, signInGoogle } from '@/sync/runtime';
import { colors, spacing } from '@/theme';

const SIGNIN_PROMPTED = 'signin_prompted';

/** First-launch (skippable) sign-in. Also used from Settings (link=1 adds Google to the current account). */
export default function SignIn() {
  const { first, link } = useLocalSearchParams<{ first?: string; link?: string }>();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const done = async () => {
    await setSetting((await getDb()) as unknown as Db, SIGNIN_PROMPTED, '1');
    if (first) replace('/');
    else back();
  };

  const google = async () => {
    setBusy(true);
    setErr('');
    try {
      const idToken = await getGoogleIdToken();
      if (!idToken) return;
      await (link ? linkGoogle(idToken) : signInGoogle(idToken));
      await done();
    } catch (e) {
      setErr(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="साइन इन" noBack={!!first}>
      <Text style={styles.body}>
        साइन इन करने से आपका नोतरा क्लाउड पर सुरक्षित रहेगा और फ़ोन बदलने पर वापस मिल जाएगा। बिना साइन इन के भी ऐप पूरा चलता है, बिना इंटरनेट के भी।
      </Text>
      <BigButton icon="G" label="Google से साइन इन" onPress={google} disabled={busy} />
      {link ? null : <BigButton icon="📱" label="मोबाइल नंबर से" tone="red" onPress={() => go('/phone')} disabled={busy} />}
      {err ? <Text style={styles.err}>{err}</Text> : null}
      {first ? <BigButton label="बाद में" tone="plain" onPress={done} disabled={busy} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { fontSize: 22, lineHeight: 32, color: colors.text, marginBottom: spacing.sm },
  err: { fontSize: 20, lineHeight: 28, color: colors.inkRed, fontWeight: '700' },
});
