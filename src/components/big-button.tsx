import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon, type IconName } from '@/components/icons';
import { PressableScale } from '@/components/pressable-scale';
import { Text } from '@/components/text';
import { BORDER, BORDER_TONE, colors, MIN_TOUCH, radius, spacing, type } from '@/theme';

export type Tone = 'primary' | 'plain' | 'received' | 'given' | 'danger';

interface Props {
  label: string;
  onPress: () => void;
  /** Line icon shown before the label. */
  icon?: IconName;
  /**
   * primary = haldi fill, dark text (one per screen, at the bottom); plain = paper button; received / given = direction
   * choice (indigo / kumkum); danger = kumkum outline for things that cannot be undone.
   */
  tone?: Tone;
  /** Chosen state. Shown with a check mark and a filled look, never by colour alone. */
  selected?: boolean;
  disabled?: boolean;
  /** Half-width style for rows of two (wraps when there is no room). */
  compact?: boolean;
  /** Third-width style for rows of three short chips. */
  third?: boolean;
  /** Spoken by TalkBack after the label; say what happens when the button is pressed. */
  hint?: string;
  /** Override the spoken label (default: the visible label). */
  accessibilityLabel?: string;
  /** Stable id for end-to-end tests (Android resource-id). */
  testID?: string;
}

interface Look {
  bg: string;
  border: string;
  fg: string;
  borderWidth: number;
}

function look(tone: Tone, selected: boolean): Look {
  switch (tone) {
    case 'primary':
      return { bg: colors.haldi, border: colors.haldi, fg: colors.onHaldi, borderWidth: BORDER };
    case 'received':
      return selected
        ? { bg: colors.received, border: colors.received, fg: colors.onSolid, borderWidth: BORDER_TONE }
        : { bg: colors.receivedTint, border: colors.received, fg: colors.received, borderWidth: BORDER_TONE };
    case 'given':
      return selected
        ? { bg: colors.given, border: colors.given, fg: colors.onSolid, borderWidth: BORDER_TONE }
        : { bg: colors.givenTint, border: colors.given, fg: colors.given, borderWidth: BORDER_TONE };
    case 'danger':
      return { bg: colors.card, border: colors.given, fg: colors.given, borderWidth: BORDER_TONE };
    default:
      return selected
        ? { bg: colors.haldi, border: colors.haldi, fg: colors.onHaldi, borderWidth: BORDER }
        : { bg: colors.card, border: colors.hairline, fg: colors.ink, borderWidth: BORDER };
  }
}

/** Big (>=64dp) rounded button with a line icon and one plain word or phrase. Flat: border and tint, no shadow. */
export const BigButton = React.memo(function BigButton({
  label, onPress, icon, tone = 'plain', selected = false, disabled, compact, third, hint, accessibilityLabel, testID,
}: Props) {
  const l = look(tone, selected);
  // Chosen plain buttons get a check as well as the haldi fill; direction buttons keep their arrow (the filled look says chosen).
  const showCheck = selected && tone === 'plain';
  return (
    <PressableScale
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={hint}
      accessibilityState={{ selected, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      outerStyle={third ? styles.third : compact ? styles.compact : undefined}
      style={[
        styles.btn,
        { backgroundColor: l.bg, borderColor: l.border, borderWidth: l.borderWidth },
        disabled && styles.disabled,
      ]}
    >
      <View style={styles.inner}>
        {showCheck ? <Icon name="check" size={24} color={l.fg} /> : null}
        {icon ? <Icon name={icon} size={26} color={l.fg} /> : null}
        <Text style={[type.button, styles.label, { color: l.fg }]} numberOfLines={2}>
          {label}
        </Text>
      </View>
    </PressableScale>
  );
});

const styles = StyleSheet.create({
  btn: {
    minHeight: MIN_TOUCH,
    borderRadius: radius.button,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    justifyContent: 'center',
  },
  inner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  compact: { flexGrow: 1, flexBasis: '45%' },
  third: { flexGrow: 1, flexBasis: '28%' },
  disabled: { opacity: 0.4 },
  label: { textAlign: 'center', flexShrink: 1 },
});
