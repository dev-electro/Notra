/**
 * HARD PRIVACY RULE: no admin endpoint ever returns a user's ledger content (who gave how much to whom, household names,
 * villages, event details). Admins see account metadata and aggregate counts only.
 *
 * This list is enforced three ways: (1) a response guard on every /admin/api response, (2) the audit writer strips these keys
 * from before/after metadata, (3) a test walks every registered admin route and fails if one appears.
 */
export const FORBIDDEN_KEYS = [
  // households
  'head_name', 'father_name', 'jati', 'atak', 'village', 'fala', 'panchayat', 'tehsil', 'district', 'headname', 'fathername',
  'phone', // a household phone; user phones are always `phone_masked` (or `value` in the audited unmask response)
  'other_household_id', 'host_household_id', 'my_household_id',
  // entries
  'cash_paise', 'cashpaise', 'in_kind_item', 'in_kind_value_paise', 'inkinditem', 'inkindvaluepaise',
  'direction', 'payment_mode', 'recorded_by', 'corrects_entry_id', 'is_void',
  // events
  'occasion_label', 'occasion_note', 'panch_approved', 'invitation_type', 'host_household',
  // ledgers / profile
  'ledger_name', 'increment',
] as const;

const FORBIDDEN = new Set<string>(FORBIDDEN_KEYS);
const FORBIDDEN_PREFIXES = ['in_kind', 'inkind', 'cash_'];

export const isForbiddenKey = (k: string): boolean => {
  const l = k.toLowerCase();
  return FORBIDDEN.has(l) || FORBIDDEN_PREFIXES.some((p) => l.startsWith(p));
};

/** Every forbidden key path found anywhere inside a JSON value (empty when clean). */
export function findForbidden(value: unknown, path = '$'): string[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => findForbidden(v, `${path}[${i}]`));
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([k, v]) => [...(isForbiddenKey(k) ? [`${path}.${k}`] : []), ...findForbidden(v, `${path}.${k}`)]);
  }
  return [];
}

/** Copy of `value` without forbidden keys (for audit metadata). */
export function stripForbidden<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripForbidden) as T;
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).filter(([k]) => !isForbiddenKey(k)).map(([k, v]) => [k, stripForbidden(v)])) as T;
  }
  return value;
}
