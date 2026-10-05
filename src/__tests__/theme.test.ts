import { colors, MIN_TOUCH, spacing, textPairs, type } from '@/theme';

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('theme tokens', () => {
  it.each(textPairs.map((p) => [p.name, p] as const))('contrast: %s', (_n, p) => {
    expect(contrast(p.fg, p.bg)).toBeGreaterThanOrEqual(p.min);
  });

  it('uses exactly the agreed palette', () => {
    expect(colors.paper).toBe('#FBF6EC');
    expect(colors.card).toBe('#FFFDF8');
    expect(colors.received).toBe('#1F3A93');
    expect(colors.given).toBe('#9E2A2B');
    expect(colors.haldi).toBe('#E8A317');
    expect(colors.success).toBe('#4B7F52');
    expect(colors.muted).toBe('#5A5148');
    expect(colors.hairline).toBe('#E7DCC8');
  });

  it('keeps the type scale at or above 18 and amounts at 40-56', () => {
    for (const [name, s] of Object.entries(type)) expect([name, (s.fontSize ?? 0) >= 18]).toEqual([name, true]);
    expect(type.amount.fontSize).toBe(40);
    expect(type.amountXL.fontSize).toBe(56);
    expect(type.title.fontSize).toBe(26);
    expect(type.body.fontSize).toBe(20);
  });

  it('keeps spacing on the 8-pt grid (xs is the half step) and touch targets at 64', () => {
    for (const [k, v] of Object.entries(spacing)) expect([k, k === 'xs' ? v === 4 : v % 8 === 0]).toEqual([k, true]);
    expect(MIN_TOUCH).toBe(64);
  });
});
