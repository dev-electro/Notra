import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BigButton } from '@/components/big-button';
import { EmptyState } from '@/components/empty-state';
import { Screen } from '@/components/screen';
import { SegmentedControl } from '@/components/segmented';
import { Text } from '@/components/text';
import { ProfileRow } from '@/features/rishte/discovery';
import { go } from '@/nav';
import { INTEREST_LABEL } from '@/rishtey/logic';
import { answerInterest, errorText, listInterests } from '@/rishtey/service';
import { useServer } from '@/rishtey/use-server';
import { showToast } from '@/services/toast';
import { colors, spacing, type } from '@/theme';

type Box = 'received' | 'sent';

/** आई और भेजी हुई रुचि. Received: accept or "अभी नहीं" (the sender is never told it was declined). Accepted: open the profile to see the contact. */
export default function Interests() {
  const [box, setBox] = useState<Box>('received');
  const { data, loading, error, reload } = useServer(() => listInterests(box), box);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const answer = async (id: string, yes: boolean) => {
    setBusy(true);
    setMsg('');
    try {
      await answerInterest(id, yes);
      showToast(yes ? 'रुचि स्वीकार की' : 'ठीक है');
      reload();
    } catch (e) {
      setMsg(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const rows = data ?? [];
  return (
    <Screen title="रुचि">
      <SegmentedControl<Box> segments={[{ id: 'received', label: 'आई हुई' }, { id: 'sent', label: 'भेजी हुई' }]} value={box} onChange={setBox} />
      {error || msg ? <Text style={[type.bodyBold, styles.bad]} accessibilityLiveRegion="polite">{error || msg}</Text> : null}
      {rows.length === 0 && !loading && !error ? <EmptyState icon="families" text={box === 'received' ? 'अभी किसी की रुचि नहीं आई।' : 'आपने अभी किसी को रुचि नहीं भेजी।'} /> : null}
      {rows.map((r) => (
        <View key={r.id} style={styles.item}>
          <ProfileRow p={r.profile} onPress={() => go(`/rishtey/${r.profile.id}`)} />
          <Text style={[type.captionBold, styles.status]}>{r.status === 'accepted' ? INTEREST_LABEL.accepted : box === 'received' ? INTEREST_LABEL.received : INTEREST_LABEL.sent}</Text>
          {box === 'received' && r.status === 'sent' ? (
            <View style={styles.wrap}>
              <BigButton compact tone="primary" label="स्वीकार करें" onPress={() => void answer(r.id, true)} disabled={busy} />
              <BigButton compact tone="plain" label="अभी नहीं" onPress={() => void answer(r.id, false)} disabled={busy} />
            </View>
          ) : null}
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  item: { gap: spacing.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  status: { color: colors.muted },
  bad: { color: colors.given },
});
