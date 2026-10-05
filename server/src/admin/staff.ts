import { normalizeIndianMobile } from '../auth/phone';
import { ApiError } from '../errors';
import { ROLES } from './auth';
import { audit, iso, oneOf, readBody, reasonOf, uuidParam, UUID_RE, type AdminContext, type Env, type Registry } from './kit';
import { maskEmail, maskName, maskPhone } from './mask';

const ASSIGNABLE = ['user', ...ROLES] as const;

/**
 * Staff = ordinary app accounts whose profiles.role is not 'user'. Owner only. The role changes through staff_set_role()
 * (SECURITY DEFINER), the only code path allowed to write that column; it refuses to demote the last owner.
 */
export function staffRoutes(r: Registry, _env: Env): void {
  r.get('/staff', 'owner', async (c) => {
    const rows = await c.get('q').query<{
      user_id: string; role: string; phone_e164: string | null; email: string | null; display_name: string | null; created_at: string | Date; status: string;
    }>('SELECT user_id, role, phone_e164, email, display_name, created_at, status FROM staff_list()');
    return c.json({
      items: rows.map((s) => ({
        user_id: s.user_id, role: s.role, status: s.status, created_at: iso(s.created_at),
        phone_masked: maskPhone(s.phone_e164), email_masked: maskEmail(s.email), name_masked: maskName(s.display_name),
      })),
    });
  });

  async function setRole(c: AdminContext, userId: string, role: string, reason: string, action: string) {
    const q = c.get('q');
    const [prev] = await q.query<{ prev: string }>('SELECT staff_set_role($1, $2) AS prev', [userId, role]);
    await audit(c, { action, targetType: 'user', targetId: userId, reason, before: { role: prev?.prev }, after: { role } });
    return c.json({ ok: true, user_id: userId, role, previous_role: prev?.prev });
  }

  // Give an existing account a staff role: by user id, phone (any Indian format) or e-mail. The person must have signed in once.
  r.post('/staff', 'owner', async (c) => {
    const b = await readBody(c);
    const reason = reasonOf(b);
    const role = oneOf(b.role, ROLES, 'role');
    let id: string | undefined;
    if (typeof b.user_id === 'string' && UUID_RE.test(b.user_id)) id = b.user_id.toLowerCase();
    else {
      const phone = b.phone !== undefined ? normalizeIndianMobile(b.phone) : null;
      const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : null;
      if (!phone && !email) throw new ApiError(400, 'invalid_input', { detail: 'Give user_id, phone or email.' });
      const [u] = await c.get('q').query<{ id: string }>(
        'SELECT id FROM users WHERE ($1::text IS NOT NULL AND phone_e164 = $1) OR ($2::text IS NOT NULL AND lower(email) = $2) LIMIT 1', [phone, email],
      );
      if (!u) throw new ApiError(404, 'user_not_found', { detail: 'That person has not signed in to Notra yet.' });
      id = u.id;
    }
    return setRole(c, id, role, reason!, 'staff.set_role');
  });

  r.patch('/staff/:userId', 'owner', async (c) => {
    const b = await readBody(c);
    return setRole(c, uuidParam(c, 'userId'), oneOf(b.role, ASSIGNABLE, 'role'), reasonOf(b)!, 'staff.set_role');
  });

  // "Remove" = back to an ordinary user. The account itself is untouched.
  r.delete('/staff/:userId', 'owner', async (c) => {
    const b = await readBody(c, true);
    return setRole(c, uuidParam(c, 'userId'), 'user', reasonOf(b)!, 'staff.remove');
  });
}
