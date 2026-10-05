/**
 * इनाम server calls (/v1/rewards/*). They take the app's existing authed client (`api` from sync/runtime: Better Auth session cookie,
 * 401 -> SignedOutError) so this file stays free of native imports and is unit-tested with a fake. Points are an achievement
 * score only; there is no cash anywhere.
 */
import { HttpError, SignedOutError, SuspendedError, type Api } from '@/sync/http';

export interface RewardsState {
  balance: number;
  today: { day: string; checkedIn: boolean; videosUsed: number; videosLimit: number };
  streak: number;
  history: { kind: 'checkin' | 'streak_bonus' | 'video' | 'referral'; points: number; day: string; at: string }[];
}
export interface ReferralState { code: string; invited: number; qualified: number; redeemed: boolean }
export interface CheckinResult { points: number; bonus: number; streak: number }
export interface VideoResult { points: number; videosUsed: number }

export const fetchRewards = (api: Api) => api.request<RewardsState>('GET', '/v1/rewards', { auth: true });
export const checkIn = (api: Api) => api.request<CheckinResult>('POST', '/v1/rewards/checkin', { auth: true });
export const claimVideo = (api: Api) => api.request<VideoResult>('POST', '/v1/rewards/video', { auth: true });
export const fetchReferral = (api: Api) => api.request<ReferralState>('GET', '/v1/rewards/referral', { auth: true });
export const redeemReferral = (api: Api, code: string) =>
  api.request<{ ok: true }>('POST', '/v1/rewards/referral/redeem', { auth: true, body: { code: code.trim().toUpperCase() } });

/** The shared client, loaded lazily so the tab does not pull the native auth stack until it is needed. */
export const rewardsApi = async (): Promise<Api> => (await import('@/sync/runtime')).api;

const BY_CODE: Record<string, string> = {
  already_claimed: 'आज की हाज़िरी लग चुकी है',
  video_cap: 'आज के वीडियो पूरे हो गए, कल फिर आएँ',
  invalid_code: 'यह कोड नहीं मिला, फिर से देखें',
  own_code: 'यह आपका अपना कोड है',
  account_too_old: 'कोड सिर्फ़ नए खाते (7 दिन तक) में डाल सकते हैं',
  already_redeemed: 'आप पहले ही कोड डाल चुके हैं',
};

/** Plain-Hindi text for a failed rewards call. Network trouble reads as a calm "try again". */
export function rewardsErrorMessage(e: unknown): string {
  if (e instanceof SuspendedError) return e.messageHi;
  if (e instanceof HttpError) return BY_CODE[e.code] ?? 'अभी नहीं हो पाया, थोड़ी देर बाद कोशिश करें';
  return 'इंटरनेट नहीं है, थोड़ी देर बाद कोशिश करें';
}

export const isSignedOutError = (e: unknown): boolean => e instanceof SignedOutError;

/** 7 dots for the streak: how many are filled for a given streak length (a full 7 stays full until the next check-in starts a new week). */
export const streakDots = (streak: number): number => (streak <= 0 ? 0 : ((streak - 1) % 7) + 1);

/** Invitation text for the system share sheet. */
export const referralMessage = (code: string): string =>
  `नोतरा बुक में अपना लेन-देन का हिसाब रखें। मेरा कोड ${code} डालें और दोनों को इनाम अंक मिलेंगे।`;
