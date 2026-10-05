import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BigButton } from '@/components/big-button';
import { Field } from '@/components/field';
import { OCCASION_ICON_NAME } from '@/components/occasion';
import { Text } from '@/components/text';
import { OCCASION_LABEL, OCCASION_LABEL_MAX, OCCASION_NOTE_MAX, OCCASIONS, type Occasion } from '@/core';
import { getDb, recentOccasionLabels, type Db } from '@/db';
import { colors, spacing, type } from '@/theme';

interface Props {
  occasion: Occasion;
  onOccasion: (o: Occasion) => void;
  label: string;
  onLabel: (t: string) => void;
  note: string;
  onNote: (t: string) => void;
}

/**
 * The six occasions as picture buttons. "अन्य" opens an editable name ("कार्यक्रम का नाम", e.g. नामकरण) with quick chips of
 * the names used before, and an optional "विवरण" (details).
 */
export function OccasionPicker({ occasion, onOccasion, label, onLabel, note, onNote }: Props) {
  const [recent, setRecent] = useState<string[]>([]);
  useEffect(() => {
    if (occasion !== 'OTHER') return;
    let alive = true;
    (async () => {
      try {
        const r = await recentOccasionLabels((await getDb()) as unknown as Db);
        if (alive) setRecent(r);
      } catch {
        /* chips are a convenience */
      }
    })();
    return () => {
      alive = false;
    };
  }, [occasion]);
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {OCCASIONS.map((o) => (
          <BigButton key={o} testID={`occasion-${o}`} third icon={OCCASION_ICON_NAME[o]} label={OCCASION_LABEL[o]} selected={occasion === o} onPress={() => onOccasion(o)} />
        ))}
      </View>
      {occasion === 'OTHER' ? (
        <View style={styles.wrap}>
          <Field testID="field-occasion-label" label="कार्यक्रम का नाम" value={label} onChangeText={onLabel} maxLength={OCCASION_LABEL_MAX} placeholder="जैसे नामकरण" />
          {recent.length ? (
            <View style={styles.wrap}>
              <Text style={[type.caption, styles.muted]}>पहले के नाम</Text>
              <View style={styles.row}>
                {recent.map((r) => (
                  <BigButton key={r} testID="occasion-recent" compact label={r} selected={label.trim() === r} onPress={() => onLabel(r)} />
                ))}
              </View>
            </View>
          ) : null}
          <Field testID="field-occasion-note" label="विवरण (ज़रूरी नहीं)" value={note} onChangeText={onNote} maxLength={OCCASION_NOTE_MAX} multiline />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  muted: { color: colors.muted },
});
