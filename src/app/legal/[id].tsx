import { useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { LEGAL, type LegalId } from '@/legal/content';
import { colors, spacing, type } from '@/theme';

const SHOWN: LegalId[] = ['privacy', 'terms', 'grievance'];

/** Privacy policy / terms / grievance officer: 3-4 plain bullets first, the full text (Hindi, then English) on request. */
export default function Legal() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [open, setOpen] = useState(false);
  const doc = SHOWN.includes(id as LegalId) ? LEGAL[id as LegalId] : LEGAL.privacy;
  return (
    <Screen title={doc.titleHi} action={{ icon: 'doc', label: open ? 'छोटा करें' : 'पूरा पढ़ें', onPress: () => setOpen(!open), hint: 'पूरा लिखा हुआ पन्ना खोलता है' }}>
      {doc.summary.hi.map((b) => (
        <Text key={b} style={styles.bullet}>
          • {b}
        </Text>
      ))}
      {open ? (
        <View style={styles.full}>
          {doc.sections.map((s) => (
            <View key={s.hi.h} style={styles.sec}>
              <Text style={styles.h} accessibilityRole="header">
                {s.hi.h}
              </Text>
              {s.hi.p.map((p) => (
                <Text key={p} style={styles.p}>
                  {p}
                </Text>
              ))}
            </View>
          ))}
          <Text style={styles.en} accessibilityRole="header" accessibilityLanguage="en">
            {doc.titleEn} (English)
          </Text>
          {doc.summary.en.map((b) => (
            <Text key={b} style={styles.pEn} accessibilityLanguage="en">
              • {b}
            </Text>
          ))}
          {doc.sections.map((s) => (
            <View key={s.en.h} style={styles.sec}>
              <Text style={styles.hEn} accessibilityRole="header" accessibilityLanguage="en">
                {s.en.h}
              </Text>
              {s.en.p.map((p) => (
                <Text key={p} style={styles.pEn} accessibilityLanguage="en">
                  {p}
                </Text>
              ))}
            </View>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  bullet: { ...type.bodyBold, color: colors.ink },
  full: { gap: spacing.md },
  sec: { gap: spacing.xs },
  h: { ...type.heading, color: colors.received },
  p: { ...type.body, color: colors.ink },
  en: { ...type.heading, color: colors.given, marginTop: spacing.lg },
  hEn: { ...type.bodyBold, color: colors.received },
  pEn: { ...type.body, color: colors.muted },
});
