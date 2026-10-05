import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BigButton } from '@/components/big-button';
import { SectionTitle } from '@/components/card';
import { DatePickerField } from '@/components/calendar';
import { OccasionPicker } from '@/components/occasion-picker';
import { SaveCheck } from '@/components/save-check';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { INVITATION_LABEL, todayIso, type InvitationType, type Occasion } from '@/core';
import { createEvent, getDb, getMyHouseholdId, type Db } from '@/db';
import { useActiveLedgerId } from '@/hooks/use-active-ledger';
import { replace } from '@/nav';
import { guarded } from '@/services/guard';
import { tapLight } from '@/services/haptics';
import { colors, spacing, type } from '@/theme';

const INVITES: InvitationType[] = ['YELLOW_RICE', 'KUMKUM', 'CARD'];

/**
 * नया नोतरा: one of MY programs (I am the host, so here I only receive). With ?old=1 it is the "पुराना हिसाब" version: the same
 * form, a past date, and it goes straight on to writing who came.
 */
export default function NewEvent() {
  const { old } = useLocalSearchParams<{ old?: string }>();
  const isOld = old === '1';
  const [hostId, setHostId] = useState<string | null>(null);
  const [occasion, setOccasion] = useState<Occasion>('SHAADI');
  const [label, setLabel] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(todayIso());
  const [panch, setPanch] = useState(false);
  const [invite, setInvite] = useState<InvitationType>('YELLOW_RICE');
  const [created, setCreated] = useState<string | null>(null);
  const ledgerId = useActiveLedgerId();

  useEffect(() => {
    (async () => setHostId(await getMyHouseholdId((await getDb()) as unknown as Db)))();
  }, []);

  if (created) {
    return (
      <Screen
        title="नोतरा बन गया"
        noBack
        action={{ testID: 'btn-who-came', icon: 'plus', label: '+ कौन आया', onPress: () => replace(`/events/${created}/ledger${isOld ? '?pad=1' : ''}`) }}
      >
        <SaveCheck />
        <Text style={[type.heading, styles.center]}>अभी लिखना शुरू करें कि कौन आया और कितना दिया?</Text>
        <BigButton testID="btn-later" label="बाद में" tone="plain" onPress={() => replace(`/events/${created}`)} />
      </Screen>
    );
  }

  const save = async () => {
    if (!hostId) return;
    const e = await guarded(async () => {
      const db = (await getDb()) as unknown as Db;
      return createEvent(db, {
        hostHouseholdId: hostId, occasion, occasionLabel: label, occasionNote: note, date, panchApproved: panch,
        invitationType: invite, status: date < todayIso() ? 'HELD' : 'PLANNED', ledgerId,
      });
    });
    if (e) {
      tapLight();
      setCreated(e.id);
    }
  };

  return (
    <Screen
      title={isOld ? 'पुराना नोतरा (मेरा)' : 'नया नोतरा'}
      action={{ testID: 'btn-save', icon: 'check', label: 'सेव करें', onPress: save, disabled: !hostId || (occasion === 'OTHER' && !label.trim()) }}
    >
      {isOld ? <Text style={[type.body, styles.muted]}>पुरानी डायरी का अपना नोतरा। तारीख पिछली चुन सकते हैं।</Text> : null}
      <SectionTitle icon="star">अवसर</SectionTitle>
      <OccasionPicker occasion={occasion} onOccasion={setOccasion} label={label} onLabel={setLabel} note={note} onNote={setNote} />
      <SectionTitle icon="calendar">तारीख</SectionTitle>
      <DatePickerField testID="field-date" label="नोतरे की तारीख" value={date} onChange={setDate} />
      <BigButton icon="check" label="पंच की मंज़ूरी" selected={panch} onPress={() => setPanch(!panch)} />
      <SectionTitle icon="doc">न्योता</SectionTitle>
      <View style={styles.row}>
        {INVITES.map((i) => (
          <BigButton key={i} third label={INVITATION_LABEL[i]} selected={invite === i} onPress={() => setInvite(i)} />
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  center: { color: colors.ink, textAlign: 'center' },
  muted: { color: colors.muted },
});
