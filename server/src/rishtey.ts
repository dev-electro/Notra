import { Hono } from 'hono';
import type { Context } from 'hono';
import { featureOn } from './appconfig';
import { withUserTx, type Db, type Queryable } from './db';
import { ApiError } from './errors';

/**
 * रिश्ते phase 2: community discovery, mounted at /v1/rishtey/*. Dark (404) until features.rishtey_discovery is switched on.
 * Privacy lives in the database (migration 105): own profile by RLS, everything about other people through SECURITY DEFINER functions
 * that return PUBLIC columns only, contact only after an accepted interest. This file validates input and shapes responses.
 */

export const PUBLISHED_BY = ['self', 'parent', 'guardian', 'sibling'] as const;
export const GENDERS = ['male', 'female'] as const;
export const REPORT_REASONS = ['fake', 'inappropriate', 'spam', 'harassment', 'other'] as const;
export const DAILY_INTEREST_CAP = 10;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Error messages raised by the SQL functions -> HTTP. Shared with the admin API through app.ts onError. */
const PG_ERRORS: Record<string, [ApiError['status'], string]> = {
  profile_not_approved: [403, 'profile_not_approved'],
  profile_not_found: [404, 'not_found'],
  contact_not_allowed: [403, 'contact_not_allowed'],
  interest_cap: [429, 'interest_cap'],
  interest_exists: [409, 'interest_exists'],
  invalid_state: [409, 'invalid_state'],
  invalid_input: [400, 'invalid_input'],
  report_not_found: [404, 'not_found'],
};
export function rishteyPgError(message: string | undefined): ApiError | null {
  const hit = message ? PG_ERRORS[message] : undefined;
  return hit ? new ApiError(hit[0], hit[1], message === 'interest_cap' ? { cap: DAILY_INTEREST_CAP, retryAfter: 3600 } : undefined) : null;
}

export interface ProfileInput {
  gender: (typeof GENDERS)[number] | null;
  first_name: string | null;
  age: number | null;
  height_cm: number | null;
  gotra: string | null;
  education: string | null;
  occupation: string | null;
  district: string | null;
  state: string | null;
  contact: string | null;
  published_by: (typeof PUBLISHED_BY)[number];
}

const bad = (detail: string) => new ApiError(400, 'invalid_input', { detail });
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function text(b: Record<string, unknown>, k: string, max: number): string | null {
  const v = b[k];
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') throw bad(`${k} must be text`);
  const s = v.trim().replace(/\s+/g, ' ');
  if (s.length > max) throw bad(`${k} is too long`);
  return s || null;
}
function num(b: Record<string, unknown>, k: string, min: number, max: number): number | null {
  const v = b[k];
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) throw bad(`${k} must be a whole number from ${min} to ${max}`);
  return v;
}

/** Validates the profile body. Every field is optional (a draft may be partial); completeness is checked when publishing. */
export function parseProfileInput(raw: unknown): ProfileInput {
  if (!isObj(raw)) throw bad('body must be a JSON object');
  const gender = raw.gender ?? null;
  if (gender !== null && !(GENDERS as readonly unknown[]).includes(gender)) throw bad('gender must be male or female');
  const published_by = raw.published_by ?? 'self';
  if (!(PUBLISHED_BY as readonly unknown[]).includes(published_by)) throw bad('published_by must be self, parent, guardian or sibling');
  const contact = text(raw, 'contact', 20);
  if (contact !== null && !/^[0-9+\- ]{8,20}$/.test(contact)) throw bad('contact must be a phone number');
  return {
    gender: gender as ProfileInput['gender'],
    first_name: text(raw, 'first_name', 40),
    age: num(raw, 'age', 18, 80),
    height_cm: num(raw, 'height_cm', 100, 230),
    gotra: text(raw, 'gotra', 60),
    education: text(raw, 'education', 80),
    occupation: text(raw, 'occupation', 80),
    district: text(raw, 'district', 60),
    state: text(raw, 'state', 60),
    contact,
    published_by: published_by as ProfileInput['published_by'],
  };
}

export const REQUIRED_TO_PUBLISH = ['first_name', 'age', 'gender', 'contact'] as const;

interface ProfileRow {
  id: string; status: string; published_by: string; gender: string | null; first_name: string | null; age: number | null; age_at: string | Date;
  height_cm: number | null; gotra: string | null; education: string | null; occupation: string | null; district: string | null; state: string | null;
  contact: string | null; consent_at: string | Date | null; reject_reason: string | null; updated_at: string | Date;
}
const PROFILE_COLS = 'id, status, published_by, gender, first_name, age, age_at, height_cm, gotra, education, occupation, district, state, contact, consent_at, reject_reason, updated_at';
const iso = (v: unknown) => (v === null || v === undefined ? null : new Date(v as string).toISOString());

/** My own profile (the only place `contact` is returned, and only to its owner). */
const ownShape = (r: ProfileRow) => ({
  id: r.id, status: r.status, published_by: r.published_by, gender: r.gender, first_name: r.first_name, age: r.age, height_cm: r.height_cm, gotra: r.gotra,
  education: r.education, occupation: r.occupation, district: r.district, state: r.state, contact: r.contact, consent_at: iso(r.consent_at), reject_reason: r.status === 'rejected' ? r.reject_reason : null,
});

const PUBLIC_KEYS = ['id', 'first_name', 'age', 'gender', 'height_cm', 'gotra', 'education', 'occupation', 'district', 'state', 'published_by', 'my_interest'] as const;
const publicShape = (r: Record<string, unknown>) => Object.fromEntries(PUBLIC_KEYS.filter((k) => k in r).map((k) => [k, r[k] ?? null]));

type Vars = { Variables: { userId: string; role: string } };

function uuid(v: unknown, name = 'id'): string {
  if (typeof v !== 'string' || !UUID_RE.test(v)) throw bad(`${name} must be an id`);
  return v.toLowerCase();
}
const intParam = (v: string | undefined, d: number, min: number, max: number) => {
  const n = Number.parseInt(v ?? '', 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d;
};

export function createRishteyApi(db: Db, readBody: (c: Context) => Promise<unknown>) {
  const app = new Hono<Vars>();
  const tx = <T>(c: Context<Vars>, fn: (q: Queryable) => Promise<T>) => withUserTx(db, c.get('userId'), 'user', fn);

  // Dark until the flag is on (legal review pending): the endpoints answer as if they did not exist.
  app.use('*', async (_c, next) => {
    if (!(await featureOn(db, 'rishtey_discovery'))) throw new ApiError(404, 'not_found');
    await next();
  });

  async function myRow(q: Queryable, uid: string, lock = false): Promise<ProfileRow | undefined> {
    return (await q.query<ProfileRow>(`SELECT ${PROFILE_COLS} FROM rishtey_profiles WHERE user_id = $1 ${lock ? 'FOR UPDATE' : ''}`, [uid]))[0];
  }
  const phoneVerified = async (q: Queryable, uid: string) =>
    (await q.query<{ ok: boolean }>('SELECT (phone_verified AND phone_e164 IS NOT NULL) AS ok FROM users WHERE id = $1', [uid]))[0]?.ok === true;

  // ---- my profile ----
  app.get('/profile', async (c) => {
    const uid = c.get('userId');
    return c.json(await tx(c, async (q) => {
      const r = await myRow(q, uid);
      return { profile: r ? ownShape(r) : null, phone_verified: await phoneVerified(q, uid) };
    }));
  });

  // Save (create or edit). Never publishes. Editing an approved profile's public details sends it back for review.
  app.put('/profile', async (c) => {
    const input = parseProfileInput(await readBody(c));
    const uid = c.get('userId');
    const profile = await tx(c, async (q) => {
      const cur = await myRow(q, uid, true);
      if (!cur) {
        const [r] = await q.query<ProfileRow>(
          `INSERT INTO rishtey_profiles (user_id, status, published_by, gender, first_name, age, height_cm, gotra, education, occupation, district, state, contact)
           VALUES ($1, 'draft', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING ${PROFILE_COLS}`,
          [uid, input.published_by, input.gender, input.first_name, input.age, input.height_cm, input.gotra, input.education, input.occupation, input.district, input.state, input.contact],
        );
        return r!;
      }
      const publicChanged = (['gender', 'first_name', 'height_cm', 'gotra', 'education', 'occupation', 'district', 'state', 'published_by'] as const).some((k) => (cur[k] ?? null) !== input[k])
        || (cur.age ?? null) !== input.age;
      const status = cur.status === 'approved' && publicChanged ? 'pending' : cur.status;
      const ageChanged = (cur.age ?? null) !== input.age;
      const [r] = await q.query<ProfileRow>(
        `UPDATE rishtey_profiles SET status = $2, published_by = $3, gender = $4, first_name = $5, age = $6, age_at = CASE WHEN $13 THEN current_date ELSE age_at END,
           height_cm = $7, gotra = $8, education = $9, occupation = $10, district = $11, state = $12, contact = $14, updated_at = now()
         WHERE user_id = $1 RETURNING ${PROFILE_COLS}`,
        [uid, status, input.published_by, input.gender, input.first_name, input.age, input.height_cm, input.gotra, input.education, input.occupation, input.district, input.state, ageChanged, input.contact],
      );
      return r!;
    });
    return c.json({ profile: ownShape(profile) });
  });

  // Submit for review. Needs a verified phone, the explicit consent, and the basics. Goes live only when a moderator approves.
  app.post('/profile/publish', async (c) => {
    const b = await readBody(c);
    if (!isObj(b) || b.consent !== true) throw new ApiError(400, 'consent_required');
    const uid = c.get('userId');
    const profile = await tx(c, async (q) => {
      if (!(await phoneVerified(q, uid))) throw new ApiError(403, 'phone_not_verified');
      const cur = await myRow(q, uid, true);
      if (!cur) throw new ApiError(404, 'not_found');
      const missing = REQUIRED_TO_PUBLISH.filter((k) => cur[k] === null || cur[k] === undefined);
      if (missing.length) throw new ApiError(400, 'incomplete', { missing });
      if (cur.status === 'pending' || cur.status === 'approved') return cur;
      const [r] = await q.query<ProfileRow>(
        `UPDATE rishtey_profiles SET status = 'pending', consent_at = now(), updated_at = now() WHERE user_id = $1 RETURNING ${PROFILE_COLS}`, [uid]);
      return r!;
    });
    return c.json({ profile: ownShape(profile) });
  });

  // Take my profile out of search at once (it can be submitted again later).
  app.post('/profile/hide', async (c) => {
    const uid = c.get('userId');
    const profile = await tx(c, async (q) => {
      const [r] = await q.query<ProfileRow>(
        `UPDATE rishtey_profiles SET status = CASE WHEN status IN ('approved', 'pending') THEN 'hidden' ELSE status END, updated_at = now()
         WHERE user_id = $1 RETURNING ${PROFILE_COLS}`, [uid]);
      if (!r) throw new ApiError(404, 'not_found');
      return r;
    });
    return c.json({ profile: ownShape(profile) });
  });

  // Hard delete: the profile, and every interest I sent or received. Idempotent.
  app.delete('/profile', async (c) => {
    const uid = c.get('userId');
    await tx(c, async (q) => {
      await q.query('DELETE FROM rishtey_interests WHERE from_user = $1 OR to_user = $1', [uid]);
      await q.query('DELETE FROM rishtey_profiles WHERE user_id = $1', [uid]);
    });
    return c.json({ ok: true });
  });

  // ---- discovery ----
  app.get('/search', async (c) => {
    const qs = c.req.query();
    const gender = qs.gender ?? null;
    if (gender !== null && !(GENDERS as readonly string[]).includes(gender)) throw bad('gender must be male or female');
    const ageMin = qs.age_min ? intParam(qs.age_min, 18, 18, 80) : null;
    const ageMax = qs.age_max ? intParam(qs.age_max, 80, 18, 80) : null;
    const place = (v: string | undefined) => (v && v.trim() ? v.trim().slice(0, 60) : null);
    const limit = intParam(qs.limit, 20, 1, 50);
    const offset = intParam(qs.offset, 0, 0, 10_000);
    const rows = await tx(c, (q) => q.query<Record<string, unknown>>(
      'SELECT * FROM rishtey_search($1, $2, $3, $4, $5, $6, $7, $8)',
      [gender, ageMin, ageMax, place(qs.district), place(qs.state), qs.same_gotra === '1' || qs.same_gotra === 'true', limit + 1, offset],
    ));
    const more = rows.length > limit;
    return c.json({ items: rows.slice(0, limit).map(publicShape), next_offset: more ? offset + limit : null });
  });

  app.get('/profiles/:id', async (c) => {
    const id = uuid(c.req.param('id'));
    const [r] = await tx(c, (q) => q.query<Record<string, unknown>>('SELECT * FROM rishtey_get_public($1)', [id]));
    if (!r) throw new ApiError(404, 'not_found');
    return c.json({ profile: publicShape(r) });
  });

  // ---- interests ----
  app.post('/interests', async (c) => {
    const b = await readBody(c);
    const id = uuid(isObj(b) ? b.profile_id : undefined, 'profile_id');
    const [r] = await tx(c, (q) => q.query<{ s: string }>('SELECT rishtey_send_interest($1) AS s', [id]));
    return c.json({ ok: true, status: r!.s }, 201);
  });

  app.get('/interests', async (c) => {
    const box = c.req.query('box') ?? 'received';
    if (box !== 'received' && box !== 'sent') throw bad('box must be received or sent');
    const rows = await tx(c, (q) => q.query<Record<string, unknown> & { id: string; status: string; created_at: string | Date; profile_id: string }>('SELECT * FROM rishtey_interests_list($1)', [box]));
    return c.json({ items: rows.map((r) => ({ id: r.id, status: r.status, created_at: iso(r.created_at), profile: publicShape({ ...r, id: r.profile_id }) })) });
  });

  for (const [action, status] of [['accept', 'accepted'], ['decline', 'declined']] as const) {
    app.post(`/interests/:id/${action}`, async (c) => {
      const id = uuid(c.req.param('id'));
      const rows = await tx(c, async (q) => {
        await q.query('SELECT rishtey_require_approved()');
        return q.query('UPDATE rishtey_interests SET status = $2, responded_at = now() WHERE id = $1 AND to_user = app_user() AND status = $3 RETURNING id', [id, status, 'sent']);
      });
      if (!rows.length) throw new ApiError(404, 'not_found');
      return c.json({ ok: true, status });
    });
  }

  // Contact of someone who accepted (or whose interest I accepted). Anything else: 403 contact_not_allowed.
  app.get('/contact/:profileId', async (c) => {
    const id = uuid(c.req.param('profileId'));
    const [r] = await tx(c, (q) => q.query<{ first_name: string; contact: string }>('SELECT * FROM rishtey_contact($1)', [id]));
    if (!r) throw new ApiError(403, 'contact_not_allowed');
    return c.json({ first_name: r.first_name, contact: r.contact }, 200, { 'cache-control': 'no-store' });
  });

  // ---- safety ----
  app.post('/report', async (c) => {
    const b = await readBody(c);
    if (!isObj(b)) throw bad('body must be a JSON object');
    const id = uuid(b.profile_id, 'profile_id');
    if (!(REPORT_REASONS as readonly unknown[]).includes(b.reason)) throw bad(`reason must be one of ${REPORT_REASONS.join(', ')}`);
    const note = typeof b.note === 'string' ? b.note.trim().slice(0, 500) : null;
    await tx(c, (q) => q.query('SELECT rishtey_report($1, $2, $3)', [id, b.reason, note]));
    return c.json({ ok: true }, 201);
  });

  app.post('/block', async (c) => {
    const b = await readBody(c);
    const id = uuid(isObj(b) ? b.profile_id : undefined, 'profile_id');
    await tx(c, (q) => q.query('SELECT rishtey_block($1)', [id]));
    return c.json({ ok: true }, 201);
  });

  return app;
}
