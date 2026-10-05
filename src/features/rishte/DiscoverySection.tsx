import React, { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { getAuthUser } from '@/auth/session';
import { BigButton } from '@/components/big-button';
import { Card, SectionTitle } from '@/components/card';
import { Text } from '@/components/text';
import { rishteyDiscoveryOn } from '@/features';
import { go } from '@/nav';
import { useRemoteConfig } from '@/remote/use-remote';
import { getMyProfile } from '@/rishtey/service';
import type { ServerProfile } from '@/rishtey/logic';
import { useFocusEffect } from 'expo-router';
import { colors, spacing, type } from '@/theme';
import { StatusChip } from './discovery';

/**
 * "समाज में दिखाएँ": below the biodata, only when community discovery is switched on AND the person is signed in.
 * Off by default (legal review pending); with the flag off this renders nothing at all.
 */
export function DiscoverySection() {
  const on = rishteyDiscoveryOn(useRemoteConfig());
  const [signedIn, setSignedIn] = useState(false);
  const [profile, setProfile] = useState<ServerProfile | null>(null);
  useEffect(() => {
    if (on) void getAuthUser().then((u) => setSignedIn(!!u));
  }, [on]);
  useFocusEffect(
    React.useCallback(() => {
      if (!on || !signedIn) return;
      getMyProfile().then((r) => setProfile(r.profile), () => undefined); // offline: the buttons still work
    }, [on, signedIn]),
  );
  if (!on || !signedIn) return null;
  return (
    <Card testID="rishte-discovery" style={styles.card}>
      <SectionTitle icon="families">समाज में दिखाएँ</SectionTitle>
      <Text style={[type.caption, styles.muted]}>चाहें तो अपनी बिरादरी में रिश्ता खोजने के लिए कुछ जानकारी दिखाएँ। जाँच के बाद ही दिखेगी, संपर्क नंबर नहीं।</Text>
      {profile ? <StatusChip status={profile.status} /> : null}
      <BigButton testID="btn-rishtey-share" tone={profile ? 'plain' : 'primary'} icon="share" label={profile ? 'मेरी जानकारी देखें / बदलें' : 'समाज में दिखाएँ'} onPress={() => go('/rishtey/share')} />
      {profile?.status === 'approved' ? <BigButton testID="btn-rishtey-search" tone="primary" icon="search" label="रिश्ते खोजें" onPress={() => go('/rishtey/search')} /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  muted: { color: colors.muted },
});
