import React, { useCallback, useRef, useState } from 'react';
import { Image, Modal, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BigButton } from '@/components/big-button';
import { ReportSheet, SHEET_W } from '@/components/report-sheet';
import { Text } from '@/components/text';
import { paginateDoc, type ReportDoc, type ReportPage } from '@/core';
import { captureView, MAX_IMAGE_ROWS, shareImageFile, shareReportPdf } from '@/services/report-export';
import { showToast } from '@/services/toast';
import { BORDER, colors, GUTTER, radius, spacing, type } from '@/theme';

const OUT_W = 1080; // pixels of every image
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface Props {
  /** Builds the whole report (every row, from SQL) when a button is pressed; nothing is built while just looking. */
  build: () => Promise<ReportDoc>;
  disabled?: boolean;
}

/**
 * "PDF भेजें" and "फ़ोटो भेजें" for a report. The PDF goes through expo-print. The photo path draws the print-style sheet off screen, one
 * page (~25 rows) at a time, photographs it with react-native-view-shot, and then lists the pages to send one by one (the share sheet
 * takes one file at a time). All native modules load on the first tap.
 */
export function ExportBar({ build, disabled }: Props) {
  const [busy, setBusy] = useState<'pdf' | 'img' | null>(null);
  const [shot, setShot] = useState<{ page: ReportPage } | null>(null);
  const [done, setDone] = useState<{ title: string; uris: string[] } | null>(null);
  const sheetRef = useRef<View>(null);
  const heightRef = useRef(0);

  const pdf = useCallback(async () => {
    if (busy) return;
    setBusy('pdf');
    try {
      const ok = await shareReportPdf(await build());
      if (!ok) showToast('इस फ़ोन में भेजने की सुविधा नहीं मिली।');
    } catch {
      showToast('PDF नहीं बन पाया। फिर कोशिश करें।');
    } finally {
      setBusy(null);
    }
  }, [busy, build]);

  const images = useCallback(async () => {
    if (busy) return;
    setBusy('img');
    try {
      const doc = await build();
      if (doc.rows.length > MAX_IMAGE_ROWS) {
        showToast('सूची बहुत लंबी है। PDF भेजें, या साल/तारीख चुनकर छोटा करें।');
        return;
      }
      const pages = paginateDoc(doc);
      const uris: string[] = [];
      for (const p of pages) {
        heightRef.current = 0;
        setShot({ page: p });
        for (let i = 0; i < 40 && heightRef.current === 0; i++) await wait(50); // until the page has been laid out
        await wait(60);
        uris.push(await captureView(sheetRef, OUT_W, Math.max(1, Math.round((heightRef.current * OUT_W) / SHEET_W))));
      }
      setShot(null);
      setDone({ title: doc.title, uris });
    } catch {
      showToast('फ़ोटो नहीं बन पाई। फिर कोशिश करें।');
    } finally {
      setShot(null);
      setBusy(null);
    }
  }, [busy, build]);

  const send = useCallback(async (uri: string, title: string) => {
    try {
      if (!(await shareImageFile(uri, title))) showToast('इस फ़ोन में भेजने की सुविधा नहीं मिली।');
    } catch {
      showToast('भेज नहीं पाए। फिर कोशिश करें।');
    }
  }, []);

  return (
    <View style={styles.bar}>
      <View style={styles.row}>
        <BigButton compact icon="doc" label={busy === 'pdf' ? 'बन रहा है…' : 'PDF भेजें'} onPress={pdf} disabled={!!busy || disabled} hint="रिपोर्ट PDF बनाकर व्हाट्सऐप आदि पर भेजें" />
        <BigButton compact icon="image" label={busy === 'img' ? 'बन रही है…' : 'फ़ोटो भेजें'} onPress={images} disabled={!!busy || disabled} hint="रिपोर्ट की फ़ोटो बनाकर व्हाट्सऐप आदि पर भेजें" />
      </View>
      {shot ? (
        <View
          style={styles.offscreen}
          pointerEvents="none"
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
        >
          <View
            ref={sheetRef}
            collapsable={false}
            onLayout={(e) => {
              heightRef.current = e.nativeEvent.layout.height;
            }}
          >
            <ReportSheet page={shot.page} />
          </View>
        </View>
      ) : null}
      <Modal visible={!!done} animationType="fade" onRequestClose={() => setDone(null)}>
        <SafeAreaView style={styles.modal}>
          <Text style={[type.title, styles.ink]} accessibilityRole="header">
            फ़ोटो तैयार हैं
          </Text>
          <Text style={[type.body, styles.muted]}>हर पन्ना अलग फ़ोटो है। एक-एक करके भेजें।</Text>
          <ScrollView contentContainerStyle={styles.list}>
            {done?.uris.map((u, i) => (
              <View key={u} style={styles.page}>
                <Image source={{ uri: u }} style={styles.thumb} resizeMode="contain" accessibilityLabel={`पन्ना ${i + 1}`} />
                <BigButton icon="share" tone="primary" label={`पन्ना ${i + 1}/${done.uris.length} भेजें`} onPress={() => send(u, done.title)} />
              </View>
            ))}
          </ScrollView>
          <BigButton label="बंद करें" tone="plain" onPress={() => setDone(null)} />
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { gap: spacing.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  offscreen: { position: 'absolute', left: -SHEET_W - 100, top: 0, width: SHEET_W },
  modal: { flex: 1, backgroundColor: colors.paper, padding: GUTTER, gap: spacing.md },
  ink: { color: colors.ink },
  muted: { color: colors.muted },
  list: { gap: spacing.md, paddingBottom: spacing.md },
  page: { gap: spacing.sm, padding: spacing.sm, backgroundColor: colors.card, borderRadius: radius.card, borderWidth: BORDER, borderColor: colors.hairline },
  thumb: { width: '100%', height: 220, backgroundColor: colors.paper },
});
