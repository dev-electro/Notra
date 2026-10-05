import { BATCH, type Transport } from './engine';
import type { Batch, PullPage, PushResult, Rejection, WireProfile } from './wire';

type Row<K extends keyof Batch> = NonNullable<Batch[K]> extends (infer R)[] ? R : never;

/** In-memory stand-in for the server: same rules (LWW for ledgers/households/events/profile, immutable entries, global sequence). */
export class FakeServer implements Transport {
  seq = 0;
  ls = new Map<string, { row: Row<'ledgers'>; seq: number }>();
  hs = new Map<string, { row: Row<'households'>; seq: number }>();
  evs = new Map<string, { row: Row<'events'>; seq: number }>();
  ens = new Map<string, { row: Row<'entries'>; seq: number }>();
  profile: { row: WireProfile; seq: number } | null = null;
  pushes: Batch[] = [];
  pulls: number[] = [];
  pageLimit = BATCH;
  failPush = false;
  failPull = false;
  onPush?: () => Promise<void>;
  /** Return a reason to reject a row like the real server does for invalid data. */
  reject?: (table: Rejection['table'], row: { id: string }) => string | null;

  async push(b: Batch): Promise<PushResult> {
    if (this.failPush) throw new Error('offline');
    this.pushes.push(b);
    await this.onPush?.();
    const rejected: Rejection[] = [];
    const bad = (table: Rejection['table'], row: { id: string }, index: number) => {
      const reason = this.reject?.(table, row) ?? null;
      if (reason) rejected.push({ table, id: row.id, index, reason });
      return reason !== null;
    };
    b.ledgers.forEach((r, i) => {
      if (bad('ledgers', r, i)) return;
      if (!this.ls.has(r.id) || r.updatedAt > this.ls.get(r.id)!.row.updatedAt) this.ls.set(r.id, { row: r, seq: ++this.seq });
    });
    b.households.forEach((r, i) => {
      if (bad('households', r, i)) return;
      if (!this.hs.has(r.id) || r.updatedAt > this.hs.get(r.id)!.row.updatedAt) this.hs.set(r.id, { row: r, seq: ++this.seq });
    });
    b.events.forEach((r, i) => {
      if (bad('events', r, i)) return;
      if (!this.evs.has(r.id) || r.updatedAt > this.evs.get(r.id)!.row.updatedAt) this.evs.set(r.id, { row: r, seq: ++this.seq });
    });
    b.entries.forEach((r, i) => {
      if (bad('entries', r, i)) return;
      if (!this.ens.has(r.id)) this.ens.set(r.id, { row: r, seq: ++this.seq });
    });
    if (b.profile && (!this.profile || b.profile.updatedAt > this.profile.row.updatedAt)) this.profile = { row: b.profile, seq: ++this.seq };
    return { rejected };
  }

  async pull(since: number, limit: number): Promise<PullPage> {
    if (this.failPull) throw new Error('offline');
    this.pulls.push(since);
    const all = [
      ...[...this.ls.values()].map((x) => ({ k: 'l', ...x })),
      ...[...this.hs.values()].map((x) => ({ k: 'h', ...x })),
      ...[...this.evs.values()].map((x) => ({ k: 'e', ...x })),
      ...[...this.ens.values()].map((x) => ({ k: 'n', ...x })),
      ...(this.profile ? [{ k: 'p', ...this.profile }] : []),
    ].filter((x) => x.seq > since).sort((a, b) => a.seq - b.seq);
    const take = Math.min(limit, this.pageLimit);
    const page = all.slice(0, take);
    return {
      ledgers: page.filter((x) => x.k === 'l').map((x) => x.row as Row<'ledgers'>),
      households: page.filter((x) => x.k === 'h').map((x) => x.row as Row<'households'>),
      events: page.filter((x) => x.k === 'e').map((x) => x.row as Row<'events'>),
      entries: page.filter((x) => x.k === 'n').map((x) => x.row as Row<'entries'>),
      profile: (page.find((x) => x.k === 'p')?.row as WireProfile | undefined) ?? null,
      nextCursor: page.length ? page[page.length - 1]!.seq : since,
      hasMore: all.length > take,
    };
  }
}
