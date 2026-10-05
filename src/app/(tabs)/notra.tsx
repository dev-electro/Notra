import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { type ScreenAction, Screen } from '@/components/screen';
import { SegmentedControl } from '@/components/segmented';
import { DoosrePane } from '@/features/notra/DoosrePane';
import { HisabPane } from '@/features/notra/HisabPane';
import { MeraPane } from '@/features/notra/MeraPane';
import { asSeg, loadSeg, NOTRA_SEGMENTS, rememberedSeg, saveSeg, type NotraSeg } from '@/features/notra/segments';
import { go } from '@/nav';
import { GUTTER, spacing } from '@/theme';

const ACTIONS: Record<NotraSeg, ScreenAction> = {
  mera: { testID: 'btn-new-event', icon: 'plus', label: 'नया नोतरा', onPress: () => go('/events/new'), hint: 'अपना नया नोतरा बनाएँ' },
  doosre: { testID: 'btn-new-visit', icon: 'plus', label: 'नए नोतरे में गए', onPress: () => go('/others/new'), hint: 'किसी और परिवार के नोतरे में जो दिया वह लिखें' },
  hisab: { testID: 'btn-old', icon: 'doc', label: 'पुराना हिसाब जोड़ें', onPress: () => go('/old'), hint: 'पुरानी डायरी का हिसाब पिछली तारीख से लिखें' },
};

/** नोतरा: one tab, three segments (मेरा | दूसरों का | हिसाब). `?seg=` picks one; otherwise the last one used. */
export default function NotraTab() {
  const params = useLocalSearchParams<{ seg?: string }>();
  const fromLink = asSeg(params.seg);
  const [stored, setStored] = useState<NotraSeg | null>(rememberedSeg());
  const [picked, setPicked] = useState<{ seg: NotraSeg; link: NotraSeg | null } | null>(null);
  const seg: NotraSeg = (picked && picked.link === fromLink ? picked.seg : null) ?? fromLink ?? stored ?? 'mera';

  useEffect(() => {
    if (fromLink) saveSeg(fromLink);
    else void loadSeg().then(setStored);
  }, [fromLink]);

  const pick = (s: NotraSeg) => {
    setPicked({ seg: s, link: fromLink });
    saveSeg(s);
  };

  return (
    <Screen tab title="नोतरा" scroll={false} action={ACTIONS[seg]}>
      <View style={styles.seg}>
        <SegmentedControl segments={NOTRA_SEGMENTS} value={seg} onChange={pick} />
      </View>
      <View style={styles.pane}>{seg === 'mera' ? <MeraPane /> : seg === 'doosre' ? <DoosrePane /> : <HisabPane />}</View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  seg: { paddingHorizontal: GUTTER, paddingBottom: spacing.md },
  pane: { flex: 1 },
});
