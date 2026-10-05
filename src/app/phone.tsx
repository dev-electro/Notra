import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '@/components/text';
import { BigButton } from '@/components/big-button';
import { Screen } from '@/components/screen';
import { authErrorMessage } from '@/auth/messages';
import { afterSignIn, CANCELLED_MESSAGE } from '@/auth/after-signin';
import { back, replace } from '@/nav';
import { linkPhone, otpStart, otpVerify } from '@/sync/runtime';
import { colors, MIN_TOUCH, spacing } from '@/theme';

const RESEND_S = 30;

/** Mobile-number sign-in: number -> 6-digit code (6 big boxes). link=1 adds the number to the current account. */
export default function Phone() {
  const { link } = useLocalSearchParams<{ link?: string }>();
  const [step, setStep] = useState<'number' | 'code'>('number');
  const [num, setNum] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [left, setLeft] = useState(0);
  const codeRef = useRef<React.ComponentRef<typeof TextInput>>(null);

  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);

  const send = async () => {
    setBusy(true);
    setErr('');
    try {
      const r = await otpStart(num);
      setLeft(r.resendAfter ?? RESEND_S);
      setCode('');
      setStep('code');
    } catch (e) {
      setErr(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (c: string) => {
    setBusy(true);
    setErr('');
    try {
      if (link) {
        await linkPhone(num, c);
        back();
      } else if (await afterSignIn(await otpVerify(num, c))) replace('/');
      else {
        setErr(CANCELLED_MESSAGE);
        setCode('');
      }
    } catch (e) {
      setErr(authErrorMessage(e));
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const onCode = (t: string) => {
    const c = t.replace(/\D/g, '').slice(0, 6);
    setCode(c);
    if (c.length === 6 && !busy) void verify(c);
  };

  if (step === 'number') {
    return (
      <Screen title="मोबाइल नंबर" onBack={back}>
        <Text style={styles.q}>अपना 10 अंकों का मोबाइल नंबर डालें</Text>
        <View style={styles.numRow}>
          <Text style={styles.prefix}>+91</Text>
          <TextInput
            style={styles.number}
            value={num}
            onChangeText={(t) => setNum(t.replace(/\D/g, '').slice(0, 10))}
            keyboardType="number-pad"
            maxLength={10}
            autoFocus
            accessibilityLabel="मोबाइल नंबर"
            accessibilityHint="10 अंकों का नंबर डालें"
          />
        </View>
        {err ? <Text style={styles.err}>{err}</Text> : null}
        <BigButton icon="➡️" label="कोड भेजें" onPress={send} disabled={num.length !== 10 || busy} />
      </Screen>
    );
  }

  return (
    <Screen title="कोड डालें" onBack={() => setStep('number')}>
      <Text style={styles.q}>+91 {num} पर 6 अंकों का कोड भेजा गया है</Text>
      <Pressable onPress={() => codeRef.current?.focus()} style={styles.boxes} accessibilityLabel="6 अंकों का कोड" accessibilityHint="कोड डालने के लिए दबाएँ">
        {Array.from({ length: 6 }, (_, i) => (
          <View key={i} style={[styles.box, i === code.length && styles.boxActive]}>
            <Text style={styles.digit}>{code[i] ?? ''}</Text>
          </View>
        ))}
      </Pressable>
      <TextInput
        ref={codeRef}
        value={code}
        onChangeText={onCode}
        keyboardType="number-pad"
        maxLength={6}
        autoFocus
        style={styles.hidden}
        caretHidden
        accessibilityLabel="6 अंकों का कोड"
      />
      {err ? <Text style={styles.err}>{err}</Text> : null}
      <BigButton icon="✔" label={busy ? 'डेटा देख रहे हैं…' : 'आगे बढ़ें'} onPress={() => verify(code)} disabled={code.length !== 6 || busy} />
      <BigButton icon="🔁" label={left > 0 ? `दोबारा कोड भेजें (${left})` : 'दोबारा कोड भेजें'} tone="plain" onPress={send} disabled={left > 0 || busy} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  q: { fontSize: 22, lineHeight: 32, fontWeight: '700', color: colors.text },
  numRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  prefix: { fontSize: 32, fontWeight: '700', color: colors.inkBlue },
  number: {
    flex: 1, minHeight: 72, borderWidth: 2, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.card,
    paddingHorizontal: spacing.md, fontSize: 36, letterSpacing: 2, color: colors.text,
  },
  boxes: { flexDirection: 'row', gap: spacing.xs, justifyContent: 'space-between' },
  box: {
    flex: 1, minHeight: MIN_TOUCH + 16, borderWidth: 2, borderColor: colors.border, borderRadius: 10,
    backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center',
  },
  boxActive: { borderColor: colors.inkBlue },
  digit: { fontSize: 36, fontWeight: '700', color: colors.inkBlue },
  hidden: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  err: { fontSize: 20, lineHeight: 28, color: colors.inkRed, fontWeight: '700' },
});
