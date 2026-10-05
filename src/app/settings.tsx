import React, { useEffect } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { BigButton } from '@/components/big-button';
import { Screen } from '@/components/screen';
import { useLoad } from '@/hooks/use-load';
import { go } from '@/nav';
import { getSyncStatus, setBackup, signOut, syncSoon, type SyncStatus } from '@/sync/runtime';
import { colors, spacing } from '@/theme';

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('hi-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : 'अभी तक नहीं';

/** Cloud backup: off by default; needs sign-in. Shows last sync time and how many rows are waiting. */
export default function Settings() {
  const { data: st, reload } = useLoad<SyncStatus | null>(() => getSyncStatus(), null);
  const load = async () => void reload();

  useEffect(() => {
    const t = setInterval(reload, 3000); // keeps "pending" and "last backup" fresh while the screen is open
    return () => clearInterval(t);
  }, [reload]);

  const signedIn = !!st?.user;
  const on = !!st?.enabled && signedIn;

  const toggle = async () => {
    if (!signedIn) return go('/signin');
    await setBackup(!on);
    await load();
  };

  const out = () =>
    Alert.alert('साइन आउट', 'आपका डेटा इस फ़ोन पर रहेगा। क्लाउड बैकअप बंद हो जाएगा।', [
      { text: 'रुकें', style: 'cancel' },
      { text: 'साइन आउट', onPress: async () => { await signOut(false); await load(); } },
      {
        text: 'डेटा भी मिटाएँ',
        style: 'destructive',
        onPress: () =>
          Alert.alert('इस फ़ोन का सारा डेटा मिटाएँ?', 'क्लाउड पर जो बैकअप है वह रहेगा, पर इस फ़ोन से सब हट जाएगा।', [
            { text: 'रुकें', style: 'cancel' },
            { text: 'हाँ, मिटाएँ', style: 'destructive', onPress: async () => { await signOut(true); await load(); } },
          ]),
      },
    ]);

  return (
    <Screen title="सेटिंग">
      <Text style={styles.h}>क्लाउड बैकअप</Text>
      <Text style={styles.body}>
        आपका सारा डेटा इसी फ़ोन में रहता है। जब तक आप बैकअप चालू नहीं करते, कुछ भी बाहर नहीं जाता। चालू करने पर डेटा इंटरनेट से सुरक्षित सर्वर पर कॉपी होता है, ताकि फ़ोन खो जाए या बदलें तो साइन इन करके वापस मिल जाए। फ़ोटो अभी बैकअप नहीं होतीं।
      </Text>
      <BigButton icon={on ? '✔' : '☁️'} label={on ? 'बैकअप चालू है' : 'बैकअप चालू करें'} selected={on} onPress={toggle} />
      {signedIn ? (
        <View style={styles.box}>
          <Text style={styles.line}>साइन इन: {st?.user?.displayName ?? st?.user?.phone ?? 'हाँ'}</Text>
          <Text style={styles.line}>पिछला बैकअप: {fmt(st?.lastSyncAt ?? null)}</Text>
          <Text style={styles.line}>भेजना बाकी: {st?.pending ?? 0}</Text>
          {on && st?.failed ? <Text style={styles.muted}>इंटरनेट नहीं मिला, बाद में अपने आप कोशिश होगी।</Text> : null}
        </View>
      ) : (
        <Text style={styles.muted}>बैकअप के लिए पहले साइन इन करना होगा।</Text>
      )}
      {on ? <BigButton label="अभी बैकअप लें" tone="plain" onPress={() => { syncSoon(); void load(); }} /> : null}
      {signedIn && !st?.user?.hasGoogle ? <BigButton label="Google खाता जोड़ें" tone="plain" onPress={() => go('/signin?link=1')} /> : null}
      {signedIn && !st?.user?.hasPhone ? <BigButton label="मोबाइल नंबर जोड़ें" tone="plain" onPress={() => go('/phone?link=1')} /> : null}
      {signedIn ? <BigButton label="साइन आउट" tone="red" onPress={out} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  h: { fontSize: 26, fontWeight: '700', color: colors.inkBlue },
  body: { fontSize: 20, lineHeight: 30, color: colors.text },
  box: { gap: spacing.xs, padding: spacing.md, borderWidth: 2, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.card },
  line: { fontSize: 22, lineHeight: 30, color: colors.text },
  muted: { fontSize: 20, lineHeight: 28, color: colors.textMuted },
});
