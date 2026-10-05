import React, { useEffect } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { BigButton } from '@/components/big-button';
import { Card, SectionTitle } from '@/components/card';
import { Icon } from '@/components/icons';
import { Screen } from '@/components/screen';
import { SettingRow } from '@/components/setting-row';
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
      <SectionTitle icon="cloud">इंटरनेट बैकअप</SectionTitle>
      <Text style={[type.body, styles.body]}>
        जब तक आप बैकअप चालू नहीं करते, आपका हिसाब फ़ोन से बाहर नहीं जाता। चालू करने पर उसकी कॉपी सुरक्षित जगह रहती है, ताकि फ़ोन खोए तो साइन इन करके वापस मिले। फ़ोटो की कॉपी नहीं होती।
      </Text>
      <BigButton tone={on ? 'plain' : 'primary'} icon={on ? 'check' : 'cloud'} label={on ? 'बैकअप चालू है' : 'बैकअप चालू करें'} selected={on} onPress={toggle} />
      {signedIn ? (
        <Card tint={on ? 'success' : 'none'}>
          <Text style={type.body}>साइन इन: {st?.user?.displayName ?? st?.user?.phone ?? 'हाँ'}</Text>
          <Text style={type.body}>पिछला बैकअप: {fmt(st?.lastSyncAt ?? null)}</Text>
          <Text style={type.body}>भेजना बाकी: {st?.pending ?? 0}</Text>
          {on && st?.failed ? <Text style={[type.body, styles.muted]}>इंटरनेट नहीं मिला, बाद में अपने आप कोशिश होगी।</Text> : null}
        </Card>
      ) : (
        <View style={styles.note}>
          <Icon name="warn" size={24} color={colors.muted} />
          <Text style={[type.body, styles.muted, styles.noteText]}>बैकअप के लिए पहले साइन इन करना होगा।</Text>
        </View>
      )}
      {on ? <BigButton icon="refresh" label="अभी बैकअप लें" tone="plain" onPress={() => { syncSoon(); void load(); }} /> : null}
      {st && st.rejected > 0 ? (
        <SettingRow icon="warn" label={`${st.rejected} एंट्री नहीं भेजी जा सकीं`} sub="कौन सी एंट्री, यह दिखाता है" onPress={() => go('/sync-errors')} />
      ) : null}
      {signedIn && !st?.user?.hasGoogle ? <SettingRow icon="cloud" label="गूगल खाता जोड़ें" onPress={() => go('/signin?link=1')} /> : null}
      {signedIn && !st?.user?.hasPhone ? <SettingRow icon="phone" label="मोबाइल नंबर जोड़ें" onPress={() => go('/phone?link=1')} /> : null}
      {signedIn ? <SettingRow icon="logout" label="साइन आउट" onPress={out} /> : null}

      <SectionTitle icon="doc">बिना साइन इन के बैकअप</SectionTitle>
      <SettingRow icon="share" label="बैकअप फ़ाइल बनाएं" sub="ताले वाली फ़ाइल बनाकर भेजें" hint="हिसाब की ताले वाली फ़ाइल बनाकर भेजें" onPress={() => go('/backup?mode=create')} />
      <SettingRow icon="doc" label="बैकअप फ़ाइल से वापस लाएं" sub="फ़ाइल चुनकर हिसाब वापस लाएँ" onPress={() => go('/backup?mode=restore')} />

      <SectionTitle icon="lock">खाते और ताला</SectionTitle>
      <SettingRow icon="hisaab" label="खाते (निजी खाता)" sub="परिवार के सदस्य का अपना खाता" onPress={() => go('/ledgers')} />
      <SettingRow icon="lock" label="ऐप का ताला" sub="ऐप खोलने पर पिन" onPress={() => go('/app-lock')} />

      <SectionTitle icon="star">जानकारी</SectionTitle>
      <SettingRow icon="lock" label="गोपनीयता नीति" onPress={() => go('/legal/privacy')} />
      <SettingRow icon="doc" label="नियम व शर्तें" onPress={() => go('/legal/terms')} />
      <SettingRow icon="phone" label="शिकायत अधिकारी" onPress={() => go('/legal/grievance')} />

      {signedIn ? (
        <SettingRow icon="trash" danger label="खाता हटाएं" sub="क्लाउड खाता और उसका हिसाब हमेशा के लिए हटाएँ" onPress={() => go('/account-delete')} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { color: colors.ink },
  muted: { color: colors.muted },
  note: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  noteText: { flex: 1 },
});
