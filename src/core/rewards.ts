/**
 * Rewards (इनाम): points and badges worked out on the phone from what the person has already written. Pure functions: every
 * input is passed in, so each rule is unit-tested. Points are only a mark of achievement; they have no cash value.
 */

export interface Activity {
  /** Active (not voided / corrected) entries in the open ledger. */
  entries: number;
  /** Programs (events) created. */
  events: number;
  /** Families in the diary. */
  households: number;
  /** Encrypted backups made on this phone. */
  backups: number;
  /** Reports sent as PDF / photo. */
  reports: number;
  /** Consecutive days the app was opened, ending today (or yesterday). */
  streak: number;
}

export const EMPTY_ACTIVITY: Activity = { entries: 0, events: 0, households: 0, backups: 0, reports: 0, streak: 0 };

export const POINTS = { entry: 1, event: 5, backup: 10 } as const;

export const computePoints = (a: Activity): number =>
  Math.max(0, a.entries) * POINTS.entry + Math.max(0, a.events) * POINTS.event + Math.max(0, a.backups) * POINTS.backup;

export interface Level {
  id: 'kaansya' | 'rajat' | 'swarn' | 'heera';
  name: string;
  min: number;
}

export const LEVELS: readonly Level[] = [
  { id: 'kaansya', name: 'कांस्य', min: 0 },
  { id: 'rajat', name: 'रजत', min: 200 },
  { id: 'swarn', name: 'स्वर्ण', min: 500 },
  { id: 'heera', name: 'हीरा', min: 1000 },
];

export interface LevelInfo {
  level: Level;
  next: Level | null;
  /** 0..1 progress from this level's start to the next level (1 at the top). */
  progress: number;
  /** Points still needed for the next level (0 at the top). */
  toNext: number;
}

export function levelFor(points: number): LevelInfo {
  const p = Math.max(0, Math.floor(points));
  let i = 0;
  for (let k = 0; k < LEVELS.length; k++) if (p >= LEVELS[k].min) i = k;
  const level = LEVELS[i];
  const next = LEVELS[i + 1] ?? null;
  if (!next) return { level, next: null, progress: 1, toNext: 0 };
  return { level, next, progress: (p - level.min) / (next.min - level.min), toNext: next.min - p };
}

const dayNumber = (iso: string): number => {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
};

/** Current run of consecutive days. Counts if the latest day is today or yesterday (today is not over yet). */
export function streakFromDays(days: readonly string[], today: string): number {
  const set = new Set(days.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).map(dayNumber));
  const t = dayNumber(today);
  let cursor = set.has(t) ? t : set.has(t - 1) ? t - 1 : null;
  if (cursor === null) return 0;
  let n = 0;
  while (set.has(cursor)) {
    n++;
    cursor--;
  }
  return n;
}

/** Add today to the list of days the app was used (sorted, unique, newest 60 kept). */
export function addDay(days: readonly string[], today: string): string[] {
  const out = Array.from(new Set([...days, today])).sort();
  return out.slice(-60);
}

export interface BadgeDef {
  id: string;
  title: string;
  hint: string;
  earned: (a: Activity) => boolean;
}

export const BADGES: readonly BadgeDef[] = [
  { id: 'first-entry', title: 'पहला नोतरा', hint: 'पहली एंट्री लिखें', earned: (a) => a.entries >= 1 },
  { id: 'families-10', title: '10 परिवार', hint: '10 परिवार जोड़ें', earned: (a) => a.households >= 10 },
  { id: 'first-event', title: 'पहला कार्यक्रम', hint: 'अपना नोतरा बनाएँ', earned: (a) => a.events >= 1 },
  { id: 'first-report', title: 'पहली रिपोर्ट', hint: 'कोई रिपोर्ट भेजें', earned: (a) => a.reports >= 1 },
  { id: 'first-backup', title: 'पहला बैकअप', hint: 'बैकअप बनाएँ', earned: (a) => a.backups >= 1 },
  { id: 'streak-7', title: '7 दिन लगातार', hint: '7 दिन रोज़ ऐप खोलें', earned: (a) => a.streak >= 7 },
  { id: 'entries-100', title: '100 एंट्री', hint: '100 एंट्री लिखें', earned: (a) => a.entries >= 100 },
  { id: 'streak-30', title: '30 दिन लगातार', hint: '30 दिन रोज़ ऐप खोलें', earned: (a) => a.streak >= 30 },
];

export const badgeStates = (a: Activity): { badge: BadgeDef; unlocked: boolean }[] => BADGES.map((badge) => ({ badge, unlocked: badge.earned(a) }));
