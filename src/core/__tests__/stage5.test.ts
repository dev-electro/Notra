import { DEFAULT_LEDGER_ID as L, firstRunRoute, isDeleteConfirmed, needsUnlock, DELETE_PHRASE } from '../index';

describe('first-run routing', () => {
  const s = { onboardingSeen: false, signinPrompted: false, setupDone: false };
  it('onboarding, then optional sign-in, then my-household setup, then home', () => {
    expect(firstRunRoute(s)).toBe('/onboarding');
    expect(firstRunRoute({ ...s, onboardingSeen: true })).toBe('/signin?first=1');
    expect(firstRunRoute({ ...s, onboardingSeen: true, signinPrompted: true })).toBe('/setup');
    expect(firstRunRoute({ onboardingSeen: true, signinPrompted: true, setupDone: true })).toBeNull();
  });

  it('a restored phone (setup restored from the cloud) goes straight home', () => {
    expect(firstRunRoute({ onboardingSeen: true, signinPrompted: true, setupDone: true })).toBeNull();
  });
});

describe('account deletion confirmation', () => {
  it('accepts the typed word in either spelling, ignoring spaces', () => {
    expect(DELETE_PHRASE).toBe('हटाएं');
    for (const ok of ['हटाएं', 'हटाएँ', '  हटाएं ', 'हटाएं\n']) expect(isDeleteConfirmed(ok)).toBe(true);
  });
  it('rejects anything else, including near misses and English', () => {
    for (const no of ['', ' ', 'हटाए', 'हटा', 'हटाएं खाता', 'delete', 'DELETE', 'हटाएंं', 'नहीं', 'हाँ']) expect(isDeleteConfirmed(no)).toBe(false);
  });
});

describe('ledger unlock rule', () => {
  it('only PIN-protected ledgers that are not yet unlocked ask for a PIN', () => {
    expect(needsUnlock({ id: L, hasPin: false }, new Set())).toBe(false);
    expect(needsUnlock({ id: 'a', hasPin: false }, new Set())).toBe(false);
    expect(needsUnlock({ id: 'a', hasPin: true }, new Set())).toBe(true);
    expect(needsUnlock({ id: 'a', hasPin: true }, new Set(['a']))).toBe(false);
  });
});
