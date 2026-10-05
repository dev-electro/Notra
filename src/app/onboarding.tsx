import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BigButton } from '@/components/big-button';
import { DotBorder, EmptyArt } from '@/components/motifs';
import { BottomBar } from '@/components/screen';
import { Text } from '@/components/text';
import { getDb, setSetting, type Db } from '@/db';
import { replace } from '@/nav';
import { ONBOARDING_CARDS } from '@/onboarding/content';
import { speak, stopSpeaking } from '@/services/speech';
import { BORDER_TONE, colors, GUTTER, spacing, type } from '@/theme';

const DOT = 16;

/**
 * First launch, before sign-in: big picture cards read aloud in Hindi (starts by itself). One main button (आगे) at the bottom,
 * a repeat button, and छोड़ें to skip everything.
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
    <View style={styles.page}>
      <SafeAreaView style={styles.safe}>
        <DotBorder />
        <View style={styles.body}>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.art}>
            <EmptyArt icon={card.picture} />
          </View>
          <Text style={[type.title, styles.title]} accessibilityRole="header">
            {card.title}
          </Text>
          <Text style={[type.body, styles.text]}>{card.body}</Text>
          <View style={styles.dots} accessible accessibilityLabel={`${i + 1} में से ${ONBOARDING_CARDS.length}`}>
            {ONBOARDING_CARDS.map((c, k) => (
              <View key={c.id} style={[styles.dot, k === i && styles.dotOn]} />
            ))}
          </View>
        </View>
        <BottomBar>
          <View style={styles.buttons}>
            <BigButton tone="primary" icon={last ? 'check' : 'chevron'} label={last ? 'शुरू करें' : 'आगे'} hint={last ? 'ऐप शुरू करें' : 'अगला पन्ना'} onPress={last ? finish : () => setI(i + 1)} />
            <View style={styles.row}>
              <BigButton compact icon="speaker" label="फिर से सुनें" hint="यह पन्ना फिर से बोलकर सुनाएगा" onPress={() => void speak(card.speech)} />
              <BigButton compact label="छोड़ें" hint="सब पन्ने छोड़कर आगे जाएँ" onPress={finish} />
            </View>
          </View>
        </BottomBar>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.paper },
  safe: { flex: 1 },
  body: { flex: 1, justifyContent: 'center', gap: spacing.md, paddingHorizontal: GUTTER },
  art: { alignItems: 'center' },
  title: { color: colors.received, textAlign: 'center' },
  text: { color: colors.ink, textAlign: 'center' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2, borderWidth: BORDER_TONE, borderColor: colors.received },
  dotOn: { backgroundColor: colors.received },
  buttons: { gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
});
