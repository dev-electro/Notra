import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BigButton } from '@/components/big-button';
import type { IconName } from '@/components/icons';
import { Icon } from '@/components/icons';
import { DotBorder } from '@/components/motifs';
import { PressableScale } from '@/components/pressable-scale';
import { SpeakerButton } from '@/components/speaker-button';
import { Text } from '@/components/text';
import { back } from '@/nav';
import { BORDER, colors, GUTTER, MIN_TOUCH, radius, spacing, type } from '@/theme';

export interface ScreenAction {
  label: string;
  onPress: () => void;
  icon?: IconName;
  disabled?: boolean;
  hint?: string;
  /** 'danger' (kumkum outline) for things that cannot be undone. Default: haldi. */
  tone?: 'primary' | 'danger';
  /** Stable id for end-to-end tests, e.g. btn-save. */
  testID?: string;
}

interface Props {
  title: string;
  children: React.ReactNode;
  /** Wrap children in a ScrollView. Screens with their own FlatList pass false. */
  scroll?: boolean;
  noBack?: boolean;
  onBack?: () => void;
  /** Plain-Hindi sentence about what this screen is for; adds a speaker button that reads it aloud. */
  speakText?: string;
  /** Screen is a bottom-tab page: the tab bar already covers the bottom edge (safe area) and there is no back button. */
  tab?: boolean;
  /** The ONE main thing to do here: a full-width haldi button pinned to the bottom, where the thumb rests. */
  action?: ScreenAction;
}

/** Padding for FlatList content so lists line up with the rest of the screen. */
export const listContent = { paddingHorizontal: GUTTER, paddingBottom: spacing.lg } as const;

/** The strip at the bottom of a screen that holds its one main button (thumb reach). */
export function BottomBar({ children }: { children: React.ReactNode }) {
  return <View style={styles.footer}>{children}</View>;
}

/** Paper page: big labelled back button top-left, clear title, a dot-border strip, content, and the bottom action. */
export function Screen({ title, children, scroll = true, noBack: noBackProp, onBack, speakText, action, tab }: Props) {
  const noBack = noBackProp || tab;
  return (
    <View style={styles.page}>
      <SafeAreaView style={styles.safe} edges={tab ? ['top', 'left', 'right'] : undefined}>
        <View style={styles.header}>
          {noBack && !speakText ? null : (
            <View style={styles.topRow}>
              {noBack ? (
                <View />
              ) : (
                <PressableScale
                  testID="btn-back"
                  accessibilityRole="button"
                  accessibilityLabel="वापस"
                  accessibilityHint="पिछली स्क्रीन पर जाएँ"
                  onPress={onBack ?? back}
                  style={styles.back}
                >
                  <Icon name="back" size={28} color={colors.received} />
                  <Text style={[type.button, styles.backText]} importantForAccessibility="no">
                    वापस
                  </Text>
                </PressableScale>
              )}
              {speakText ? <SpeakerButton text={speakText} /> : null}
            </View>
          )}
          <Text style={[type.title, styles.title]} numberOfLines={2} accessibilityRole="header">
            {title}
          </Text>
        </View>
        <DotBorder />
        {scroll ? (
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        ) : (
          <View style={styles.flex}>{children}</View>
        )}
        {action ? (
          <BottomBar>
            <BigButton testID={action.testID} tone={action.tone ?? 'primary'} icon={action.icon} label={action.label} onPress={action.onPress} disabled={action.disabled} hint={action.hint} />
          </BottomBar>
        ) : null}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.paper },
  safe: { flex: 1 },
  flex: { flex: 1, paddingTop: spacing.sm },
  header: { paddingHorizontal: GUTTER, paddingTop: spacing.sm, paddingBottom: spacing.sm, gap: spacing.sm },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: MIN_TOUCH,
    paddingHorizontal: spacing.md,
    borderRadius: radius.button,
    borderWidth: BORDER,
    borderColor: colors.hairline,
    backgroundColor: colors.card,
  },
  backText: { color: colors.received },
  title: { color: colors.ink },
  content: { padding: GUTTER, gap: spacing.md, paddingBottom: spacing.xl },
  footer: { paddingHorizontal: GUTTER, paddingTop: spacing.sm, paddingBottom: spacing.sm, borderTopWidth: BORDER, borderTopColor: colors.hairline, backgroundColor: colors.paper },
});
