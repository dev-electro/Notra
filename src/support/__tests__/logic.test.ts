import { CATEGORIES, draftProblems, enqueue, expiryLabel, flushQueue, grantActive, grantFromDays, parseGrant, parseQueue, QUEUE_MAX, REVOKE_BODY, SERVER_CATEGORY, grantBody, sendResultForStatus, ticketPayload, type QueuedTicket } from '../logic';

const t = (id: string, createdAt = '2026-10-05T00:00:00.000Z'): QueuedTicket => ({ clientId: id, category: 'bug', subject: 'विषय', message: 'यह एक संदेश है', createdAt, appVersion: '1.0.0' });

describe('support form', () => {
  it('lists what is missing', () => {
    expect(draftProblems({ category: null, subject: '', message: '' })).toEqual(['category', 'subject', 'message']);
    expect(draftProblems({ category: 'bug', subject: 'ऐप अटका', message: 'एंट्री सेव नहीं हुई' })).toEqual([]);
    expect(draftProblems({ category: 'bug', subject: 'ऐप अटका', message: 'छोटा' })).toEqual(['message']);
  });
});

describe('offline queue', () => {
  it('keeps order, caps at 20 and drops entries older than 30 days', () => {
    const now = Date.parse('2026-10-05T00:00:00Z');
    let q: QueuedTicket[] = [];
    for (let i = 0; i < 25; i++) q = enqueue(q, t(`a${i}`), now);
    expect(q).toHaveLength(QUEUE_MAX);
    expect(q[0]!.clientId).toBe('a5');
    const old = enqueue([t('old', '2026-08-01T00:00:00Z')], t('new'), now);
    expect(old.map((x) => x.clientId)).toEqual(['new']);
  });
  it('parses stored JSON defensively', () => {
    expect(parseQueue('garbage')).toEqual([]);
    expect(parseQueue('{"a":1}')).toEqual([]);
    expect(parseQueue(JSON.stringify([t('x'), { bad: 1 }]))).toHaveLength(1);
  });
  it('flush removes sent and dropped, and stops at the first retry', async () => {
    const q = [t('1'), t('2'), t('3'), t('4')];
    const seen: string[] = [];
    const left = await flushQueue(q, async (x) => {
      seen.push(x.clientId);
      return x.clientId === '1' ? 'sent' : x.clientId === '2' ? 'drop' : 'retry';
    });
    expect(seen).toEqual(['1', '2', '3']);
    expect(left.map((x) => x.clientId)).toEqual(['3', '4']);
  });
  it('a throwing sender counts as retry', async () => {
    expect(await flushQueue([t('1')], async () => { throw new Error('offline'); })).toHaveLength(1);
  });
  it('only validation errors are dropped; 404 (no server yet), 401, 429 and 5xx retry', () => {
    expect(sendResultForStatus(422)).toBe('drop');
    for (const s of [401, 404, 429, 500, 503]) expect(sendResultForStatus(s)).toBe('retry');
  });
});

describe('support access grant', () => {
  const now = Date.parse('2026-10-05T00:00:00Z');
  it('computes and checks expiry', () => {
    const g = grantFromDays(3, now);
    expect(Date.parse(g.expiresAt)).toBe(now + 3 * 86_400_000);
    expect(grantActive(g, now + 86_400_000)).toBe(true);
    expect(grantActive(g, now + 3 * 86_400_000)).toBe(false);
    expect(grantActive(null, now)).toBe(false);
    expect(expiryLabel(g).length).toBeGreaterThan(3);
  });
  it('parses server and stored shapes', () => {
    expect(parseGrant({ expires_at: '2026-10-08T00:00:00Z' })).toEqual({ expiresAt: '2026-10-08T00:00:00Z' });
    expect(parseGrant('{"expiresAt":"2026-10-08T00:00:00Z"}')).toEqual({ expiresAt: '2026-10-08T00:00:00Z' });
    for (const bad of [null, '', {}, { expires_at: 'x' }, 7]) expect(parseGrant(bad)).toBeNull();
  });
});

describe('server contract', () => {
  it('maps the ticket to body + the server category names', () => {
    const p = ticketPayload({ ...t('a'), category: 'complaint' });
    expect(p).toEqual({ client_id: 'a', category: 'grievance', subject: 'विषय', body: 'यह एक संदेश है', app_version: '1.0.0', created_at: '2026-10-05T00:00:00.000Z' });
    expect(p).not.toHaveProperty('message');
    expect(SERVER_CATEGORY).toEqual({ complaint: 'grievance', bug: 'bug', suggestion: 'feedback', delete_account: 'deletion', other: 'other' });
    for (const c of CATEGORIES) expect(['grievance', 'bug', 'feedback', 'deletion', 'other']).toContain(SERVER_CATEGORY[c.id]);
  });

  it('grant and revoke bodies use action + hours (7 days = 168 hours max)', () => {
    expect(grantBody(1)).toEqual({ action: 'grant', hours: 24 });
    expect(grantBody(7)).toEqual({ action: 'grant', hours: 168 });
    expect(REVOKE_BODY).toEqual({ action: 'revoke' });
  });
});
