import { useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BigButton } from '@/components/big-button';
import { Card } from '@/components/card';
import { Icon } from '@/components/icons';
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
    <Screen
      title="साइन इन"
      noBack={!!first}
      action={{ label: busy ? 'रुकिए…' : 'गूगल से साइन इन', hint: 'गूगल खाते से साइन इन', onPress: google, disabled: busy }}
    >
      <Card tint="haldi" style={styles.why}>
        <Icon name="cloud" size={40} color={colors.ink} />
        <Text style={[type.body, styles.body]}>
          साइन इन करने से आपका हिसाब सुरक्षित रहेगा, और फ़ोन बदलने पर वापस मिल जाएगा। बिना साइन इन के भी ऐप पूरा चलता है, बिना इंटरनेट के भी।
        </Text>
      </Card>
      {link ? null : <BigButton icon="phone" label="मोबाइल नंबर से" onPress={() => go('/phone')} disabled={busy} />}
      {err ? <Text style={[type.bodyBold, styles.err]}>{err}</Text> : null}
      {first ? <BigButton label="बाद में" tone="plain" onPress={later} disabled={busy} /> : null}
      <Text style={[type.caption, styles.small]}>साइन इन करने का मतलब है कि आप ये मानते हैं:</Text>
      <View style={styles.row}>
        <BigButton compact icon="lock" label="गोपनीयता नीति" onPress={() => go('/legal/privacy')} />
        <BigButton compact icon="doc" label="नियम व शर्तें" onPress={() => go('/legal/terms')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  why: { gap: spacing.sm, alignItems: 'flex-start' },
  body: { color: colors.ink },
  small: { color: colors.muted },
  err: { color: colors.given },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
