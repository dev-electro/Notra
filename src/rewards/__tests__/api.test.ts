import { HttpError, SignedOutError, SuspendedError, type Api } from '@/sync/http';
import { checkIn, claimVideo, fetchReferral, fetchRewards, redeemReferral, referralMessage, rewardsErrorMessage, streakDots } from '../api';

function fake(result: unknown = {}) {
  const calls: { method: string; path: string; o?: { body?: unknown; auth?: boolean } }[] = [];
  const api: Api = { request: async <T,>(method: 'GET' | 'POST' | 'DELETE', path: string, o?: { body?: unknown; auth?: boolean }) => (calls.push({ method, path, o }), result as T) };
  return { api, calls };
}

describe('rewards api', () => {
  it('calls the five endpoints with the session', async () => {
    const f = fake();
    await fetchRewards(f.api);
    await checkIn(f.api);
    await claimVideo(f.api);
    await fetchReferral(f.api);
    await redeemReferral(f.api, ' ab12cd ');
    expect(f.calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'GET /v1/rewards', 'POST /v1/rewards/checkin', 'POST /v1/rewards/video', 'GET /v1/rewards/referral', 'POST /v1/rewards/referral/redeem',
    ]);
    expect(f.calls.every((c) => c.o?.auth === true)).toBe(true);
    expect(f.calls[4]!.o?.body).toEqual({ code: 'AB12CD' });
  });

  it('maps errors to calm Hindi', () => {
    expect(rewardsErrorMessage(new HttpError(409, 'already_claimed'))).toContain('हाज़िरी');
    expect(rewardsErrorMessage(new HttpError(409, 'video_cap'))).toContain('वीडियो');
    expect(rewardsErrorMessage(new HttpError(404, 'invalid_code'))).toContain('कोड');
    expect(rewardsErrorMessage(new HttpError(500, 'internal'))).toContain('कोशिश');
    expect(rewardsErrorMessage(new SuspendedError('रुका'))).toBe('रुका');
    expect(rewardsErrorMessage(new TypeError('Network request failed'))).toContain('इंटरनेट');
    expect(rewardsErrorMessage(new SignedOutError())).toContain('इंटरनेट');
  });

  it('streak dots wrap every 7 days and stay full on the 7th', () => {
    expect([0, 1, 6, 7, 8, 14, 15].map(streakDots)).toEqual([0, 1, 6, 7, 1, 7, 1]);
  });

  it('the invitation carries the code', () => expect(referralMessage('ABC234')).toContain('ABC234'));
});
