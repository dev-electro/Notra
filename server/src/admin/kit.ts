import type { Context, Hono } from 'hono';
import type { Deps } from '../app';
import type { Queryable } from '../db';
import { ApiError } from '../errors';
import { rank, type AdminDeps, type AdminIdentity, type Role } from './auth';
import { stripForbidden } from './privacy';

export type AdminVars = { Variables: { admin: AdminIdentity; q: Queryable } };
export type AdminContext = Context<AdminVars>;
export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** Everything a route handler needs. */
export interface Env {
  deps: Deps;
  admin: AdminDeps;
  now: () => Date;
}

export interface RouteInfo {
  method: Method;
  /** Path relative to /admin/api, with :params. */
  path: string;
  min: Role;
  /** True for anything that changes state (POST/PUT/PATCH/DELETE). Each must write an audit row. */
  mutating: boolean;
}

export type Handler = (c: AdminContext) => Promise<Response>;

/** Registers a route and remembers it, so tests can walk every endpoint (role gates, audit, privacy scan). */
export class Registry {
  readonly routes: RouteInfo[] = [];
  constructor(private readonly app: Hono<AdminVars>) {}
  private add(method: Method, path: string, min: Role, handler: Handler) {
    this.routes.push({ method, path, min, mutating: method !== 'GET' });
    const gate = async (c: AdminContext): Promise<Response> => {
      const me = c.get('admin');
      if (rank(me.role) < rank(min)) throw new ApiError(403, 'forbidden', { required: min });
      return handler(c);
    };
    this.app.on(method, path, gate);
  }
  get = (path: string, min: Role, h: Handler) => this.add('GET', path, min, h);
  post = (path: string, min: Role, h: Handler) => this.add('POST', path, min, h);
  put = (path: string, min: Role, h: Handler) => this.add('PUT', path, min, h);
  patch = (path: string, min: Role, h: Handler) => this.add('PATCH', path, min, h);
  delete = (path: string, min: Role, h: Handler) => this.add('DELETE', path, min, h);
}

const MAX_BODY = 100_000;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export async function readBody(c: AdminContext, optional = false): Promise<Record<string, unknown>> {
  const text = await c.req.text();
  if (text.length > MAX_BODY) throw new ApiError(413, 'too_large');
  if (!text.trim()) {
    if (optional) return {};
    throw new ApiError(400, 'invalid_json');
  }
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    throw new ApiError(400, 'invalid_json');
  }
  if (!isObj(v)) throw new ApiError(400, 'invalid_input', { detail: 'body must be a JSON object' });
  return v;
}

export function reasonOf(b: Record<string, unknown>, required = true): string | null {
  const r = typeof b.reason === 'string' ? b.reason.trim() : '';
  if (required && r.length < 5) throw new ApiError(400, 'reason_required', { detail: 'A reason of at least 5 characters is required.' });
  if (r.length > 500) throw new ApiError(400, 'invalid_input', { detail: 'reason is too long' });
  return r || null;
}

export function str(b: Record<string, unknown>, k: string, o: { min?: number; max: number; optional?: boolean }): string | undefined {
  const v = b[k];
  if (v === undefined || v === null || v === '') {
    if (o.optional) return undefined;
    throw new ApiError(400, 'invalid_input', { detail: `${k} is required` });
  }
  if (typeof v !== 'string') throw new ApiError(400, 'invalid_input', { detail: `${k} must be text` });
  const s = v.trim();
  if (s.length < (o.min ?? 1) || s.length > o.max) throw new ApiError(400, 'invalid_input', { detail: `${k} must be ${o.min ?? 1} to ${o.max} characters` });
  return s;
}

export function oneOf<T extends string>(v: unknown, allowed: readonly T[], name: string): T {
  if (typeof v !== 'string' || !(allowed as readonly string[]).includes(v)) {
    throw new ApiError(400, 'invalid_input', { detail: `${name} must be one of ${allowed.join(', ')}` });
  }
  return v as T;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function uuidParam(c: AdminContext, name: string): string {
  const v = c.req.param(name) ?? '';
  if (!UUID_RE.test(v)) throw new ApiError(400, 'invalid_id');
  return v.toLowerCase();
}

export const clientIp = (c: AdminContext): string => c.req.header('cf-connecting-ip') ?? 'unknown';

export interface Page {
  page: number;
  size: number;
  offset: number;
}
export function pageOf(c: AdminContext, defaultSize = 25): Page {
  const page = Math.max(1, Math.min(10_000, Number.parseInt(c.req.query('page') ?? '1', 10) || 1));
  const size = Math.max(1, Math.min(100, Number.parseInt(c.req.query('page_size') ?? String(defaultSize), 10) || defaultSize));
  return { page, size, offset: (page - 1) * size };
}

export const iso = (v: unknown): string | null => (v === null || v === undefined ? null : new Date(v as string).toISOString());

/** ISO date (YYYY-MM-DD) query parameter, validated. */
export function dateParam(c: AdminContext, name: string): string | undefined {
  const v = c.req.query(name);
  if (!v) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) throw new ApiError(400, 'invalid_input', { detail: `${name} must be YYYY-MM-DD` });
  return v;
}

/** Append one row to the audit log (inside the caller's transaction when `q` is a tx). Metadata is stripped of ledger fields. */
export async function audit(
  c: AdminContext,
  a: { action: string; targetType?: string; targetId?: string; reason?: string | null; before?: unknown; after?: unknown },
): Promise<void> {
  const me = c.get('admin');
  const q = c.get('q');
  const j = (v: unknown) => (v === undefined || v === null ? null : JSON.stringify(stripForbidden(v)));
  await q.query(
    `INSERT INTO admin_audit_log (admin_user_id, admin_label, admin_role, action, target_type, target_id, reason, ip, before_meta, after_meta)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::text::jsonb, $10::text::jsonb)`,
    [me.id, me.label, me.role, a.action, a.targetType ?? null, a.targetId ?? null, a.reason ?? null, clientIp(c), j(a.before), j(a.after)],
  );
}

export const parseJsonb = <T = unknown>(v: unknown): T | null => (v === null || v === undefined ? null : (JSON.parse(String(v)) as T));
