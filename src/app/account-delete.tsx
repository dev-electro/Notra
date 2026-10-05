import React, { useState } from 'react';
import { Alert, StyleSheet } from 'react-native';
import { BigButton } from '@/components/big-button';
import { Field } from '@/components/field';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { DELETE_PHRASE, isDeleteConfirmed } from '@/core';
import { replace } from '@/nav';
import { authErrorMessage } from '@/auth/messages';
import { deleteMyAccount } from '@/sync/runtime';
import { SignedOutError } from '@/sync/http';
import { showToast } from '@/services/toast';
import { colors, spacing, type } from '@/theme';

/** "खाता हटाएं": clear warning, a typed word, then a separate question about this phone's data. Needed by Play Store and DPDP. */
export default function AccountDelete() {
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const run = async (wipe: boolean) => {
    setBusy(true);
    setErr('');
    try {
      await deleteMyAccount(wipe);
      showToast('आपका खाता हट गया');
      replace('/');
    } catch (e) {
      setErr(e instanceof SignedOutError ? 'पहले फिर से साइन इन करें, फिर खाता हटाएं।' : authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const askPhone = () =>
    Alert.alert(
      'इस फ़ोन का हिसाब भी मिटाएँ?',
      'खाता हटने के बाद इस फ़ोन का हिसाब रखें या मिटा दें? मिटाने पर वह हमेशा के लिए चला जाएगा।',
      [
        { text: 'रुकें', style: 'cancel' },
        { text: 'नहीं, फ़ोन पर रहने दें', onPress: () => void run(false) },
        { text: 'हाँ, फ़ोन से भी मिटाएँ', style: 'destructive', onPress: () => void run(true) },
      ],
    );

  return (
    <Screen title="खाता हटाएं">
      <Text style={styles.warn}>⚠️ ध्यान दें</Text>
      <Text style={styles.body}>
        आपका क्लाउड खाता और उसमें रखा सारा हिसाब (परिवार, कार्यक्रम, एंट्री, खाते) हमारे सर्वर से हमेशा के लिए हट जाएगा। यह वापस नहीं हो सकता।
      </Text>
      <Field label={`पक्का करने के लिए "${DELETE_PHRASE}" लिखें`} value={word} onChangeText={setWord} autoCapitalize="none" />
      {err ? <Text style={styles.err}>{err}</Text> : null}
      <BigButton icon="🗑" label={busy ? 'रुकिए…' : 'खाता हटाएं'} tone="red" disabled={!isDeleteConfirmed(word) || busy} onPress={askPhone} hint="पहले यह पूछेगा कि फ़ोन का हिसाब भी मिटाना है या नहीं" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  warn: { ...type.label, color: colors.inkRed },
  body: { ...type.body, color: colors.text, marginBottom: spacing.xs },
  err: { ...type.body, color: colors.inkRed, fontWeight: '700' },
});
