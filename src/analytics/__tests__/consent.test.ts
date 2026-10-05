import { collectionPlan, parseOptIn } from '../consent';

const base = { userOptIn: true, remoteEnabled: true, consentBlocked: false, adsConsentResolved: false };

describe('collectionPlan', () => {
  it('defaults to collecting (India: no consent form required), with ad signals off until UMP resolves', () => {
    expect(collectionPlan({ ...base, userOptIn: null })).toEqual({ collect: true, adSignals: false });
    expect(collectionPlan({ ...base, userOptIn: undefined }).collect).toBe(true);
  });
  it('ad signals only after UMP resolved', () => {
    expect(collectionPlan({ ...base, adsConsentResolved: true })).toEqual({ collect: true, adSignals: true });
  });
  it('the Settings toggle off stops everything', () => {
    expect(collectionPlan({ ...base, userOptIn: false, adsConsentResolved: true })).toEqual({ collect: false, adSignals: false });
  });
  it('the remote flag off stops everything', () => {
    expect(collectionPlan({ ...base, remoteEnabled: false, adsConsentResolved: true })).toEqual({ collect: false, adSignals: false });
  });
  it('a required-but-unanswered consent form blocks collection', () => {
    expect(collectionPlan({ ...base, consentBlocked: true, adsConsentResolved: false })).toEqual({ collect: false, adSignals: false });
  });
  it('parseOptIn: only an explicit "0" is off', () => {
    expect(parseOptIn(null)).toBe(true);
    expect(parseOptIn(undefined)).toBe(true);
    expect(parseOptIn('')).toBe(true);
    expect(parseOptIn('1')).toBe(true);
    expect(parseOptIn('0')).toBe(false);
  });
});
