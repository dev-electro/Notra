import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RuledPaper } from '@/components/ruled-paper';
import { SpeakerButton } from '@/components/speaker-button';
import { Text } from '@/components/text';
import { back } from '@/nav';
import { colors, MIN_TOUCH, spacing, type } from '@/theme';

interface Props {
  title: string;
  children: React.ReactNode;
  /** Wrap children in a ScrollView. Screens with their own FlatList pass false. */
  scroll?: boolean;
  noBack?: boolean;
  onBack?: () => void;
  /** Plain-Hindi sentence about what this screen is for; adds a speaker button that reads it aloud. */
  speakText?: string;
}

/** Ruled-paper page with a big back arrow and Hindi title. */
export function Screen({ title, children, scroll = true, noBack, onBack, speakText }: Props) {
  return (
    <RuledPaper>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          {noBack ? null : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="पीछे"
              accessibilityHint="पिछली स्क्रीन पर जाएँ"
              onPress={onBack ?? back}
              style={styles.back}
            >
              <Text style={styles.backText} importantForAccessibility="no">
                ← वापस
              </Text>
            </Pressable>
          )}
          <Text style={styles.title} numberOfLines={1} accessibilityRole="header">
            {title}
          </Text>
          {speakText ? <SpeakerButton text={speakText} /> : null}
        </View>
        {scroll ? (
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        ) : (
          <View style={styles.flex}>{children}</View>
        )}
      </SafeAreaView>
    </RuledPaper>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  header: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, minHeight: MIN_TOUCH, paddingLeft: 44, paddingRight: spacing.md },
  back: { minWidth: MIN_TOUCH * 1.6, height: MIN_TOUCH, justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: colors.inkBlue, borderRadius: 14, backgroundColor: colors.card, paddingHorizontal: spacing.sm },
  backText: { ...type.body, fontWeight: '700', color: colors.inkBlue },
  title: { ...type.title, color: colors.inkBlue, flexShrink: 1, flexGrow: 1 },
  content: { padding: spacing.md, paddingLeft: 44, gap: spacing.md, paddingBottom: spacing.xl * 2 },
});
