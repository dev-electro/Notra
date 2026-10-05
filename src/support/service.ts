/** Support tickets (offline queue) and consented support access, over the app's api client. Every failure becomes a Hindi message. */
import { getAuthUser } from '@/auth/session';
import { getDb } from '@/db/database';
import { getSetting, setSetting } from '@/db/repository';
import type { Db } from '@/db/types';
import { appVersion } from '@/remote/device';
import { HttpError, SuspendedError } from '@/sync/http';
import { api } from '@/sync/runtime';
import {
  enqueue, flushQueue, grantFromDays, parseGrant, parseQueue, sendResultForStatus, type AccessDays, type AccessGrant, type QueuedTicket, type SendResult, type SupportDraft,
} from './logic';

const QUEUE_KEY = 'support_queue_v1';
const GRANT_KEY = 'support_access_v1';
const dbOf = async () => (await getDb()) as unknown as Db;
export const SOON_HI = 'यह सुविधा जल्द आएगी';

async function send(t: QueuedTicket): Promise<SendResult> {
  try {
    await api.request('POST', '/v1/support', {
      auth: true,
      body: { client_id: t.clientId, category: t.category, subject: t.subject, message: t.message, app_version: t.appVersion, created_at: t.createdAt },
    });
    return 'sent';
  } catch (e) {
    return e instanceof HttpError ? sendResultForStatus(e.status) : 'retry';
  }
}

/** Send what is waiting. Returns how many are still queued. Silent when offline or signed out. */
export async function flushSupport(): Promise<number> {
  const db = await dbOf();
  const q = parseQueue(await getSetting(db, QUEUE_KEY));
  if (!q.length || !(await getAuthUser())) return q.length;
  const left = await flushQueue(q, send);
  if (left.length !== q.length) await setSetting(db, QUEUE_KEY, JSON.stringify(left));
  return left.length;
}

/** Save the ticket, then try to send it now. 'sent' or 'queued' (it will go when the internet is back). Needs a signed-in account. */
export async function submitSupport(d: SupportDraft): Promise<'sent' | 'queued'> {
  if (!d.category || !(await getAuthUser())) throw new Error('not-ready');
  const db = await dbOf();
  const t: QueuedTicket = {
    clientId: `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`,
    category: d.category,
    subject: d.subject.trim(),
    message: d.message.trim(),
    createdAt: new Date().toISOString(),
    appVersion: appVersion(),
  };
  await setSetting(db, QUEUE_KEY, JSON.stringify(enqueue(parseQueue(await getSetting(db, QUEUE_KEY)), t, Date.now())));
  return (await flushSupport()) === 0 ? 'sent' : 'queued';
}

export const pendingSupport = async () => parseQueue(await getSetting(await dbOf(), QUEUE_KEY)).length;

// ---------- consented access ----------
export async function getAccessGrant(): Promise<AccessGrant | null> {
  const db = await dbOf();
  const local = parseGrant(await getSetting(db, GRANT_KEY));
  try {
    const r = await api.request<unknown>('GET', '/v1/support/access', { auth: true });
    const remote = parseGrant(r);
    await setSetting(db, GRANT_KEY, remote ? JSON.stringify(remote) : '');
    return remote;
  } catch {
    return local; // offline or the endpoint is not there yet
  }
}

/** Throws an Error whose message is plain Hindi. */
export function accessErrorMessage(e: unknown): string {
  if (e instanceof SuspendedError) return e.messageHi;
  if (e instanceof HttpError && e.status === 404) return SOON_HI;
  if (e instanceof HttpError && e.status === 401) return 'पहले साइन इन करें';
  return 'इंटरनेट नहीं है, दोबारा कोशिश करें';
}

export async function grantAccess(days: AccessDays): Promise<AccessGrant> {
  const r = await api.request<unknown>('POST', '/v1/support/access', { auth: true, body: { days } });
  const g = parseGrant(r) ?? grantFromDays(days, Date.now());
  await setSetting(await dbOf(), GRANT_KEY, JSON.stringify(g));
  return g;
}

export async function revokeAccess(): Promise<void> {
  await api.request('DELETE', '/v1/support/access', { auth: true });
  await setSetting(await dbOf(), GRANT_KEY, '');
}
