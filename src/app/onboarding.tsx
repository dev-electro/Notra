import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BigButton } from '@/components/big-button';
import { RuledPaper } from '@/components/ruled-paper';
import { Text } from '@/components/text';
import { getDb, setSetting, type Db } from '@/db';
import { replace } from '@/nav';
import { ONBOARDING_CARDS } from '@/onboarding/content';
import { speak, stopSpeaking } from '@/services/speech';
import { colors, spacing, type } from '@/theme';

/**
 * First launch, before sign-in: big picture cards read aloud in Hindi (starts by itself). One main button (आगे), a repeat
 * button, and छोड़ें to skip everything.
 */
export default function Onboarding() {
  const [i, setI] = useState(0);
  const card = ONBOARDING_CARDS[i]!;
  const last = i === ONBOARDING_CARDS.length - 1;

  useEffect(() => {
    void speak(card.speech);
    return () => void stopSpeaking();
  }, [card]);

  const finish = useCallback(async () => {
    void stopSpeaking();
    try {
      await setSetting((await getDb()) as unknown as Db, 'onboarding_seen', '1');
    } catch {
      /* worst case the cards show once more */
    }
    replace('/');
  }, []);

  return (
    <RuledPaper>
      <SafeAreaView style={styles.safe}>
        <View style={styles.body}>
          <Text style={styles.picture} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {card.picture}
          </Text>
          <Text style={styles.title} accessibilityRole="header">
            {card.title}
          </Text>
          <Text style={styles.text}>{card.body}</Text>
          <Text style={styles.count} accessibilityLabel={`${i + 1} में से ${ONBOARDING_CARDS.length}`}>
            {ONBOARDING_CARDS.map((_, k) => (k === i ? '● ' : '○ ')).join('')}
          </Text>
        </View>
        <View style={styles.buttons}>
          <BigButton icon="➡️" label={last ? 'शुरू करें' : 'आगे'} hint={last ? 'ऐप शुरू करें' : 'अगला पन्ना'} onPress={last ? finish : () => setI(i + 1)} />
          <BigButton icon="🔊" label="फिर से सुनें" tone="red" hint="यह पन्ना फिर से बोलकर सुनाएगा" onPress={() => void speak(card.speech)} />
          <BigButton icon="⏭" label="छोड़ें" tone="plain" hint="सब पन्ने छोड़कर आगे जाएँ" onPress={finish} />
        </View>
      </SafeAreaView>
    </RuledPaper>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, padding: spacing.md, paddingLeft: 44, gap: spacing.md },
  body: { flex: 1, justifyContent: 'center', gap: spacing.md },
  picture: { fontSize: 120, lineHeight: 140, textAlign: 'center' },
  title: { ...type.title, color: colors.inkBlue, textAlign: 'center' },
  text: { ...type.body, color: colors.text, textAlign: 'center' },
  count: { ...type.label, color: colors.inkBlue, textAlign: 'center' },
  buttons: { gap: spacing.sm },
});
