import React, { useCallback, useState } from 'react';
import { StyleSheet } from 'react-native';
import { BigButton } from '@/components/big-button';
import { PinPad } from '@/components/pin-pad';
import { Text } from '@/components/text';
import { formatWait, type PinCheck } from '@/core';
import {
  afterConfirm, afterNew, afterVerify, isWeakPin, startFlow, type PinFlowOptions, type PinFlowState,
} from '@/ledgers/pin-flow';
import { colors, spacing, type } from '@/theme';

interface Props extends PinFlowOptions {
  /** Checks the current PIN (with back-off). Required when `verify` is true. */
  check?: (pin: string) => Promise<PinCheck>;
  /** Heading for the verify step, e.g. "पिन डालें". */
  verifyTitle?: string;
  /** Called when every step is done. `pin` is the new PIN when `askNew` was true. */
  onDone: (pin?: string) => void | Promise<void>;
}

/** Runs the verify / choose / repeat steps of a PIN screen. The rules live in ledgers/pin-flow.ts. */
export function PinFlow({ verify, askNew, check, verifyTitle = 'पिन डालें', onDone }: Props) {
  const opts = { verify, askNew };
  const [s, setS] = useState<PinFlowState>(() => startFlow(opts));
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const finish = useCallback(
    async (pin?: string) => {
      setBusy(true);
      try {
        await onDone(pin);
      } finally {
        setBusy(false);
      }
    },
    [onDone],
  );

  const onPin = useCallback(
    async (pin: string) => {
      if (s.step === 'verify') {
        setBusy(true);
        try {
          const r = await check!(pin);
          if (r.ok) {
            setMsg('');
            const n = afterVerify(opts);
            setS(n);
            if (n.step === 'done') await finish(undefined);
          } else if (r.reason === 'locked') setMsg(`बहुत ग़लत कोशिशें हुईं। ${formatWait(r.waitMs)} बाद फिर कोशिश करें।`);
          else setMsg(r.attempts.lockedUntil > Date.now() ? `पिन ग़लत है। ${formatWait(r.attempts.lockedUntil - Date.now())} रुकना होगा।` : 'पिन ग़लत है, फिर से डालें।');
        } finally {
          setBusy(false);
        }
      } else if (s.step === 'new') {
        setMsg(isWeakPin(pin) ? 'यह पिन आसानी से अंदाज़े में आ सकता है। चाहें तो दूसरा चुनें।' : '');
        setS(afterNew(pin));
      } else if (s.step === 'confirm') {
        const n = afterConfirm(s, pin);
        setS(n);
        if (n.step === 'done') {
          setMsg('');
          await finish(n.pin);
        } else setMsg('दोनों पिन अलग हैं। नया पिन फिर से चुनें।');
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [s, check, finish, verify, askNew],
  );

  const title =
    s.step === 'verify' ? verifyTitle : s.step === 'new' ? 'नया 4 अंकों का पिन चुनें' : s.step === 'confirm' ? 'वही पिन फिर से डालें' : '';
  return (
    <>
      <Text style={styles.title} accessibilityRole="header" accessibilityLiveRegion="polite">
        {title}
      </Text>
      {msg ? (
        <Text style={styles.msg} accessibilityLiveRegion="polite">
          {msg}
        </Text>
      ) : null}
      <PinPad onComplete={onPin} disabled={busy || s.step === 'done'} />
      {s.step === 'confirm' ? <BigButton icon="↺" label="पिन दोबारा चुनें" tone="plain" onPress={() => { setS({ step: 'new' }); setMsg(''); }} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  title: { ...type.label, color: colors.text },
  msg: { ...type.body, fontWeight: '700', color: colors.inkRed, marginBottom: spacing.xs },
});
