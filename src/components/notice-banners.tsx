import React, { useCallback, useEffect, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { Card } from '@/components/card';
import { Icon } from '@/components/icons';
import { PressableScale } from '@/components/pressable-scale';
import { Text } from '@/components/text';
import { getDb } from '@/db/database';
import { getSetting, setSetting } from '@/db/repository';
import type { Db } from '@/db/types';
import { announcementActive, announcementKey, updateState } from '@/remote/config';
import { appVersion, PLAY_STORE_URL } from '@/remote/device';
import { useRemote } from '@/remote/use-remote';
import { colors, MIN_TOUCH, radius, spacing, type } from '@/theme';

const DISMISSED_ANNOUNCEMENT = 'dismissed_announcement';
const DISMISSED_UPDATE = 'dismissed_update';
const TINT = { info: 'received', warning: 'haldi', critical: 'given' } as const;

function useDismissed() {
  const [d, setD] = useState<{ announcement: string | null; update: string | null }>({ announcement: null, update: null });
  useEffect(() => {
    (async () => {
      try {
        const db = (await getDb()) as unknown as Db;
        setD({ announcement: await getSetting(db, DISMISSED_ANNOUNCEMENT), update: await getSetting(db, DISMISSED_UPDATE) });
      } catch {
        /* not dismissed */
      }
    })();
  }, []);
  const dismiss = useCallback(async (which: 'announcement' | 'update', value: string) => {
    setD((s) => ({ ...s, [which]: value }));
    try {
      await setSetting((await getDb()) as unknown as Db, which === 'announcement' ? DISMISSED_ANNOUNCEMENT : DISMISSED_UPDATE, value);
    } catch {
      /* remembered for this session only */
    }
  }, []);
  return [d, dismiss] as const;
}

interface NoteProps {
  testID: string;
  tint: 'received' | 'haldi' | 'given';
  text: string;
  onClose?: () => void;
  action?: { label: string; onPress: () => void };
}

function Note({ testID, tint, text, onClose, action }: NoteProps) {
  return (
    <Card tint={tint} testID={testID} style={styles.note}>
      <View style={styles.row}>
        <Icon name="warn" size={24} color={colors.ink} />
        <Text style={[type.body, styles.text]}>{text}</Text>
      </View>
      {action || onClose ? (
        <View style={styles.actions}>
          {action ? (
            <PressableScale accessibilityRole="button" accessibilityLabel={action.label} onPress={action.onPress} style={styles.act}>
              <Text style={[type.button, styles.actText]}>{action.label}</Text>
            </PressableScale>
          ) : null}
          {onClose ? (
            <PressableScale accessibilityRole="button" accessibilityLabel="बंद करें" testID={`${testID}-close`} onPress={onClose} style={styles.act}>
              <Text style={[type.button, styles.actText]}>बंद करें</Text>
            </PressableScale>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

/**
 * Server messages, all non-blocking: the diary always works. `scope="home"` shows everything; "settings" only the pause notices
 * (maintenance, suspended account). Each notice is plain Hindi from the server or baked in.
 */
export function NoticeBanners({ scope }: { scope: 'home' | 'settings' }) {
  const { config, suspended } = useRemote();
  const [dismissed, dismiss] = useDismissed();
  const home = scope === 'home';
  const showAnn = home && announcementActive(config.announcement, new Date()) && dismissed.announcement !== announcementKey(config.announcement);
  const up = updateState(appVersion(), config);
  const showUpdate = home && up === 'soft' && dismissed.update !== config.latest_version;
  if (!suspended && !config.maintenance.enabled && !showAnn && !showUpdate) return null;
  return (
    <View style={styles.wrap}>
      {suspended ? <Note testID="notice-suspended" tint="given" text={suspended} /> : null}
      {config.maintenance.enabled ? <Note testID="notice-maintenance" tint="haldi" text={config.maintenance.message_hi} /> : null}
      {showAnn ? (
        <Note testID="notice-announcement" tint={TINT[config.announcement.level]} text={config.announcement.message_hi} onClose={() => void dismiss('announcement', announcementKey(config.announcement))} />
      ) : null}
      {showUpdate ? (
        <Note
          testID="notice-update"
          tint="received"
          text="ऐप का नया संस्करण आ गया है। अपडेट करने पर नई सुविधाएँ मिलेंगी।"
          action={{ label: 'अपडेट करें', onPress: () => void Linking.openURL(PLAY_STORE_URL).catch(() => undefined) }}
          onClose={() => void dismiss('update', config.latest_version)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  note: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  text: { flex: 1, color: colors.ink },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm },
  act: { minHeight: MIN_TOUCH - 8, paddingHorizontal: spacing.md, alignItems: 'center', justifyContent: 'center', borderRadius: radius.button, backgroundColor: colors.card },
  actText: { color: colors.received },
});
