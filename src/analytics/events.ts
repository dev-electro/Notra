/**
 * Analytics event allow-list and sanitizer. PURE TypeScript (no React, Expo or Firebase imports) so it is unit-tested.
 *
 * PRIVACY RULE: nothing from the diary may ever be sent. No names, father's names, villages, phone numbers, amounts, in-kind items,
 * custom occasion labels or notes, free text, search queries, ids. Only the closed vocabulary below leaves the phone:
 *  - the event name must be in EVENTS;
 *  - every param must be declared for that event, with a closed set of values (enum), a boolean, or a coarse bucket;
 *  - as a last guard, whatever passes is still refused if it is a string longer than 40 chars or contains 4+ digits in a row
 *    (a phone number or an amount can never get through, even by a coding mistake in an enum).
 */
export const OCCASION_VALUES = ['SHAADI', 'GRIHAPRAVESH', 'MUNDAN', 'BIMARI', 'MAKAAN', 'OTHER'] as const;
export const PAYMENT_MODE_VALUES = ['CASH', 'UPI'] as const;
export const REPORT_IDS = ['given', 'guests', 'notcome', 'occasion', 'pending', 'person', 'self', 'year', 'household'] as const;
export type ReportId = (typeof REPORT_IDS)[number];
export const SUPPORT_CATEGORY_VALUES = ['complaint', 'bug', 'suggestion', 'delete_account', 'other'] as const;
export const PAGES_BUCKETS = ['1', '2-3', '4-9', '10+'] as const;
export const SUPPORT_DAYS = [1, 3, 7] as const;

/** One param: the allowed values. `'boolean'` is sent as 1/0. Numbers are only allowed from a closed list. */
type Spec = readonly (string | number)[] | 'boolean';

const SIGN_IN_METHODS = ['google', 'phone'] as const;
const SIDES = ['mine_receive', 'others_give'] as const;
const FORMATS = ['png', 'pdf'] as const;

/** Route templates ("/events/[id]", never a real id). tests/analytics.test.ts checks this list against the files in src/app. */
export const SCREENS = [
  '/', '/mera', '/doosre', '/hisab',
  '/account-delete', '/app-lock', '/backup', '/entry/new', '/events/[id]', '/events/[id]/ledger', '/events/new',
  '/households/[id]', '/households/edit', '/households', '/ledger/[direction]', '/ledgers', '/legal/[id]', '/old', '/onboarding',
  '/others/new', '/phone', '/reports/given', '/reports/guests', '/reports/notcome', '/reports/occasion', '/reports/pending',
  '/reports/person', '/reports/self', '/reports/year', '/settings', '/setup', '/signin', '/support-access', '/support', '/sync-errors',
] as const;

export const EVENTS = {
  screen_view: { screen_name: SCREENS },
  app_open_ready: {},
  onboarding_complete: {},
  onboarding_skip: {},
  sign_in: { method: SIGN_IN_METHODS },
  setup_complete: {},
  event_created: { occasion: OCCASION_VALUES, is_mine: 'boolean', is_old_record: 'boolean' },
  entry_saved: { side: SIDES, has_in_kind: 'boolean', payment_mode: PAYMENT_MODE_VALUES },
  entry_corrected: {},
  entry_voided: {},
  report_viewed: { report: REPORT_IDS },
  report_exported: { report: REPORT_IDS, format: FORMATS, pages: PAGES_BUCKETS },
  backup_created: {},
  backup_restored: {},
  cloud_backup_enabled: {},
  cloud_backup_disabled: {},
  support_ticket_submitted: { category: SUPPORT_CATEGORY_VALUES },
  support_access_granted: { days: SUPPORT_DAYS },
  ad_reward_earned: {},
} as const satisfies Record<string, Record<string, Spec>>;

export type EventName = keyof typeof EVENTS;
type Value<S> = S extends 'boolean' ? boolean : S extends readonly (infer V)[] ? V : never;
/** The typed params of one event: `track('entry_saved', { side: 'mine_receive', has_in_kind: false, payment_mode: 'UPI' })`. */
export type EventParams<N extends EventName> = { [K in keyof (typeof EVENTS)[N]]: Value<(typeof EVENTS)[N][K]> };

export const MAX_STRING = 40;
const DIGIT_RUN = /\d{4,}/;

/** True if a value must never be sent, whatever the allow-list says. */
export function looksLeaky(v: unknown): boolean {
  if (typeof v === 'string') return v.length > MAX_STRING || DIGIT_RUN.test(v);
  if (typeof v === 'number') return !Number.isFinite(v) || DIGIT_RUN.test(String(Math.abs(Math.trunc(v))));
  return false;
}

export interface Sanitized {
  name: EventName;
  params: Record<string, string | number>;
}

/**
 * Event in, safe event out, or null (drop the whole event). Unknown events are dropped; params that are not declared for the event
 * are dropped; a declared param with a value outside its allow-list is dropped; a missing declared param just stays missing.
 */
export function sanitizeEvent(name: unknown, params?: unknown): Sanitized | null {
  if (typeof name !== 'string' || !Object.prototype.hasOwnProperty.call(EVENTS, name)) return null;
  const spec = EVENTS[name as EventName] as Record<string, Spec>;
  const out: Record<string, string | number> = {};
  if (typeof params === 'object' && params !== null && !Array.isArray(params)) {
    for (const [k, v] of Object.entries(params as Record<string, unknown>)) {
      if (!Object.prototype.hasOwnProperty.call(spec, k)) continue;
      const s = spec[k];
      if (s === 'boolean') {
        if (typeof v === 'boolean') out[k] = v ? 1 : 0;
        continue;
      }
      if ((typeof v === 'string' || typeof v === 'number') && s.includes(v) && !looksLeaky(v)) out[k] = v;
    }
  }
  return { name: name as EventName, params: out };
}

/** Coarse bucket for a page count (report export). */
export function pagesBucket(n: number): (typeof PAGES_BUCKETS)[number] {
  if (n <= 1) return '1';
  if (n <= 3) return '2-3';
  if (n <= 9) return '4-9';
  return '10+';
}

/** Map a support-form category (whatever the app calls it) to the closed list. */
export function supportCategory(c: unknown): (typeof SUPPORT_CATEGORY_VALUES)[number] {
  return (SUPPORT_CATEGORY_VALUES as readonly unknown[]).includes(c) ? (c as (typeof SUPPORT_CATEGORY_VALUES)[number]) : 'other';
}

/**
 * Screen name from expo-router segments (route TEMPLATES, route groups removed): ['(tabs)'] -> '/', ['events','[id]','ledger'] ->
 * '/events/[id]/ledger'. Anything not in SCREENS becomes null (not sent).
 */
export function screenFromSegments(segments: readonly string[]): string | null {
  const parts = segments.filter((s) => !(s.startsWith('(') && s.endsWith(')')));
  const name = parts.length === 0 ? '/' : '/' + parts.join('/');
  // tabs: '(tabs)/index' arrives as ['(tabs)'] or ['(tabs)','index'] depending on the router version
  const norm = name === '/index' ? '/' : name.replace(/\/index$/, '') || '/';
  return (SCREENS as readonly string[]).includes(norm) ? norm : null;
}
