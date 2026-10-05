import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { DotBorder } from '@/components/motifs';
import { Text } from '@/components/text';
import { biodataSections, type Biodata } from '@/core';
import { BORDER, colors, radius, spacing, type } from '@/theme';

/** The traditional biodata page: dot-border strips, blessing line, photo + name, grouped rows. This view is what gets photographed and shared. */
export const BiodataCard = React.forwardRef<View, { data: Biodata; onLayout?: (w: number, h: number) => void }>(function BiodataCard({ data, onLayout }, ref) {
  const sections = biodataSections(data);
  return (
    <View
      ref={ref}
      collapsable={false}
      style={styles.card}
      onLayout={(e) => onLayout?.(e.nativeEvent.layout.width, e.nativeEvent.layout.height)}
      testID="biodata-card"
    >
      <View style={styles.strip}>
        <DotBorder />
      </View>
      <View style={styles.body}>
        <Text style={[type.caption, styles.blessing]}>॥ श्री गणेशाय नमः ॥</Text>
        <Text style={[type.title, styles.heading]}>बायोडाटा</Text>
        <View style={styles.head}>
          {data.photoUri ? <Image source={{ uri: data.photoUri }} style={styles.photo} accessibilityLabel="फ़ोटो" /> : null}
          <View style={styles.flex}>
            <Text style={[type.heading, styles.name]}>{data.name || 'नाम'}</Text>
          </View>
        </View>
        {sections.map((s) => (
          <View key={s.title} style={styles.section}>
            <Text style={[type.captionBold, styles.sectionTitle]}>{s.title}</Text>
            {s.rows.map((r) => (
              <View key={r.label} style={styles.row}>
                <Text style={[type.caption, styles.label]}>{r.label}</Text>
                <Text style={[type.body, styles.value]}>{r.value}</Text>
              </View>
            ))}
          </View>
        ))}
      </View>
      <View style={styles.strip}>
        <DotBorder />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderWidth: BORDER, borderColor: colors.hairline, borderRadius: radius.card, overflow: 'hidden' },
  strip: { overflow: 'hidden', height: 16 },
  body: { padding: spacing.md, gap: spacing.md },
  blessing: { color: colors.given, textAlign: 'center' },
  heading: { color: colors.received, textAlign: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  photo: { width: 96, height: 96, borderRadius: radius.card, borderWidth: BORDER, borderColor: colors.hairline, backgroundColor: colors.paper },
  flex: { flex: 1 },
  name: { color: colors.ink },
  section: { gap: spacing.xs, borderTopWidth: BORDER, borderTopColor: colors.hairline, paddingTop: spacing.sm },
  sectionTitle: { color: colors.received },
  row: { flexDirection: 'row', gap: spacing.sm },
  label: { width: 104, color: colors.muted },
  value: { flex: 1, color: colors.ink },
});
