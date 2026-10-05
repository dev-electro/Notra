import React, { useCallback, useState } from 'react';
import { StyleSheet } from 'react-native';
import { BigButton } from '@/components/big-button';
import { Card } from '@/components/card';
import { Icon } from '@/components/icons';
import { PinFlow } from '@/components/pin-flow';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { clearAppLock, getDb, isAppLockOn, setAppLockPin, verifyAppLockPin, type Db } from '@/db';
import { useLoad } from '@/hooks/use-load';
import { guarded } from '@/services/guard';
import { newPinHash } from '@/services/pin-hash';
import { showToast } from '@/services/toast';
import { colors, spacing, type } from '@/theme';

type Mode = 'home' | 'on' | 'off' | 'change';
const dbOf = async () => (await getDb()) as unknown as Db;

/** "ऐप का ताला": a PIN when the app opens and after 2 minutes away. Off unless the person turns it on. */
export default function AppLock() {
  const { data: on, reload } = useLoad<boolean>((db) => isAppLockOn(db), false);
  const [mode, setMode] = useState<Mode>('home');
  const check = useCallback(async (pin: string) => verifyAppLockPin(await dbOf(), pin), []);
  const home = () => {
    setMode('home');
    reload();
  };

  if (mode !== 'home') {
    return (
      <Screen title={mode === 'on' ? 'ताला लगाएं' : mode === 'off' ? 'ताला हटाएं' : 'पिन बदलें'} onBack={home}>
        <PinFlow
          verify={mode !== 'on'}
          askNew={mode !== 'off'}
          check={check}
          verifyTitle="अभी का पिन डालें"
          onDone={async (pin) => {
            const ok = await guarded(async () => {
              if (mode === 'off') await clearAppLock(await dbOf());
              else await setAppLockPin(await dbOf(), newPinHash(pin!));
              return true;
            });
            if (ok) {
              showToast(mode === 'off' ? 'ताला हट गया' : 'ताला लग गया');
              home();
            }
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen
      title="ऐप का ताला"
      action={on ? { label: 'ताला हटाएं', icon: 'unlock', onPress: () => setMode('off') } : { label: 'ताला लगाएं', icon: 'lock', onPress: () => setMode('on') }}
    >
      <Card tint={on ? 'success' : 'haldi'} style={styles.card}>
        <Icon name={on ? 'lock' : 'unlock'} size={44} color={on ? colors.successInk : colors.ink} />
        <Text style={[type.body, styles.body]}>
          {on ? 'ताला लगा है। ऐप खोलते समय, और 2 मिनट बाहर रहने के बाद, पिन पूछा जाएगा।' : 'ताला बंद है। चालू करने पर ऐप खोलते समय पिन पूछा जाएगा।'}
        </Text>
      </Card>
      {on ? <BigButton icon="refresh" label="पिन बदलें" tone="plain" onPress={() => setMode('change')} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm, alignItems: 'flex-start' },
  body: { color: colors.ink },
});
