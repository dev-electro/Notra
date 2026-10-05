import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { track } from '@/analytics';
import { BigButton } from '@/components/big-button';
import { Card, SoonBadge } from '@/components/card';
import { Icon } from '@/components/icons';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { getDb } from '@/db/database';
import { getSetting, setSetting } from '@/db/repository';
import type { Db } from '@/db/types';
import { getModule, type ModuleId } from '@/modules/registry';
import { showToast } from '@/services/toast';
import { colors, spacing, type } from '@/theme';

const key = (id: string) => `interest_${id}`;

/** One reusable "coming soon" page for every unbuilt module. Interest is stored on the phone only. */
export default function Soon() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const mod = getModule(String(id));
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!mod) return;
    (async () => setSaved((await getSetting((await getDb()) as unknown as Db, key(mod.id))) === '1'))().catch(() => {});
  }, [mod]);

  if (!mod) {
    return (
      <Screen title="जल्द आ रहा है">
        <Text style={type.body}>यह पन्ना नहीं मिला।</Text>
      </Screen>
    );
  }
  const notify = async () => {
    try {
      await setSetting((await getDb()) as unknown as Db, key(mod.id), '1');
    } catch {
      // local only; the toast still confirms
    }
    setSaved(true);
    track('feature_interest', { module: mod.id as ModuleId });
    showToast('ठीक है! शुरू होते ही बताएँगे');
  };
  return (
    <Screen title={mod.title}>
      <Card style={styles.card}>
        <View style={styles.disc}>
          <Icon name={mod.icon} size={56} color={colors.received} />
        </View>
        <Text style={[type.title, styles.center]} accessibilityRole="header">{mod.title}</Text>
        <SoonBadge label="जल्द आ रहा है" />
        <Text style={[type.body, styles.center]}>{mod.blurb}</Text>
      </Card>
      <BigButton testID={`btn-notify-${mod.id}`} icon="check" tone="primary" label={saved ? 'ठीक है, बता देंगे' : 'शुरू होने पर मुझे बताएँ'} onPress={notify} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.lg },
  disc: { width: 104, height: 104, borderRadius: 52, backgroundColor: colors.haldiTint, borderWidth: 2, borderColor: colors.haldi, alignItems: 'center', justifyContent: 'center' },
  center: { textAlign: 'center', color: colors.ink },
});
