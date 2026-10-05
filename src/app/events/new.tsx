import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BigButton } from '@/components/big-button';
import { Card, SectionTitle } from '@/components/card';
import { DateStepper } from '@/components/date-stepper';
import { HouseholdPicker } from '@/components/household-picker';
import { OCCASION_ICON_NAME } from '@/components/occasion';
import { SaveCheck } from '@/components/save-check';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import {
  INVITATION_LABEL, OCCASION_LABEL, OCCASIONS, todayIso,
  type Household, type InvitationType, type Occasion,
} from '@/core';
import { createEvent, getDb, getMyHousehold, type Db } from '@/db';
import { useActiveLedgerId } from '@/hooks/use-active-ledger';
import { replace } from '@/nav';
import { guarded } from '@/services/guard';
import { tapLight } from '@/services/haptics';
import { colors, spacing, type } from '@/theme';

const INVITES: InvitationType[] = ['YELLOW_RICE', 'KUMKUM', 'CARD'];

export default function NewEvent() {
  const [host, setHost] = useState<Household | null>(null);
  const [picking, setPicking] = useState(false);
  const [occasion, setOccasion] = useState<Occasion>('SHAADI');
  const [date, setDate] = useState(todayIso());
  const [panch, setPanch] = useState(false);
  const [invite, setInvite] = useState<InvitationType>('YELLOW_RICE');
  const [created, setCreated] = useState<string | null>(null);
  const ledgerId = useActiveLedgerId();

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

  if (created) {
    return (
      <Screen
        title="कार्यक्रम बन गया"
        noBack
        action={{ icon: 'hisaab', label: 'खाता खोलें', onPress: () => replace(`/events/${created}/ledger`) }}
      >
        <SaveCheck />
        <Text style={[type.heading, styles.center]}>अभी खाता खोलकर नोतरा लिखना शुरू करें?</Text>
        <BigButton label="बाद में" tone="plain" onPress={() => replace(`/events/${created}`)} />
      </Screen>
    );
  }

  const save = async () => {
    if (!host) return;
    const e = await guarded(async () => {
      const db = (await getDb()) as unknown as Db;
      return createEvent(db, {
        hostHouseholdId: host.id, occasion, date, panchApproved: panch, invitationType: invite,
        status: 'PLANNED', ledgerId,
      });
    });
    if (e) {
      tapLight();
      setCreated(e.id);
    }
  };

  return (
    <Screen title="नया कार्यक्रम" action={{ icon: 'check', label: 'सेव करें', onPress: save, disabled: !host }}>
      <SectionTitle icon="house">किसके यहाँ?</SectionTitle>
      <Card style={styles.hostRow}>
        <Text style={[type.bodyBold, styles.host]} numberOfLines={2}>
          {host ? `${host.headName} · ${host.village}` : '—'}
        </Text>
        <BigButton compact label="बदलें" tone="plain" onPress={() => setPicking(true)} />
      </Card>
      <SectionTitle icon="star">अवसर</SectionTitle>
      <View style={styles.row}>
        {OCCASIONS.map((o) => (
          <BigButton key={o} compact icon={OCCASION_ICON_NAME[o]} label={OCCASION_LABEL[o]} selected={occasion === o} onPress={() => setOccasion(o)} />
        ))}
      </View>
      <SectionTitle icon="calendar">तारीख</SectionTitle>
      <DateStepper value={date} onChange={setDate} />
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
  hostRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  host: { flex: 1, color: colors.ink },
  center: { color: colors.ink, textAlign: 'center' },
});
