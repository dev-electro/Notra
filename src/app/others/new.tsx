import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Avatar } from '@/components/avatar';
import { BigButton } from '@/components/big-button';
import { Card, SectionTitle } from '@/components/card';
import { DatePickerField } from '@/components/calendar';
import { HouseholdPicker } from '@/components/household-picker';
import { OccasionPicker } from '@/components/occasion-picker';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { todayIso, type Household, type Occasion } from '@/core';
import { findOrCreateEvent, getDb, getHousehold, type Db } from '@/db';
import { useActiveLedgerId } from '@/hooks/use-active-ledger';
import { replace } from '@/nav';
import { guarded } from '@/services/guard';
import { colors, spacing, type } from '@/theme';
import { track } from '@/analytics';

/**
 * नए नोतरे में गए: I went to ANOTHER family's program, so here I only GIVE. Pick the family (the host), then the occasion and
 * the date (the program is found, or made); the amount is written on the next screen. ?old=1 is the "पुराना हिसाब" version
 * (same steps, past dates).
 */
export default function NewVisit() {
  const { old, householdId } = useLocalSearchParams<{ old?: string; householdId?: string }>();
  const isOld = old === '1';
  const ledgerId = useActiveLedgerId();
  const [host, setHost] = useState<Household | null>(null);
  const [occasion, setOccasion] = useState<Occasion>('SHAADI');
  const [label, setLabel] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(todayIso());

  useEffect(() => {
    if (!householdId) return;
    (async () => setHost(await getHousehold((await getDb()) as unknown as Db, householdId)))();
  }, [householdId]);

  if (!host) {
    return (
      <Screen title="किसके नोतरे में गए?" scroll={false}>
        <HouseholdPicker onPick={(h) => setHost(h)} />
      </Screen>
    );
  }

  const next = async () => {
    const ev = await guarded(async () => {
      const db = (await getDb()) as unknown as Db;
      return findOrCreateEvent(db, { ledgerId, hostHouseholdId: host.id, occasion, occasionLabel: label, occasionNote: note, date });
    });
    if (ev) {
      if (ev.createdAt && Date.now() - Date.parse(ev.createdAt) < 10_000) track('event_created', { occasion, is_mine: false, is_old_record: isOld }); // only when it was just created
      replace(`/entry/new?eventId=${ev.id}&householdId=${host.id}${isOld ? '&old=1' : ''}`);
    }
  };

  return (
    <Screen
      title={isOld ? 'पुराना नोतरा (दूसरे का)' : 'नोतरा कौन-सा था?'}
      action={{ testID: 'btn-next', icon: 'chevron', label: 'आगे: रकम लिखें', onPress: next, disabled: occasion === 'OTHER' && !label.trim() }}
    >
      <Card style={styles.who}>
        <Avatar name={host.headName} photoUri={host.photoUri} />
        <View style={styles.flex}>
          <Text style={[type.heading, styles.ink]} numberOfLines={1}>
            {host.headName}
          </Text>
          <Text style={[type.caption, styles.muted]} numberOfLines={1}>
            {[host.fatherName && `${host.fatherName} का`, host.village].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <BigButton testID="btn-change-family" compact label="बदलें" tone="plain" onPress={() => setHost(null)} />
      </Card>
      <SectionTitle icon="star">अवसर</SectionTitle>
      <OccasionPicker occasion={occasion} onOccasion={setOccasion} label={label} onLabel={setLabel} note={note} onNote={setNote} />
      <SectionTitle icon="calendar">तारीख</SectionTitle>
      <DatePickerField testID="field-date" label="नोतरे की तारीख" value={date} onChange={setDate} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  who: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1 },
  ink: { color: colors.ink },
  muted: { color: colors.muted },
});
