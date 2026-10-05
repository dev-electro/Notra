import { afterConfirm, afterNew, afterVerify, isWeakPin, startFlow } from '../pin-flow';

describe('PIN flow', () => {
  it('unlock / remove: verify only', () => {
    const o = { verify: true, askNew: false };
    expect(startFlow(o)).toEqual({ step: 'verify' });
    expect(afterVerify(o)).toEqual({ step: 'done' });
  });

  it('set: choose and repeat, no verify', () => {
    const o = { verify: false, askNew: true };
    expect(startFlow(o)).toEqual({ step: 'new' });
    const s = afterNew('4821');
    expect(s).toEqual({ step: 'confirm', firstPin: '4821' });
    expect(afterConfirm(s, '4821')).toEqual({ step: 'done', pin: '4821' });
  });

  it('change: verify, then choose and repeat', () => {
    const o = { verify: true, askNew: true };
    expect(startFlow(o).step).toBe('verify');
    expect(afterVerify(o).step).toBe('new');
  });

  it('a mismatching repeat saves nothing and starts the choice over', () => {
    const s = afterNew('4821');
    const bad = afterConfirm(s, '4822');
    expect(bad).toEqual({ step: 'new', mismatch: true });
    expect(bad.pin).toBeUndefined();
    expect(bad.firstPin).toBeUndefined();
  });

  it('nothing to ask means done at once', () => {
    expect(startFlow({ verify: false, askNew: false }).step).toBe('done');
  });

  it('flags trivially guessable PINs', () => {
    for (const p of ['0000', '1111', '9999', '1234', '4321']) expect(isWeakPin(p)).toBe(true);
    for (const p of ['4821', '2580', '1357']) expect(isWeakPin(p)).toBe(false);
  });
});
