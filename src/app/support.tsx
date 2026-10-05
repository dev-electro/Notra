import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { getAuthUser } from '@/auth/session';
import { BigButton } from '@/components/big-button';
import { Card, SectionTitle } from '@/components/card';
import { Field } from '@/components/field';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { CONTACT } from '@/legal/content';
import { go } from '@/nav';
import { showToast } from '@/services/toast';
import { CATEGORIES, draftProblems, MESSAGE_MAX, SUBJECT_MAX, type SupportCategory } from '@/support/logic';
import { submitSupport } from '@/support/service';
import { colors, spacing, type } from '@/theme';
import { track } from '@/analytics';
import { supportCategory } from '@/analytics/events';

/**
 * शिकायत / सुझाव: category chips, a subject and a message, sent to POST /v1/support. It needs a signed-in account (so we can
 * answer); signed out, the person is asked to sign in or shown the grievance email. With no internet the ticket is queued and
 * goes out by itself later.
 */
export default function Support() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [category, setCategory] = useState<SupportCategory | null>(null);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<'sent' | 'queued' | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    void getAuthUser().then((u) => setSignedIn(!!u));
  }, []);

  const problems = draftProblems({ category, subject, message });
  const send = async () => {
    setBusy(true);
    setErr('');
    try {
      const r = await submitSupport({ category, subject, message });
      track('support_ticket_submitted', { category: supportCategory(category) });
      setResult(r);
      if (r === 'sent') showToast('आपकी बात हम तक पहुँच गई');
    } catch {
      setErr('अभी भेज नहीं पाए, दोबारा कोशिश करें।');
    } finally {
      setBusy(false);
    }
  };

  if (signedIn === false) {
    return (
      <Screen title="शिकायत / सुझाव">
        <Card tint="haldi" style={styles.card}>
          <Text style={[type.bodyBold, styles.ink]}>शिकायत भेजने के लिए पहले साइन इन करें, ताकि हम आपको जवाब दे सकें।</Text>
          <Text style={[type.body, styles.ink]}>साइन इन न करना चाहें तो इस पते पर लिखें:</Text>
          <Text style={[type.bodyBold, styles.mail]} selectable testID="support-email">
            {CONTACT.email}
          </Text>
          <Text style={[type.caption, styles.muted]}>पिन, पासवर्ड या OTP कभी न भेजें।</Text>
        </Card>
        <BigButton testID="btn-support-signin" tone="primary" icon="cloud" label="साइन इन करें" onPress={() => go('/signin')} />
        <BigButton icon="phone" label="शिकायत अधिकारी का पेज" onPress={() => go('/legal/grievance')} />
      </Screen>
    );
  }

  if (result) {
    return (
      <Screen title="शिकायत / सुझाव" action={{ label: 'ठीक है', icon: 'check', onPress: () => go('/settings') }}>
        <Card tint="success" style={styles.card}>
          <Text style={[type.heading, styles.ink]} testID="support-result">
            {result === 'sent' ? 'धन्यवाद, आपकी बात हम तक पहुँच गई।' : 'आपकी बात सहेज ली गई है।'}
          </Text>
          <Text style={[type.body, styles.ink]}>
            {result === 'sent' ? `हम ${CONTACT.responseDays} दिन के अंदर जवाब देंगे।` : 'इंटरनेट आते ही यह अपने आप भेज दी जाएगी।'}
          </Text>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen
      title="शिकायत / सुझाव"
      action={{ testID: 'btn-support-send', icon: 'share', label: busy ? 'भेज रहे हैं…' : 'भेजें', disabled: busy || problems.length > 0 || signedIn === null, onPress: send, hint: 'आपकी बात हमें भेजता है' }}
    >
      <SectionTitle icon="write">किस बारे में?</SectionTitle>
      <View style={styles.chips}>
        {CATEGORIES.map((c) => (
          <BigButton key={c.id} testID={`support-cat-${c.id}`} compact label={c.label} selected={category === c.id} onPress={() => setCategory(c.id)} />
        ))}
      </View>
      <Field testID="field-support-subject" label="विषय" value={subject} onChangeText={setSubject} maxLength={SUBJECT_MAX} />
      <Field testID="field-support-message" label="आपकी बात" value={message} onChangeText={setMessage} maxLength={MESSAGE_MAX} multiline style={styles.multi} />
      <Text style={[type.caption, styles.muted]}>पिन, पासवर्ड या OTP कभी न लिखें।</Text>
      {err ? <Text style={[type.bodyBold, styles.err]}>{err}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  multi: { minHeight: 160, textAlignVertical: 'top', paddingTop: spacing.sm },
  ink: { color: colors.ink },
  muted: { color: colors.muted },
  mail: { color: colors.received },
  err: { color: colors.given },
});
