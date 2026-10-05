import React, { useCallback, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BigButton } from '@/components/big-button';
import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { BIODATA_KEY, EMPTY_BIODATA, hasContent, parseBiodata, serializeBiodata, type Biodata } from '@/core';
import { getDb, getSetting, setSetting, type Db } from '@/db';
import { BiodataCard } from '@/features/rishte/BiodataCard';
import { BiodataForm } from '@/features/rishte/BiodataForm';
import { DiscoverySection } from '@/features/rishte/DiscoverySection';
import { rishteyDiscoveryOn } from '@/features';
import { useRemoteConfig } from '@/remote/use-remote';
import { useLoad } from '@/hooks/use-load';
import { captureView, shareImageFile } from '@/services/report-export';
import { showToast } from '@/services/toast';
import { colors, spacing, type } from '@/theme';

const OUT_W = 1080;
const PRIVACY = 'यह जानकारी सिर्फ़ आपके फ़ोन में रहती है';

/** रिश्ते: a private, on-phone biodata builder. Empty state -> form -> preview card -> share as a picture. Nothing is uploaded. */
export default function Rishte() {
  const { data, reload } = useLoad(async (db) => parseBiodata(await getSetting(db, BIODATA_KEY)), null as Biodata | null);
  const [draft, setDraft] = useState<Biodata | null>(null); // non-null = editing
  const [busy, setBusy] = useState(false);
  const cardRef = useRef<View>(null);
  const size = useRef({ w: 0, h: 0 });

  const save = useCallback(async () => {
    if (!draft || !hasContent(draft)) return;
    try {
      await setSetting((await getDb()) as unknown as Db, BIODATA_KEY, serializeBiodata(draft));
      setDraft(null);
      reload();
    } catch {
      showToast('सहेज नहीं पाए। फिर कोशिश करें।');
    }
  }, [draft, reload]);

  const share = useCallback(async () => {
    if (busy || !size.current.w) return;
    setBusy(true);
    try {
      const uri = await captureView(cardRef, OUT_W, Math.max(1, Math.round((size.current.h * OUT_W) / size.current.w)));
      if (!(await shareImageFile(uri, 'बायोडाटा'))) showToast('इस फ़ोन में भेजने की सुविधा नहीं मिली।');
    } catch {
      showToast('फ़ोटो नहीं बन पाई। फिर कोशिश करें।');
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const discoveryOn = rishteyDiscoveryOn(useRemoteConfig());
  const editing = draft !== null;
  return (
    <Screen
      tab
      title="रिश्ते"
      action={
        editing
          ? { testID: 'btn-bio-save', icon: 'check', label: 'सहेजें', onPress: save, disabled: !hasContent(draft), hint: 'बायोडाटा इस फ़ोन में सहेजें' }
          : undefined
      }
    >
      {editing ? (
        <>
          <BiodataForm value={draft} onChange={setDraft} />
          <BigButton tone="plain" label="रहने दें" onPress={() => setDraft(null)} />
        </>
      ) : data ? (
        <>
          <BiodataCard ref={cardRef} data={data} onLayout={(w, h) => (size.current = { w, h })} />
          <BigButton testID="btn-bio-share" icon="share" tone="primary" label={busy ? 'बन रही है…' : 'फ़ोटो भेजें'} onPress={share} disabled={busy} hint="बायोडाटा की फ़ोटो व्हाट्सऐप आदि पर भेजें" />
          <BigButton testID="btn-bio-edit" icon="write" tone="plain" label="बदलें" onPress={() => setDraft({ ...data })} />
        </>
      ) : (
        <View style={styles.empty}>
          <EmptyState icon="events" text="अपना बायोडाटा बनाइए, फ़ोटो बनाकर भेजिए।" />
          <BigButton testID="btn-bio-create" icon="plus" tone="primary" label="बायोडाटा बनाएं" onPress={() => setDraft({ ...EMPTY_BIODATA })} />
        </View>
      )}
      <Text style={[type.caption, styles.note]}>{PRIVACY}</Text>
      {editing ? null : <DiscoverySection />}
      {editing || discoveryOn ? null : (
        <Card style={styles.soon} testID="rishte-soon">
          <Text style={[type.bodyBold, styles.muted]}>रिश्ते खोजें — जल्द आ रहा है</Text>
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  empty: { gap: spacing.md },
  note: { color: colors.muted, textAlign: 'center' },
  soon: { backgroundColor: colors.paper, alignItems: 'center', paddingVertical: spacing.md },
  muted: { color: colors.muted },
});
