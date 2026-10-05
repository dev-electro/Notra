import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { getAuthUser } from '@/auth/session';
import { BigButton } from '@/components/big-button';
import { Card, SectionTitle } from '@/components/card';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { go } from '@/nav';
import { showToast } from '@/services/toast';
import { ACCESS_DAYS, expiryLabel, grantActive, type AccessDays, type AccessGrant } from '@/support/logic';
import { accessErrorMessage, getAccessGrant, grantAccess, revokeAccess } from '@/support/service';
import { colors, spacing, type } from '@/theme';
import { track } from '@/analytics';

/**
 * सहायता को मेरा डेटा दिखाएं: the person lets support SEE their diary, read-only, for 1, 3 or 7 days. Off by default; "अभी बंद करें"
 * ends it at once. Staff cannot read a diary any other way, and every access is logged. 404 from the server = not built yet.
 */
export default function SupportAccess() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [grant, setGrant] = useState<AccessGrant | null>(null);
  const [days, setDays] = useState<AccessDays>(3);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const [now] = useState(() => Date.now());
  useEffect(() => {
    let alive = true;
    (async () => {
      const u = await getAuthUser();
      const g = await getAccessGrant();
      if (alive) {
        setSignedIn(!!u);
        setGrant(g);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const active = grantActive(grant, now);

  const turnOn = async () => {
    setBusy(true);
    setMsg('');
    try {
      setGrant(await grantAccess(days));
      if (days === 1 || days === 3 || days === 7) track('support_access_granted', { days });
      showToast('सहायता अब आपका हिसाब देख सकती है');
    } catch (e) {
      setMsg(accessErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const turnOff = async () => {
    setBusy(true);
    setMsg('');
    try {
      await revokeAccess();
      setGrant(null);
      showToast('सहायता की पहुँच बंद हो गई');
    } catch (e) {
      setMsg(accessErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const confirmOn = () =>
    Alert.alert('सहायता को हिसाब दिखाएं?', `चुने हुए ${days} दिन तक सहायता टीम का कोई सदस्य आपका हिसाब सिर्फ़ देख सकेगा, बदल नहीं सकेगा।`, [
      { text: 'रुकें', style: 'cancel' },
      { text: 'हाँ, दिखाएं', onPress: () => void turnOn() },
    ]);

  return (
    <Screen title="सहायता को मेरा डेटा दिखाएं">
      <Card tint="haldi" style={styles.card}>
        <Text style={[type.body, styles.ink]}>
          आपको कोई दिक्कत हो और सहायता टीम को आपका हिसाब देखना पड़े, तभी इसे चालू करें। चालू करने पर चुने हुए दिनों तक सहायता टीम का कोई सदस्य आपका हिसाब सिर्फ़ देख सकता है, बदल या मिटा नहीं सकता।
        </Text>
        <Text style={[type.body, styles.ink]}>बाकी समय कोई आपकी डायरी नहीं पढ़ सकता। हर बार देखे जाने का रिकॉर्ड रखा जाता है। आप जब चाहें इसे तुरंत बंद कर सकते हैं।</Text>
      </Card>

      {signedIn === false ? (
        <>
          <Text style={[type.body, styles.ink]}>इसके लिए पहले साइन इन करना होगा।</Text>
          <BigButton icon="cloud" tone="primary" label="साइन इन करें" onPress={() => go('/signin')} />
        </>
      ) : active ? (
        <>
          <Card tint="success" style={styles.card} testID="access-active">
            <Text style={[type.heading, styles.ink]}>सहायता की पहुँच चालू है</Text>
            <Text style={[type.body, styles.ink]}>खत्म होगी: {expiryLabel(grant)}</Text>
          </Card>
          <BigButton testID="btn-access-off" tone="danger" icon="lock" label="अभी बंद करें" onPress={turnOff} disabled={busy} hint="सहायता की पहुँच तुरंत बंद करता है" />
        </>
      ) : (
        <>
          <SectionTitle icon="calendar">कितने दिन के लिए?</SectionTitle>
          <View style={styles.chips}>
            {ACCESS_DAYS.map((d) => (
              <BigButton key={d} testID={`access-days-${d}`} third label={`${d} दिन`} selected={days === d} onPress={() => setDays(d)} />
            ))}
          </View>
          <BigButton testID="btn-access-on" tone="primary" icon="unlock" label={busy ? 'रुकिए…' : 'चालू करें'} onPress={confirmOn} disabled={busy || signedIn === null} />
        </>
      )}
      {msg ? (
        <Text style={[type.bodyBold, styles.msg]} testID="access-msg">
          {msg}
        </Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  chips: { flexDirection: 'row', gap: spacing.sm },
  ink: { color: colors.ink },
  msg: { color: colors.given },
});
