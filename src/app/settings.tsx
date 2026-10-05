import React, { useEffect, useSyncExternalStore } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { getAdsState, subscribeAds } from '@/ads/state';
import { showPrivacyOptions } from '@/ads/service';
import { NoticeBanners } from '@/components/notice-banners';
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
import { getAnalyticsOptIn, setAnalyticsOptIn, subscribeAnalyticsOptIn, track } from '@/analytics';

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

  const ads = useSyncExternalStore(subscribeAds, getAdsState, getAdsState);
  const stats = useSyncExternalStore(subscribeAnalyticsOptIn, getAnalyticsOptIn, getAnalyticsOptIn);
  const signedIn = !!st?.user;
  const on = !!st?.enabled && signedIn;

  const toggle = async () => {
    if (!signedIn) return go('/signin');
    await setBackup(!on);
    track(on ? 'cloud_backup_disabled' : 'cloud_backup_enabled');
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
      <NoticeBanners scope="settings" />
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

      <SectionTitle icon="phone">मदद</SectionTitle>
      <SettingRow icon="write" label="शिकायत / सुझाव" sub="अपनी बात हमें लिखकर भेजें" onPress={() => go('/support')} />
      <SettingRow icon="lock" label="सहायता को मेरा डेटा दिखाएं" sub="कुछ दिनों के लिए, सिर्फ़ देखने के लिए" onPress={() => go('/support-access')} />

      <SectionTitle icon="star">जानकारी</SectionTitle>
      <Card testID="info-ads">
        <Text style={type.bodyBold}>विज्ञापन</Text>
        <Text style={[type.caption, styles.muted]}>
          ऐप मुफ़्त रखने के लिए कुछ पन्नों (घर, हिसाब और लंबी सूचियों) पर Google के विज्ञापन दिखते हैं। एंट्री, पिन और सेटिंग के पन्नों पर कभी नहीं। आपका हिसाब विज्ञापन वालों को नहीं जाता।
        </Text>
      </Card>
      <Card testID="info-analytics">
        <Text style={type.bodyBold}>उपयोग के आँकड़े</Text>
        <Text style={[type.caption, styles.muted]}>
          ऐप कौन से पन्ने और सुविधाएँ कितनी चलती हैं, यह गिनने के लिए Google Analytics for Firebase। आपके हिसाब की कोई बात (नाम, गाँव, फ़ोन, रकम) कभी नहीं जाती। जब चाहें बंद करें।
        </Text>
      </Card>
      <BigButton
        testID="toggle-analytics"
        tone={stats ? 'plain' : 'primary'}
        icon={stats ? 'check' : 'lock'}
        label="ऐप सुधार के लिए उपयोग के आँकड़े भेजें"
        selected={stats}
        hint={stats ? 'अभी चालू है, दबाकर बंद करें' : 'अभी बंद है, दबाकर चालू करें'}
        onPress={() => void setAnalyticsOptIn(!stats)}
      />
      {ads.privacyOptions ? <SettingRow icon="lock" label="विज्ञापन गोपनीयता विकल्प" sub="विज्ञापन के लिए अपनी सहमति बदलें" onPress={() => void showPrivacyOptions()} /> : null}
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
