import { useFocusEffect } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';
import { useAdGate } from '@/ads/use-ad-gate';
import { watchInaamVideo } from '@/ads/service';
import { getAuthUser } from '@/auth/session';
import { BigButton } from '@/components/big-button';
import { Card } from '@/components/card';
import { Field } from '@/components/field';
import { Icon } from '@/components/icons';
import { DotBorder } from '@/components/motifs';
import { Screen } from '@/components/screen';
import { SaveCheck } from '@/components/save-check';
import { Text } from '@/components/text';
import { badgeStates, computePoints, EMPTY_ACTIVITY, levelFor, type Activity } from '@/core';
import { loadActivity } from '@/features/rewards/store';
import { useLoad } from '@/hooks/use-load';
import { useRemoteConfig } from '@/remote/use-remote';
import { moduleOn } from '@/features';
import {
  checkIn, claimVideo, fetchReferral, fetchRewards, isSignedOutError, redeemReferral, referralMessage, rewardsApi, rewardsErrorMessage, streakDots,
  type ReferralState, type RewardsState,
} from '@/rewards/api';
import { go } from '@/nav';
import { showToast } from '@/services/toast';
import { BORDER, colors, radius, spacing, type } from '@/theme';

type Phase = 'loading' | 'signedOut' | 'ready' | 'offline';

/**
 * इनाम. Signed in: the wallet shows the account's points from the server, with हाज़िरी, वीडियो and दोस्त बुलाएँ. Signed out: one
 * calm sign-in prompt. The badges below are worked out on this phone and stay as the offline layer. Points are an achievement
 * score only, never cash.
 */
export default function Inaam() {
  const { data: a } = useLoad<Activity>((db, ledgerId) => loadActivity(db, ledgerId), EMPTY_ACTIVITY);
  const cfg = useRemoteConfig();
  const videoOffered = useAdGate('inaam_video', 'inaam') && moduleOn('videos', cfg);
  const [phase, setPhase] = useState<Phase>('loading');
  const [state, setState] = useState<RewardsState | null>(null);
  const [ref, setRef] = useState<ReferralState | null>(null);
  const [busy, setBusy] = useState<'checkin' | 'video' | 'redeem' | null>(null);
  const [justClaimed, setJustClaimed] = useState(false);
  const [code, setCode] = useState('');
  const [redeemMsg, setRedeemMsg] = useState('');
  const loadId = useRef(0);

  const load = useCallback(async () => {
    const id = ++loadId.current;
    if (!(await getAuthUser())) {
      if (id === loadId.current) setPhase('signedOut');
      return;
    }
    try {
      const api = await rewardsApi();
      const [s, r] = await Promise.all([fetchRewards(api), fetchReferral(api).catch(() => null)]);
      if (id !== loadId.current) return;
      setState(s);
      setRef(r);
      setPhase('ready');
    } catch (e) {
      if (id !== loadId.current) return;
      // A rejected session reads as signed out; any other failure keeps whatever we had and shows one quiet line.
      setPhase((p) => (p === 'ready' ? 'ready' : isSignedOutError(e) ? 'signedOut' : 'offline'));
    }
  }, []);
  useFocusEffect(useCallback(() => void load(), [load]));

  const doCheckin = async () => {
    if (busy) return;
    setBusy('checkin');
    try {
      const r = await checkIn(await rewardsApi());
      setJustClaimed(true);
      showToast(r.bonus ? `हाज़िरी लग गई। +${r.points + r.bonus} अंक (लगातार ${r.streak} दिन)` : `हाज़िरी लग गई। +${r.points} अंक`);
      await load();
    } catch (e) {
      showToast(rewardsErrorMessage(e));
      await load();
    } finally {
      setBusy(null);
    }
  };

  const doVideo = async () => {
    if (busy) return;
    setBusy('video');
    try {
      if (!(await watchInaamVideo())) {
        showToast('अभी वीडियो नहीं चल पाया, थोड़ी देर बाद कोशिश करें');
        return;
      }
      const r = await claimVideo(await rewardsApi());
      showToast(`+${r.points} अंक मिले`);
      await load();
    } catch (e) {
      showToast(rewardsErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const doRedeem = async () => {
    if (busy || code.trim().length < 6) return;
    setBusy('redeem');
    setRedeemMsg('');
    try {
      await redeemReferral(await rewardsApi(), code);
      setCode('');
      showToast('कोड जुड़ गया। 5 एंट्री होते ही दोनों को अंक मिलेंगे');
      await load();
    } catch (e) {
      setRedeemMsg(rewardsErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const share = () => {
    if (ref) void Share.share({ message: referralMessage(ref.code) }).catch(() => {});
  };

  const local = computePoints(a);
  const info = levelFor(local);
  const badges = badgeStates(a);
  const signedIn = phase === 'ready' && state;
  const dots = streakDots(state?.streak ?? 0);
  const checkinOn = moduleOn('checkin', cfg);
  const referralOn = moduleOn('referral', cfg);
  const videosLeft = state ? state.today.videosLimit - state.today.videosUsed : 0;

  return (
    <Screen tab title="इनाम">
      <Card tint="haldi" style={styles.wallet} testID="inaam-level">
        <View style={styles.walletTop}>
          <View style={styles.walletDisc}>
            <Icon name="trophy" size={28} color={colors.ink} />
          </View>
          <Text style={[type.heading, styles.ink]}>मेरा इनाम</Text>
        </View>
        {signedIn ? (
          <>
            <Text style={[type.caption, styles.muted]}>आपके खाते के अंक</Text>
            <Text style={[type.amountXL, styles.ink]} testID="inaam-balance">{state.balance} अंक</Text>
            {state.streak > 0 ? <Text style={[type.caption, styles.muted]}>लगातार {state.streak} दिन</Text> : null}
          </>
        ) : phase === 'signedOut' ? (
          <>
            <Text style={[type.body, styles.ink, styles.center]}>साइन इन करें, तो हाज़िरी और दोस्तों से मिले अंक आपके खाते में जमा होंगे।</Text>
            <BigButton label="साइन इन" tone="primary" small onPress={() => go('/signin')} testID="inaam-signin" />
          </>
        ) : (
          <Text style={[type.caption, styles.muted, styles.center]}>
            {phase === 'loading' ? 'देख रहे हैं…' : 'अभी खाते के अंक नहीं दिख पाए। इंटरनेट देखकर दोबारा खोलें।'}
          </Text>
        )}
        <DotBorder />
      </Card>

      {signedIn && checkinOn ? (
        <Card style={styles.block} testID="card-checkin">
          <View style={styles.rowTop}>
            <Text style={[type.heading, styles.ink, styles.flex]}>रोज़ हाज़िरी</Text>
            {justClaimed || state.today.checkedIn ? (justClaimed ? <SaveCheck size={40} /> : <Icon name="check" size={28} color={colors.successInk} />) : null}
          </View>
          <View style={styles.dots} accessible accessibilityLabel={`लगातार ${state.streak} दिन, सात में से ${dots} पूरे`}>
            {Array.from({ length: 7 }, (_, i) => (
              <View key={i} testID={`dot-${i}`} style={[styles.dot, i < dots && styles.dotOn]} />
            ))}
          </View>
          <Text style={[type.caption, styles.muted]}>7 दिन लगातार पर +10, 30 दिन पर +50 अंक</Text>
          <BigButton
            label={state.today.checkedIn ? 'आज की हाज़िरी हो गई' : 'हाज़िरी लगाएँ'}
            tone={state.today.checkedIn ? 'plain' : 'primary'}
            disabled={state.today.checkedIn || busy !== null}
            onPress={doCheckin}
            testID="checkin-button"
          />
        </Card>
      ) : null}

      {signedIn && videoOffered ? (
        <Card style={styles.block} testID="card-videos">
          <Text style={[type.heading, styles.ink]}>वीडियो देखें</Text>
          <Text style={[type.caption, styles.muted]}>
            {videosLeft > 0 ? `हर वीडियो पर +5 अंक · आज ${videosLeft} और` : 'आज के वीडियो पूरे हो गए, कल फिर आएँ'}
          </Text>
          <BigButton label="वीडियो देखें +5" tone="plain" icon="camera" disabled={videosLeft <= 0 || busy !== null} onPress={doVideo} testID="video-button" />
        </Card>
      ) : null}

      {signedIn && referralOn && ref ? (
        <Card style={styles.block} testID="card-referral">
          <Text style={[type.heading, styles.ink]}>दोस्त बुलाएँ</Text>
          <Text style={[type.caption, styles.muted]}>
            दोस्त कोड डालकर 5 एंट्री लिखे, तो आपको +50 और उन्हें +20 अंक{ref.invited > 0 ? ` · बुलाए ${ref.invited}, पूरे ${ref.qualified}` : ''}
          </Text>
          <Text style={[type.title, styles.ink, styles.code]} selectable testID="referral-code">{ref.code}</Text>
          <BigButton label="दोस्तों को भेजें" tone="plain" icon="share" onPress={share} testID="referral-share" />
          {ref.redeemed ? null : (
            <>
              <Field label="किसी का कोड मिला है?" value={code} onChangeText={(t) => setCode(t.toUpperCase())} autoCapitalize="characters" autoCorrect={false} maxLength={12} placeholder="जैसे K7M2QX" testID="referral-input" />
              {redeemMsg ? <Text style={[type.caption, { color: colors.given }]}>{redeemMsg}</Text> : null}
              <BigButton label="कोड जोड़ें" tone="plain" disabled={busy !== null || code.trim().length < 6} onPress={doRedeem} testID="referral-redeem" />
            </>
          )}
        </Card>
      ) : null}

      <Card style={styles.block} testID="inaam-badges">
        <Text style={[type.heading, styles.ink]} accessibilityRole="header">इस फ़ोन की उपलब्धियाँ</Text>
        <Text style={[type.caption, styles.muted]}>
          स्तर {info.level.name} · {local} अंक (फ़ोन में ही गिने जाते हैं, इंटरनेट नहीं चाहिए)
        </Text>
        <View style={styles.grid}>
          {badges.map(({ badge, unlocked }) => (
            <View
              key={badge.id}
              testID={`badge-${badge.id}`}
              style={[styles.badge, unlocked && styles.badgeOn]}
              accessible
              accessibilityLabel={`${badge.title}, ${unlocked ? 'मिल गया' : `बंद। ${badge.hint}`}`}
            >
              <Icon name={unlocked ? 'star' : 'lock'} size={28} color={unlocked ? colors.received : colors.muted} />
              <Text style={[type.captionBold, { color: unlocked ? colors.ink : colors.muted }, styles.center]} numberOfLines={2} importantForAccessibility="no">
                {badge.title}
              </Text>
              {unlocked ? null : (
                <Text style={[type.caption, styles.muted, styles.center]} numberOfLines={2} importantForAccessibility="no">
                  {badge.hint}
                </Text>
              )}
            </View>
          ))}
        </View>
      </Card>

      <Text style={[type.caption, styles.muted, styles.center]}>अंक अभी सिर्फ़ उपलब्धि के लिए हैं</Text>
    </Screen>
  );
}

const DOT = 28;
const styles = StyleSheet.create({
  wallet: { gap: spacing.xs, alignItems: 'center', padding: spacing.lg, paddingBottom: spacing.sm },
  walletTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  walletDisc: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card },
  block: { gap: spacing.sm },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dots: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2, borderWidth: BORDER, borderColor: colors.outline, backgroundColor: colors.card },
  dotOn: { backgroundColor: colors.success, borderColor: colors.success },
  code: { textAlign: 'center', letterSpacing: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  badge: {
    width: '48%', flexGrow: 1, minHeight: 120, alignItems: 'center', justifyContent: 'center', gap: spacing.xs, padding: spacing.sm,
    backgroundColor: colors.paper, borderWidth: BORDER, borderColor: colors.hairline, borderRadius: radius.card,
  },
  badgeOn: { backgroundColor: colors.receivedTint, borderColor: colors.received },
  flex: { flex: 1 },
  muted: { color: colors.muted },
  ink: { color: colors.ink },
  center: { textAlign: 'center' },
});
