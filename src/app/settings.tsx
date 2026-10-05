import React, { useEffect } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { BigButton } from '@/components/big-button';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { useLoad } from '@/hooks/use-load';
import { go } from '@/nav';
import { getSyncStatus, setBackup, signOut, syncSoon, type SyncStatus } from '@/sync/runtime';
import { colors, spacing, type } from '@/theme';

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('hi-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : 'अभी तक नहीं';

/** Settings is the hub: every item below opens exactly one screen. */
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
      <Text style={styles.h}>☁️ इंटरनेट बैकअप</Text>
      <Text style={styles.body}>
        जब तक आप बैकअप चालू नहीं करते, आपका हिसाब फ़ोन से बाहर नहीं जाता। चालू करने पर उसकी कॉपी सुरक्षित सर्वर पर रहती है, ताकि फ़ोन खोए तो साइन इन करके वापस मिले। फ़ोटो की कॉपी नहीं होती।
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
      {on ? <BigButton icon="🔄" label="अभी बैकअप लें" tone="plain" onPress={() => { syncSoon(); void load(); }} /> : null}
      {st && st.rejected > 0 ? (
        <BigButton icon="⚠️" label={`${st.rejected} एंट्री नहीं भेजी जा सकीं`} tone="plain" hint="कौन सी एंट्री, यह दिखाता है" onPress={() => go('/sync-errors')} />
      ) : null}
      {signedIn && !st?.user?.hasGoogle ? <BigButton icon="G" label="Google खाता जोड़ें" tone="plain" onPress={() => go('/signin?link=1')} /> : null}
      {signedIn && !st?.user?.hasPhone ? <BigButton icon="📱" label="मोबाइल नंबर जोड़ें" tone="plain" onPress={() => go('/phone?link=1')} /> : null}
      {signedIn ? <BigButton icon="🚪" label="साइन आउट" tone="red" onPress={out} /> : null}

      <Text style={styles.h}>📁 बिना साइन इन के बैकअप</Text>
      <BigButton icon="📤" label="बैकअप फ़ाइल बनाएं" tone="plain" onPress={() => go('/backup?mode=create')} hint="हिसाब की ताले वाली फ़ाइल बनाकर भेजें" />
      <BigButton icon="📥" label="बैकअप फ़ाइल से वापस लाएं" tone="plain" onPress={() => go('/backup?mode=restore')} hint="फ़ाइल चुनकर हिसाब वापस लाएँ" />

      <Text style={styles.h}>🔒 खाते और ताला</Text>
      <BigButton icon="📒" label="खाते (निजी खाता)" tone="plain" onPress={() => go('/ledgers')} hint="परिवार के सदस्य का अपना खाता" />
      <BigButton icon="🔐" label="ऐप का ताला" tone="plain" onPress={() => go('/app-lock')} hint="ऐप खोलने पर पिन" />

      <Text style={styles.h}>📄 जानकारी</Text>
      <BigButton icon="🔒" label="गोपनीयता नीति" tone="plain" onPress={() => go('/legal/privacy')} />
      <BigButton icon="📄" label="नियम व शर्तें" tone="plain" onPress={() => go('/legal/terms')} />
      <BigButton icon="☎️" label="शिकायत अधिकारी" tone="plain" onPress={() => go('/legal/grievance')} />

      {signedIn ? <BigButton icon="🗑" label="खाता हटाएं" tone="red" onPress={() => go('/account-delete')} hint="क्लाउड खाता और उसका हिसाब हमेशा के लिए हटाएँ" /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  h: { ...type.label, color: colors.inkBlue, marginTop: spacing.md },
  body: { ...type.body, color: colors.text },
  box: { gap: spacing.xs, padding: spacing.md, borderWidth: 2, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.card },
  line: { ...type.body, color: colors.text },
  muted: { ...type.body, color: colors.textMuted },
});
