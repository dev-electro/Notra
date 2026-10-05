import type { Household } from './types';

/**
 * Fold spelling variants so "सरवन"/"सरवण", "Chhoti"/"choti", "रमेश"/"रमेश्" compare close.
 * Lowercase, strip nukta/chandrabindu/anusvara/virama, collapse long vowel signs, Latin digraph folding.
 */
export function foldName(s: string): string {
  let t = s.toLowerCase().normalize('NFD').replace(/[़ँंँ्]/g, '');
  t = t
    .replace(/ी/g, 'ि')
    .replace(/ू/g, 'ु')
    .replace(/ण/g, 'न')
    .replace(/श|ष/g, 'स')
    .replace(/व/g, 'ब')
    .replace(/[.,]/g, ' ');
  if (/[a-z]/.test(t)) {
    t = t.replace(/chh/g, 'ch').replace(/aa/g, 'a').replace(/ee/g, 'i').replace(/oo/g, 'u').replace(/w/g, 'v')
      .replace(/sh/g, 's').replace(/(.)\1+/g, '$1');
  }
  return t.replace(/\s+/g, ' ').trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** 0..1 similarity of two names (word-wise best match, prefix-friendly). */
export function nameSimilarity(a: string, b: string): number {
  const fa = foldName(a);
  const fb = foldName(b);
  if (!fa || !fb) return 0;
  if (fa === fb) return 1;
  const wa = fa.split(' ');
  const wb = fb.split(' ');
  let sum = 0;
  for (const x of wa) {
    let best = 0;
    for (const y of wb) {
      const d = levenshtein(x, y);
      let s = 1 - d / Math.max(x.length, y.length);
      if (x.length >= 3 && (y.startsWith(x) || x.startsWith(y))) s = Math.max(s, 0.85);
      if (s > best) best = s;
    }
    sum += best;
  }
  return sum / Math.max(wa.length, wb.length);
}

export interface HouseholdQuery {
  name?: string;
  fatherName?: string;
  village?: string;
}

export interface HouseholdMatch {
  household: Household;
  /** 0..1 */
  score: number;
}

const WEIGHTS = { name: 0.5, fatherName: 0.25, village: 0.25 } as const;

/**
 * Rank existing households against a spoken/typed name + father + village. Only the fields that were
 * given count, so "Ramesh, Sarwan" still matches. The name must be somewhat similar, otherwise a
 * matching village alone never suggests a person. Same name in two villages is told apart by
 * father/village score.
 */
export function matchHouseholds(
  query: HouseholdQuery,
  households: readonly Household[],
  opts: { limit?: number; minScore?: number } = {},
): HouseholdMatch[] {
  const { limit = 5, minScore = 0.6 } = opts;
  const parts = (['name', 'fatherName', 'village'] as const).filter((k) => query[k]?.trim());
  if (!parts.includes('name')) return [];
  const totalW = parts.reduce((s, k) => s + WEIGHTS[k], 0);
  const out: HouseholdMatch[] = [];
  for (const h of households) {
    const nameSim = nameSimilarity(query.name!, h.headName);
    if (nameSim < 0.55) continue;
    let sum = nameSim * WEIGHTS.name;
    if (parts.includes('fatherName')) sum += nameSimilarity(query.fatherName!, h.fatherName) * WEIGHTS.fatherName;
    if (parts.includes('village')) sum += nameSimilarity(query.village!, h.village) * WEIGHTS.village;
    const score = Math.round((sum / totalW) * 1000) / 1000;
    if (score >= minScore) out.push({ household: h, score });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}
