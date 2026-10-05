import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Avatar } from '@/components/avatar';
import { Icon } from '@/components/icons';
import { PressableScale } from '@/components/pressable-scale';
import { Text } from '@/components/text';
import type { Household } from '@/core';
import { BORDER, colors, radius, spacing, type } from '@/theme';

export const HOUSEHOLD_ROW_HEIGHT = 96;
const GAP = spacing.sm;

interface Props {
  household: Household;
  onPress: (h: Household) => void;
  /** Plain text on the right (an amount). */
  right?: string;
  /** Or any node on the right (arrow + amount lines). */
  rightNode?: React.ReactNode;
  /** Spoken in place of `right` text, for rightNode rows. */
  rightLabel?: string;
}

/** Same names are common, so father and village always appear under the name. A card with photo, name and a chevron. */
export const HouseholdRow = React.memo(function HouseholdRow({ household: h, onPress, right, rightNode, rightLabel }: Props) {
  return (
    <View style={styles.cell}>
      <PressableScale
        testID={`household-row-${h.headName}`}
        accessibilityRole="button"
        accessibilityLabel={[h.headName, h.fatherName && `${h.fatherName} का`, h.village, right ?? rightLabel].filter(Boolean).join(', ')}
        accessibilityHint="इस परिवार को चुनें या खोलें"
        onPress={() => onPress(h)}
        outerStyle={styles.fill}
        style={styles.row}
      >
        <Avatar name={h.headName} photoUri={h.photoUri} />
        <View style={styles.text}>
          <Text style={[type.heading, styles.name]} numberOfLines={1}>
            {h.headName}
          </Text>
          <Text style={[type.caption, styles.sub]} numberOfLines={1}>
            {[h.fatherName && `${h.fatherName} का`, h.village].filter(Boolean).join(' · ')}
          </Text>
        </View>
        {rightNode ?? (right ? <Text style={[type.money, styles.right]}>{right}</Text> : null)}
        <Icon name="chevron" size={24} color={colors.muted} />
      </PressableScale>
    </View>
  );
});

const styles = StyleSheet.create({
  fill: { flex: 1 },
  cell: { height: HOUSEHOLD_ROW_HEIGHT, paddingBottom: GAP },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.card,
    borderWidth: BORDER,
    borderColor: colors.hairline,
    borderRadius: radius.card,
  },
  text: { flex: 1 },
  name: { color: colors.ink },
  sub: { color: colors.muted },
  right: { color: colors.received },
});
