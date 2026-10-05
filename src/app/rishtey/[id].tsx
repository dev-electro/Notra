import { useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { Avatar } from '@/components/avatar';
import { BigButton } from '@/components/big-button';
import { Card } from '@/components/card';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { ProfileFacts } from '@/features/rishte/discovery';
import { back } from '@/nav';
import { INTEREST_LABEL, REPORT_REASONS, type ReportReason } from '@/rishtey/logic';
import { answerInterest, blockProfile, errorText, getContact, getPublicProfile, listInterests, reportProfile, sendInterest } from '@/rishtey/service';
import { useServer } from '@/rishtey/use-server';
import { showToast } from '@/services/toast';
import { colors, spacing, type } from '@/theme';

/** One profile: public details, a single "रुचि भेजें", and the safety actions. The contact number appears only once both sides said yes. */
export default function ProfileDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const pid = String(id ?? '');
  const { data: p, loading, error, reload } = useServer(() => getPublicProfile(pid));
  const [contact, setContact] = useState<{ first_name: string; contact: string } | null>(null);
  const [reporting, setReporting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

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
  const interest = p?.my_interest ?? null;

  const accept = (yes: boolean) =>
    run(async () => {
      const row = (await listInterests('received')).find((r) => r.profile.id === pid && r.status === 'sent');
      if (row) await answerInterest(row.id, yes);
      showToast(yes ? 'रुचि स्वीकार की' : 'ठीक है');
      if (yes) reload();
      else back();
    });
  const block = () =>
    Alert.alert('इन्हें ब्लॉक करें?', 'न ये आपको दिखेंगे, न आप इन्हें।', [
      { text: 'रहने दें', style: 'cancel' },
      { text: 'ब्लॉक करें', style: 'destructive', onPress: () => void run(async () => { await blockProfile(pid); showToast('ब्लॉक कर दिया'); back(); }) },
    ]);
  const report = (reason: ReportReason) =>
    run(async () => {
      await reportProfile(pid, reason);
      setReporting(false);
      showToast('रिपोर्ट मिल गई, धन्यवाद');
    });

  return (
    <Screen title={p ? p.first_name : 'प्रोफ़ाइल'}>
      {!p ? (
        <Text style={[type.body, error ? styles.bad : styles.muted]}>{loading ? 'आ रहा है…' : error || 'प्रोफ़ाइल नहीं मिली।'}</Text>
      ) : (
        <>
          <Card>
            <View style={styles.top}>
              <Avatar name={p.first_name} size={64} />
              <Text style={type.title}>{p.first_name}, {p.age}</Text>
            </View>
            <ProfileFacts p={p} />
          </Card>

          <Card tint={interest === 'accepted' ? 'success' : 'none'}>
            {interest === null ? <BigButton testID="btn-rishtey-interest" tone="primary" icon="check" label="रुचि भेजें" disabled={busy} hint="सामने वाले को आपकी रुचि पता चलेगी" onPress={() => run(async () => { const s = await sendInterest(pid); showToast(s === 'accepted' ? 'दोनों राज़ी हैं' : 'रुचि भेज दी'); reload(); })} /> : null}
            {interest === 'sent' ? <Text style={type.bodyBold}>{INTEREST_LABEL.sent}। जवाब आने पर यहाँ दिखेगा।</Text> : null}
            {interest === 'received' ? (
              <>
                <Text style={type.bodyBold}>{INTEREST_LABEL.received}</Text>
                <View style={styles.wrap}>
                  <BigButton testID="btn-rishtey-accept" compact tone="primary" label="स्वीकार करें" onPress={() => accept(true)} disabled={busy} />
                  <BigButton compact tone="plain" label="अभी नहीं" onPress={() => accept(false)} disabled={busy} />
                </View>
              </>
            ) : null}
            {interest === 'accepted' ? (
              <>
                <Text style={type.bodyBold}>{INTEREST_LABEL.accepted}</Text>
                {contact ? (
                  <Text style={[type.title, styles.num]} selectable testID="rishtey-contact">{contact.contact}</Text>
                ) : (
                  <BigButton testID="btn-rishtey-contact" tone="primary" icon="phone" label="संपर्क नंबर देखें" disabled={busy} onPress={() => run(async () => setContact(await getContact(pid)))} />
                )}
              </>
            ) : null}
            {msg ? <Text style={[type.bodyBold, styles.bad]} accessibilityLiveRegion="polite">{msg}</Text> : null}
          </Card>

          <Card>
            {reporting ? (
              <>
                <Text style={type.bodyBold}>क्या गड़बड़ है?</Text>
                <View style={styles.wrap}>
                  {REPORT_REASONS.map((r) => <BigButton key={r.id} small tone="plain" label={r.label} onPress={() => report(r.id)} disabled={busy} />)}
                </View>
                <BigButton tone="plain" label="रहने दें" onPress={() => setReporting(false)} />
              </>
            ) : (
              <View style={styles.wrap}>
                <BigButton compact tone="plain" icon="warn" label="रिपोर्ट करें" onPress={() => setReporting(true)} />
                <BigButton compact tone="danger" icon="lock" label="ब्लॉक करें" onPress={block} disabled={busy} />
              </View>
            )}
          </Card>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  num: { color: colors.successInk },
  muted: { color: colors.muted },
  bad: { color: colors.given },
});
