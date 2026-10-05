import { newId } from './id';
import { entryValuePaise } from './ledger';
import { Entry, PaymentMode } from './types';

export interface SessionEntryInput {
  otherHouseholdId: string;
  cashPaise: number;
  inKindItem?: string;
  inKindValuePaise?: number;
  paymentMode?: PaymentMode;
  voiceNoteUri?: string;
}

export interface SessionTotals {
  cashPaise: number;
  inKindValuePaise: number;
  totalPaise: number;
  giverCount: number;
  entryCount: number;
}

/**
 * Lekhak mode: one phone collects gifts for the host of one event. All entries are AAYA from the
 * host's point of view. The session is a draft buffer: undo removes the last entry before it is
 * handed to persistence (the DB layer stays append-only).
 */
export class EventSession {
  private list: Entry[] = [];

  constructor(
    readonly eventId: string,
    readonly recordedBy: string,
    private readonly opts: { now?: () => string; idGen?: () => string } = {},
  ) {}

  get entries(): readonly Entry[] {
    return this.list;
  }

  add(input: SessionEntryInput): Entry {
    const entry: Entry = {
      id: (this.opts.idGen ?? newId)(),
      eventId: this.eventId,
      otherHouseholdId: input.otherHouseholdId,
      direction: 'AAYA',
      cashPaise: Math.max(0, Math.round(input.cashPaise || 0)),
      inKindItem: input.inKindItem,
      inKindValuePaise: Math.max(0, Math.round(input.inKindValuePaise ?? 0)),
      paymentMode: input.paymentMode ?? 'CASH',
      recordedBy: this.recordedBy,
      voiceNoteUri: input.voiceNoteUri,
      createdAt: (this.opts.now ?? (() => new Date().toISOString()))(),
    };
    this.list.push(entry);
    return entry;
  }

  /** Remove and return the last entry, or undefined if empty. */
  undo(): Entry | undefined {
    return this.list.pop();
  }

  totals(): SessionTotals {
    let cash = 0;
    let kind = 0;
    for (const e of this.list) {
      cash += e.cashPaise;
      kind += e.inKindValuePaise;
    }
    return {
      cashPaise: cash,
      inKindValuePaise: kind,
      totalPaise: this.list.reduce((s, e) => s + entryValuePaise(e), 0),
      giverCount: new Set(this.list.map((e) => e.otherHouseholdId)).size,
      entryCount: this.list.length,
    };
  }
}
