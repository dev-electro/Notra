import { ApiError } from '../errors';
import { audit, oneOf, pageOf, uuidParam, type Env, type Registry } from './kit';

export const SUPPORT_VIEW_PREFIX = '/support-view/';

const TABLES = {
  ledgers: 'SELECT id, name, kind, created_at, updated_at FROM ledgers WHERE user_id = $1 ORDER BY created_at, id',
  households: 'SELECT id, head_name, father_name, jati, atak, village, fala, phone, created_at, updated_at FROM households WHERE user_id = $1 ORDER BY created_at, id',
  events: 'SELECT id, host_household_id, occasion, date, panch_approved, invitation_type, status, ledger_id, created_at, updated_at FROM events WHERE user_id = $1 ORDER BY created_at, id',
  entries: `SELECT id, event_id, other_household_id, direction, cash_paise::float8 AS cash_paise, in_kind_item, in_kind_value_paise::float8 AS in_kind_value_paise,
            payment_mode, recorded_by, created_at, corrects_entry_id, is_void, ledger_id FROM entries WHERE user_id = $1 ORDER BY created_at, id`,
} as const;

/**
 * THE ONLY admin endpoint that can return ledger rows, and only while the user has an active, user-created support-access grant
 * (POST /v1/support/access in the app: max 7 days, revocable). Two independent checks: this route refuses without a grant, and
 * Row Level Security would return no rows even if it did not. Read-only. Every call is written to the audit log.
 * It is the single exemption from the response privacy guard (see api.ts) and has its own tests.
 */
export function supportViewRoutes(r: Registry, _env: Env): void {
  r.get(`${SUPPORT_VIEW_PREFIX}:userId/:table`, 'support', async (c) => {
    const q = c.get('q');
    const id = uuidParam(c, 'userId');
    const table = oneOf(c.req.param('table'), Object.keys(TABLES) as (keyof typeof TABLES)[], 'table');
    const [g] = await q.query<{ ok: boolean }>('SELECT app_has_grant($1) AS ok', [id]);
    if (!g?.ok) throw new ApiError(403, 'no_active_grant', { detail: 'The user has not granted support access (or it has expired).' });
    const { page, size, offset } = pageOf(c, 50);
    const rows = await q.query(`${TABLES[table]} LIMIT ${size} OFFSET ${offset}`, [id]);
    await audit(c, { action: 'support_data_view', targetType: 'user', targetId: id, after: { table, rows: rows.length, page } });
    return c.json({ table, items: rows, page, page_size: size });
  });
}
