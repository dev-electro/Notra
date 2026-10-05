import { addDay, badgeStates, computePoints, EMPTY_ACTIVITY, levelFor, streakFromDays, type Activity } from '../rewards';

const A = (o: Partial<Activity>): Activity => ({ ...EMPTY_ACTIVITY, ...o });

describe('points', () => {
  it('+1 per entry, +5 per event, +10 per backup', () => {
    expect(computePoints(EMPTY_ACTIVITY)).toBe(0);
    expect(computePoints(A({ entries: 12, events: 3, backups: 2 }))).toBe(12 + 15 + 20);
  });
  it('never negative', () => expect(computePoints(A({ entries: -4 }))).toBe(0));
});

describe('levels', () => {
  it('thresholds 0 / 200 / 500 / 1000', () => {
    expect(levelFor(0).level.name).toBe('कांस्य');
    expect(levelFor(199).level.name).toBe('कांस्य');
    expect(levelFor(200).level.name).toBe('रजत');
    expect(levelFor(500).level.name).toBe('स्वर्ण');
    expect(levelFor(1000).level.name).toBe('हीरा');
  });
  it('progress and distance to the next level', () => {
    const i = levelFor(350);
    expect(i.next?.name).toBe('स्वर्ण');
    expect(i.progress).toBeCloseTo(0.5);
    expect(i.toNext).toBe(150);
  });
  it('top level is full', () => expect(levelFor(5000)).toMatchObject({ next: null, progress: 1, toNext: 0 }));
});

describe('streak', () => {
  it('counts consecutive days ending today or yesterday', () => {
    expect(streakFromDays(['2026-03-01', '2026-03-02', '2026-03-03'], '2026-03-03')).toBe(3);
    expect(streakFromDays(['2026-03-01', '2026-03-02'], '2026-03-03')).toBe(2);
  });
  it('a gap resets; an old run is 0', () => {
    expect(streakFromDays(['2026-03-01', '2026-03-03'], '2026-03-03')).toBe(1);
    expect(streakFromDays(['2026-03-01'], '2026-03-05')).toBe(0);
    expect(streakFromDays([], '2026-03-05')).toBe(0);
  });
  it('crosses month ends and ignores junk', () => {
    expect(streakFromDays(['2026-02-28', '2026-03-01', 'oops'], '2026-03-01')).toBe(2);
  });
  it('addDay keeps sorted unique, newest 60', () => {
    expect(addDay(['2026-03-02'], '2026-03-01')).toEqual(['2026-03-01', '2026-03-02']);
    expect(addDay(['2026-03-01'], '2026-03-01')).toEqual(['2026-03-01']);
    const many = Array.from({ length: 70 }, (_, i) => `2025-${String(1 + Math.floor(i / 28)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`);
    expect(addDay(many, '2026-01-01')).toHaveLength(60);
  });
});

describe('badges', () => {
  const ids = (a: Activity) => badgeStates(a).filter((b) => b.unlocked).map((b) => b.badge.id);
  it('locked at the start', () => expect(ids(EMPTY_ACTIVITY)).toEqual([]));
  it('unlock on their thresholds', () => {
    expect(ids(A({ entries: 1 }))).toEqual(['first-entry']);
    expect(ids(A({ households: 10, streak: 7, reports: 1 }))).toEqual(expect.arrayContaining(['families-10', 'streak-7', 'first-report']));
    expect(ids(A({ households: 9 }))).not.toContain('families-10');
  });
});
