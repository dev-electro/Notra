import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/text';
import { longDateHi, type ReportPage, type Tone } from '@/core';
import { colors, fonts, spacing, type } from '@/theme';

/** Width of the printed page in dp. It is captured at a fixed pixel width, so WhatsApp always gets the same picture. */
export const SHEET_W = 720;

const INK: Record<Tone, string> = { received: colors.received, given: colors.given, ink: colors.ink, muted: colors.muted };

/**
 * The print-style view of one report page: header (family, report, filters, date), the table, totals on the last page.
 * Plain paper, no buttons: this is what view-shot photographs. Table columns use the doc's flex weights.
 */
export const ReportSheet = React.memo(function ReportSheet({ page, watermark }: { page: ReportPage; watermark?: boolean }) {
  const { doc } = page;
  return (
    <View style={styles.sheet} collapsable={false}>
      <View style={styles.bar} />
      <View style={styles.body}>
        <Text style={[type.captionBold, styles.brand]}>
          नोतरा बुक{doc.familyName ? ` · ${doc.familyName} परिवार` : ''}
        </Text>
        <Text style={[type.title, styles.title]}>{doc.title}</Text>
        {doc.subtitle ? <Text style={[type.heading, styles.subtitle]}>{doc.subtitle}</Text> : null}
        {doc.filters.length ? <Text style={[type.caption, styles.muted]}>{doc.filters.join(' · ')}</Text> : null}
        <View style={styles.headRow}>
          {doc.columns.map((c, i) => (
            <Text key={i} style={[type.captionBold, styles.headCell, { flex: c.flex, textAlign: c.align === 'right' ? 'right' : 'left' }]} numberOfLines={1}>
              {c.label}
            </Text>
          ))}
        </View>
        {doc.rows.map((r, ri) => (
          <View key={ri} style={styles.row}>
            {r.map((c, ci) => (
              <View key={ci} style={{ flex: doc.columns[ci]?.flex ?? 1, alignItems: doc.columns[ci]?.align === 'right' ? 'flex-end' : 'flex-start' }}>
                <Text style={[type.caption, { color: INK[c.tone ?? 'ink'], fontFamily: c.tone && c.tone !== 'ink' ? fonts.bold : fonts.medium }]}>{c.text}</Text>
                {c.sub ? <Text style={[type.caption, styles.sub]}>{c.sub}</Text> : null}
              </View>
            ))}
          </View>
        ))}
        {page.last ? (
          <View style={styles.totals}>
            {doc.totals.map((t, i) => (
              <View key={i} style={styles.totalRow}>
                <Text style={[type.bodyBold, styles.flex]}>{t.label}</Text>
                <Text style={[type.bodyBold, { color: INK[t.tone ?? 'ink'] }]}>{t.value}</Text>
              </View>
            ))}
            {doc.note ? <Text style={[type.caption, styles.note]}>{doc.note}</Text> : null}
          </View>
        ) : null}
        <View style={styles.footRow}>
          <Text style={[type.caption, styles.muted, styles.flex]}>
            पन्ना {page.page}/{page.pages} · बनाया: {longDateHi(doc.generatedOn)}
          </Text>
          {watermark ? <Text style={[type.caption, styles.muted]}>Notra Book</Text> : null}
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  sheet: { width: SHEET_W, flexDirection: 'row', backgroundColor: colors.paper },
  bar: { width: 6, backgroundColor: colors.haldi },
  body: { flex: 1, padding: spacing.lg, gap: spacing.xs },
  flex: { flex: 1 },
  brand: { color: colors.given },
  title: { color: colors.received },
  subtitle: { color: colors.ink },
  muted: { color: colors.muted },
  sub: { color: colors.muted },
  headRow: { flexDirection: 'row', gap: spacing.sm, borderBottomWidth: 2, borderBottomColor: colors.received, paddingVertical: spacing.xs, marginTop: spacing.sm },
  headCell: { color: colors.received },
  row: { flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  totals: { gap: spacing.xs, marginTop: spacing.md },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  note: { color: colors.muted, marginTop: spacing.sm },
  footRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
});
