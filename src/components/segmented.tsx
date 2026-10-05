import React from 'react';
import { StyleSheet, View } from 'react-native';
import { PressableScale } from '@/components/pressable-scale';
import { Text } from '@/components/text';
import { BORDER, colors, radius, spacing, type } from '@/theme';

export interface Segment<T extends string> {
  id: T;
  label: string;
}

interface Props<T extends string> {
  segments: readonly Segment<T>[];
  value: T;
  onChange: (id: T) => void;
}

/** One calm row of choices (2-3): the open one sits in a soft haldi pill with indigo text. Each gets testID `seg-<id>`. Min height 56dp. */
export function SegmentedControl<T extends string>({ segments, value, onChange }: Props<T>) {
  return (
    <View style={styles.track} accessibilityRole="tablist">
      {segments.map((s) => {
        const on = s.id === value;
        return (
          <PressableScale
            key={s.id}
            testID={`seg-${s.id}`}
            accessibilityRole="tab"
            accessibilityLabel={s.label}
            accessibilityState={{ selected: on }}
            onPress={() => !on && onChange(s.id)}
            outerStyle={styles.outer}
            style={[styles.seg, on && styles.on]}
          >
            <Text style={[on ? type.bodyBold : type.body, { color: on ? colors.received : colors.muted }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} importantForAccessibility="no">
              {s.label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', gap: spacing.xs, padding: spacing.xs, backgroundColor: colors.card, borderWidth: BORDER, borderColor: colors.hairline, borderRadius: radius.pill },
  outer: { flex: 1 },
  seg: { minHeight: 56, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm },
  on: { backgroundColor: colors.haldiTint },
});
