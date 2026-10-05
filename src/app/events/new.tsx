import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BigButton } from '@/components/big-button';
import { DateStepper } from '@/components/date-stepper';
import { Field } from '@/components/field';
import { HouseholdPicker } from '@/components/household-picker';
import { Screen } from '@/components/screen';
import {
  INVITATION_LABEL, OCCASION_ICON, OCCASION_LABEL, OCCASIONS, todayIso,
  type Household, type InvitationType, type Occasion,
} from '@/core';
import { createEvent, getDb, getMyHousehold, type Db } from '@/db';
import { replace } from '@/nav';
import { colors, spacing } from '@/theme';

const INVITES: InvitationType[] = ['YELLOW_RICE', 'KUMKUM', 'CARD'];

export default function NewEvent() {
  const [host, setHost] = useState<Household | null>(null);
  const [picking, setPicking] = useState(false);
  const [occasion, setOccasion] = useState<Occasion>('SHAADI');
  const [date, setDate] = useState(todayIso());
  const [panch, setPanch] = useState(false);
  const [invite, setInvite] = useState<InvitationType>('YELLOW_RICE');
  const [lekhak, setLekhak] = useState('');

  useEffect(() => {
    (async () => setHost(await getMyHousehold((await getDb()) as unknown as Db)))();
  }, []);

  if (picking) {
    return (
      <Screen title="कार्यक्रम किसका?" scroll={false} onBack={() => setPicking(false)}>
        <HouseholdPicker
          onPick={(h) => {
            setHost(h);
            setPicking(false);
          }}
        />
      </Screen>
    );
  }

  const save = async () => {
    if (!host) return;
    const db = (await getDb()) as unknown as Db;
    const e = await createEvent(db, {
      hostHouseholdId: host.id, occasion, date, panchApproved: panch, invitationType: invite,
      lekhakName: lekhak.trim() || undefined, status: 'PLANNED',
    });
    replace(`/events/${e.id}`);
  };

  return (
    <Screen title="नया कार्यक्रम">
      <Text style={styles.label}>किसके यहाँ?</Text>
      <View style={styles.row}>
        <Text style={styles.host}>{host ? `${host.headName} · ${host.village}` : '—'}</Text>
        <BigButton compact label="बदलें" tone="plain" onPress={() => setPicking(true)} />
      </View>
      <Text style={styles.label}>अवसर</Text>
      <View style={styles.row}>
        {OCCASIONS.map((o) => (
          <BigButton key={o} compact icon={OCCASION_ICON[o]} label={OCCASION_LABEL[o]} tone="plain" selected={occasion === o} onPress={() => setOccasion(o)} />
        ))}
      </View>
      <Text style={styles.label}>तारीख</Text>
      <DateStepper value={date} onChange={setDate} />
      <BigButton icon={panch ? '✔' : '＋'} label="पंच की मंज़ूरी" tone="plain" selected={panch} onPress={() => setPanch(!panch)} />
      <Text style={styles.label}>न्योता</Text>
      <View style={styles.row}>
        {INVITES.map((i) => (
          <BigButton key={i} compact label={INVITATION_LABEL[i]} tone="plain" selected={invite === i} onPress={() => setInvite(i)} />
        ))}
      </View>
      <Field label="लेखक का नाम (ज़रूरी नहीं)" value={lekhak} onChangeText={setLekhak} />
      <BigButton icon="✔" label="सेव करें" onPress={save} disabled={!host} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center' },
  label: { fontSize: 22, fontWeight: '700', color: colors.inkBlue },
  host: { flex: 1, fontSize: 24, fontWeight: '700', color: colors.text },
});
