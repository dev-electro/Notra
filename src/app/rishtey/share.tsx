import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { BigButton } from '@/components/big-button';
import { Card, SectionTitle } from '@/components/card';
import { Field } from '@/components/field';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { BIODATA_KEY, parseBiodata } from '@/core';
import { getDb, getSetting, type Db } from '@/db';
import { ConsentCheck } from '@/features/rishte/ConsentCheck';
import { StatusChip } from '@/features/rishte/discovery';
import { back } from '@/nav';
import {
  CONSENT_LINE, draftFromBiodata, draftFromServer, draftProblems, EMPTY_DRAFT, GENDER_LABEL, PRIVATE_NOTE, PROBLEM_LABEL, PUBLIC_ITEMS, PUBLISHED_BY, type ServerProfile, type ShareDraft,
} from '@/rishtey/logic';
import { deleteMyProfile, errorText, getMyProfile, hideMyProfile, publishMyProfile, saveMyProfile } from '@/rishtey/service';
import { showToast } from '@/services/toast';
import { colors, spacing, type } from '@/theme';

type Key = keyof ShareDraft;
const TEXT_FIELDS: { key: Key; label: string; keyboardType?: 'number-pad' | 'phone-pad' }[] = [
  { key: 'first_name', label: 'पहला नाम' },
  { key: 'age', label: 'उम्र (साल)', keyboardType: 'number-pad' },
  { key: 'height_cm', label: 'कद (सेंटीमीटर, मर्ज़ी से)', keyboardType: 'number-pad' },
  { key: 'gotra', label: 'गोत्र' },
  { key: 'education', label: 'शिक्षा' },
  { key: 'occupation', label: 'व्यवसाय' },
  { key: 'district', label: 'ज़िला' },
  { key: 'state', label: 'राज्य' },
];

/**
 * समाज में दिखाएँ. Starts from the local biodata, shows exactly what becomes public, asks for an explicit tick, and sends the profile for
 * review. Nothing is visible to anyone until a moderator approves it. Hide and delete are always one tap away.
 */
export default function Share() {
  const [draft, setDraft] = useState<ShareDraft>(EMPTY_DRAFT);
  const [mine, setMine] = useState<ServerProfile | null>(null);
  const [phoneOk, setPhoneOk] = useState(true);
  const [ready, setReady] = useState(false);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await getMyProfile();
        if (!alive) return;
        setPhoneOk(r.phone_verified);
        if (r.profile) {
          setMine(r.profile);
          setDraft(draftFromServer(r.profile));
        } else {
          const db = (await getDb()) as unknown as Db;
          setDraft(draftFromBiodata(parseBiodata(await getSetting(db, BIODATA_KEY)), new Date()));
        }
      } catch (e) {
        if (alive) setMsg(errorText(e));
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const set = (k: Key, v: string) => setDraft((d) => ({ ...d, [k]: v }));
  const problems = draftProblems(draft);
  const canSend = ready && consent && problems.length === 0 && phoneOk && !busy;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMsg('');
    try {
      await fn();
    } catch (e) {
      setMsg(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const send = () =>
    run(async () => {
      await saveMyProfile(draft);
      const p = await publishMyProfile();
      setMine(p);
      showToast('जाँच के लिए भेज दिया');
      back();
    });
  const hide = () =>
    run(async () => {
      setMine(await hideMyProfile());
      showToast('अब आपकी जानकारी किसी को नहीं दिखेगी');
    });
  const remove = () =>
    Alert.alert('हमेशा के लिए हटाएँ?', 'आपकी जानकारी और सभी रुचि-संदेश मिट जाएँगे। आपका बायोडाटा फ़ोन में रहेगा।', [
      { text: 'रहने दें', style: 'cancel' },
      {
        text: 'हटाएँ',
        style: 'destructive',
        onPress: () => void run(async () => {
          await deleteMyProfile();
          setMine(null);
          setConsent(false);
          showToast('हटा दिया');
        }),
      },
    ]);

  return (
    <Screen
      title="समाज में दिखाएँ"
      speakText="अपनी जानकारी समाज के लोगों को दिखाने के लिए भेजें। जाँच के बाद ही दिखेगी। संपर्क नंबर सबको नहीं दिखता।"
      action={{ testID: 'btn-rishtey-send', icon: 'check', label: mine?.status === 'pending' ? 'फिर से भेजें' : 'जाँच के लिए भेजें', onPress: send, disabled: !canSend, hint: 'जानकारी जाँच के लिए भेजें' }}
    >
      {/* 1. where things stand */}
      <Card>
        {mine ? <StatusChip status={mine.status} /> : null}
        {mine?.status === 'rejected' && mine.reject_reason ? <Text style={[type.body, styles.bad]}>कारण: {mine.reject_reason}</Text> : null}
        {mine?.status === 'pending' ? <Text style={type.caption}>जाँच पूरी होने तक यह किसी को नहीं दिखेगी।</Text> : null}
        {!phoneOk ? <Text style={[type.bodyBold, styles.bad]}>दिखाने के लिए फ़ोन नंबर पक्का होना चाहिए। सेटिंग्स में फ़ोन से साइन इन करें।</Text> : null}
        {msg ? <Text style={[type.bodyBold, styles.bad]} accessibilityLiveRegion="polite">{msg}</Text> : null}
        <Text style={[type.caption, styles.muted]}>आपके बायोडाटा से भरा गया है। जो ठीक न लगे, बदल दें।</Text>
      </Card>

      {/* 2. the details */}
      <View style={styles.group}>
        <SectionTitle>जानकारी</SectionTitle>
        <View style={styles.wrap}>
          {(['female', 'male'] as const).map((id) => (
            <BigButton key={id} testID={`rt-gender-${id}`} compact tone="plain" selected={draft.gender === id} label={GENDER_LABEL[id]} onPress={() => setDraft((d) => ({ ...d, gender: id }))} />
          ))}
        </View>
        {draft.gender === null ? <Text style={[type.caption, styles.muted]}>चुनें: यह जानकारी लड़की की है या लड़के की।</Text> : null}
        {TEXT_FIELDS.map((f) => (
          <Field key={f.key} testID={`rt-${f.key}`} label={f.label} value={String(draft[f.key] ?? '')} onChangeText={(t) => set(f.key, t)} keyboardType={f.keyboardType} maxLength={f.key === 'age' || f.key === 'height_cm' ? 3 : 80} />
        ))}
        <Field testID="rt-contact" label="संपर्क नंबर (सबको नहीं दिखेगा)" value={draft.contact} onChangeText={(t) => set('contact', t)} keyboardType="phone-pad" maxLength={20} />
      </View>

      {/* 3. who is posting */}
      <View style={styles.group}>
        <SectionTitle>यह जानकारी कौन डाल रहा है?</SectionTitle>
        <View style={styles.wrap}>
          {PUBLISHED_BY.map((o) => (
            <BigButton key={o.id} compact tone="plain" selected={draft.published_by === o.id} label={o.label} onPress={() => setDraft((d) => ({ ...d, published_by: o.id }))} />
          ))}
        </View>
      </View>

      {/* 4. consent: exactly what becomes public */}
      <Card tint="haldi" testID="rishtey-consent-card">
        <SectionTitle>जाँच के बाद यह सबको दिखेगा</SectionTitle>
        {PUBLIC_ITEMS.map((t) => (
          <Text key={t} style={type.body}>• {t}</Text>
        ))}
        <Text style={[type.caption, styles.muted]}>{PRIVATE_NOTE}</Text>
        <ConsentCheck testID="chk-rishtey-consent" checked={consent} onChange={setConsent} label={CONSENT_LINE} />
        {problems.length > 0 && consent ? problems.map((p) => <Text key={p} style={[type.caption, styles.bad]}>• {PROBLEM_LABEL[p]}</Text>) : null}
      </Card>

      {/* 5. take it back */}
      {mine ? (
        <View style={styles.group}>
          {mine.status === 'approved' || mine.status === 'pending' ? <BigButton tone="plain" icon="lock" label="अभी छिपा दें" onPress={hide} disabled={busy} hint="जानकारी तुरंत किसी को नहीं दिखेगी" /> : null}
          <BigButton tone="danger" icon="trash" label="हमेशा के लिए हटाएँ" onPress={remove} disabled={busy} />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.md },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  muted: { color: colors.muted },
  bad: { color: colors.given },
});
