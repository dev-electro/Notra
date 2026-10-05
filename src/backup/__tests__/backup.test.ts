import { addE, memDb } from '../../db/mem-db.testutil';
import { randomBytes } from 'node:crypto';
import { DEFAULT_LEDGER_ID as L, hashPin, totals } from '../../core';
import { createLedger, listLedgers } from '../../db/ledgers';
import { migrate } from '../../db/migrations';
import { sqlTotals } from '../../db/queries';
import {
  correctEntry, createEvent, createHousehold, getIncrement, getMyHouseholdId, listEntries, listEvents, listHouseholds,
  setIncrement, setMyHouseholdId, updateHousehold, voidEntry,
} from '../../db/repository';
import type { Db } from '../../db/types';
import {
  backupFileName, BackupError, createBackup, decryptBackup, encryptBackup, fromBase64, mergeSnapshot, parseSnapshot, restoreBackup,
  toBase64, type Kdf,
} from '../index';

const rand = (n: number) => new Uint8Array(randomBytes(n));
const deps = { randomBytes: rand };
const FAST: Kdf = { N: 2 ** 10, r: 8, p: 1 }; // the real parameters are exercised once, below
const hh = (n: string) => ({ headName: n, fatherName: 'कालू', jati: 'भील', atak: 'डामोर', village: 'सरवन', fala: 'ऊपला' });
const base = { inKindValuePaise: 0, paymentMode: 'CASH' as const, recordedBy: 'me' };
const PW = 'मेरा-पासवर्ड-123';

async function phone(): Promise<Db> {
  const db = memDb();
  await migrate(db);
  return db;
}

async function seed(db: Db) {
  const me = await createHousehold(db, hh('मैं'));
  await setMyHouseholdId(db, me.id);
  await setIncrement(db, { type: 'FIXED', rupees: 101 });
  const a = await createHousehold(db, { ...hh('रमेश'), photoUri: 'file:///secret.jpg', phone: '9876543210' });
  const sita = await createLedger(db, 'सीता', hashPin('4321', new Uint8Array(16).fill(1)));
  const ev = await createEvent(db, { hostHouseholdId: me.id, occasion: 'SHAADI', date: '2026-11-21', panchApproved: true, invitationType: 'KUMKUM', status: 'HELD' });
  const e1 = await addE(db, { ...base, otherHouseholdId: a.id, direction: 'AAYA', cashPaise: 50100, eventId: ev.id, inKindItem: 'घी', createdAt: '2026-01-01T00:00:01.000Z' });
  await correctEntry(db, e1, { cashPaise: 60100, createdAt: '2026-01-01T00:00:02.000Z' });
  const e3 = await addE(db, { ...base, otherHouseholdId: a.id, direction: 'GAYA', cashPaise: 10100, createdAt: '2026-01-01T00:00:03.000Z' });
  await voidEntry(db, e3, '2026-01-01T00:00:04.000Z');
  const evS = await createEvent(db, { hostHouseholdId: me.id, occasion: 'MUNDAN', date: '2026-02-01', panchApproved: false, invitationType: 'CARD', status: 'HELD', ledgerId: sita.id });
  await addE(db, { ...base, otherHouseholdId: a.id, direction: 'AAYA', cashPaise: 7100, ledgerId: sita.id, eventId: evS.id, createdAt: '2026-01-01T00:00:05.000Z' });
  return { me, a, sita, ev };
}

describe('encrypted file', () => {
  it('round-trips text (Hindi included) with the production scrypt parameters', async () => {
    const text = JSON.stringify({ नाम: 'रमेश', n: [1, 2, 3] });
    const file = await encryptBackup(text, PW, deps);
    expect(JSON.parse(file)).toMatchObject({ format: 'notra-backup', v: 1, kdf: 'scrypt', N: 32768, r: 8, p: 1, cipher: 'xchacha20poly1305' });
    expect(file).not.toContain('रमेश');
    expect(await decryptBackup(file, PW)).toBe(text);
  }, 30_000);

  it('a wrong password fails (never garbage), as does an empty or near-miss password', async () => {
    const file = await encryptBackup('secret', PW, deps, FAST);
    for (const bad of ['', PW + ' ', PW.slice(1), 'x']) {
      await expect(decryptBackup(file, bad)).rejects.toMatchObject({ code: 'wrong_password_or_damaged' });
    }
    expect(await decryptBackup(file, PW)).toBe('secret');
  });

  it('every kind of tampering is detected: ciphertext, header parameters, salt, nonce', async () => {
    const file = JSON.parse(await encryptBackup('secret data that is long enough', PW, deps, FAST));
    const flip = (b64: string, i = 0) => {
      const b = fromBase64(b64);
      b[i] = b[i]! ^ 1;
      return toBase64(b);
    };
    const variants: Record<string, object> = {
      ct: { ct: flip(file.ct) },
      'ct tail (tag)': { ct: flip(file.ct, fromBase64(file.ct).length - 1) },
      salt: { salt: flip(file.salt) },
      nonce: { nonce: flip(file.nonce) },
      'kdf r': { r: 4 },
      'kdf N': { N: 2 ** 11 },
    };
    for (const [name, patch] of Object.entries(variants)) {
      await expect(decryptBackup(JSON.stringify({ ...file, ...patch }), PW)).rejects.toMatchObject({ code: 'wrong_password_or_damaged' });
      void name;
    }
    // truncated ciphertext
    await expect(decryptBackup(JSON.stringify({ ...file, ct: toBase64(fromBase64(file.ct).slice(0, 10)) }), PW)).rejects.toBeInstanceOf(BackupError);
  });

  it('rejects files that are not backups, are from the future, or ask for absurd KDF cost', async () => {
    const file = JSON.parse(await encryptBackup('x', PW, deps, FAST));
    await expect(decryptBackup('not json', PW)).rejects.toMatchObject({ code: 'not_a_backup' });
    await expect(decryptBackup('{"hello":1}', PW)).rejects.toMatchObject({ code: 'not_a_backup' });
    await expect(decryptBackup('[]', PW)).rejects.toMatchObject({ code: 'not_a_backup' });
    await expect(decryptBackup(JSON.stringify({ ...file, v: 2 }), PW)).rejects.toMatchObject({ code: 'unsupported' });
    await expect(decryptBackup(JSON.stringify({ ...file, cipher: 'aes' }), PW)).rejects.toMatchObject({ code: 'unsupported' });
    await expect(decryptBackup(JSON.stringify({ ...file, N: 2 ** 30 }), PW)).rejects.toMatchObject({ code: 'unsupported' }); // would eat all memory
    await expect(decryptBackup(JSON.stringify({ ...file, N: 3000 }), PW)).rejects.toMatchObject({ code: 'unsupported' });
    await expect(decryptBackup(JSON.stringify({ ...file, salt: 'AAAA' }), PW)).rejects.toMatchObject({ code: 'not_a_backup' });
    await expect(decryptBackup(JSON.stringify({ ...file, ct: '%%%%' }), PW)).rejects.toMatchObject({ code: 'not_a_backup' });
  });

  it('uses a fresh salt and nonce each time, and refuses short passwords', async () => {
    const a = JSON.parse(await encryptBackup('same', PW, deps, FAST));
    const b = JSON.parse(await encryptBackup('same', PW, deps, FAST));
    expect(a.salt).not.toBe(b.salt);
    expect(a.nonce).not.toBe(b.nonce);
    expect(a.ct).not.toBe(b.ct);
    await expect(encryptBackup('x', '12345', deps, FAST)).rejects.toThrow();
  });

  it('base64 helper round-trips every length and rejects junk', () => {
    for (let n = 0; n < 40; n++) {
      const b = rand(n);
      expect(Array.from(fromBase64(toBase64(b)))).toEqual(Array.from(b));
    }
    expect(toBase64(new TextEncoder().encode('Man'))).toBe('TWFu');
    expect(() => fromBase64('abc')).toThrow();
    expect(() => fromBase64('ab=c')).toThrow();
  });
});

describe('snapshot round trip', () => {
  // Backups are created with the cheap KDF here by decrypting through the same path; createBackup uses production params.
  const roundTrip = async (src: Db, unlocked = new Set<string>()) => {
    const made = await createBackup(src, PW, unlocked, deps);
    return made;
  };

  it('backup -> restore on an empty phone reproduces every ledger, total and setting', async () => {
    const src = await phone();
    const { sita } = await seed(src);
    await clearPin(src, sita.id); // no PIN: included without unlocking
    const made = await roundTrip(src);
    expect(made.skippedLedgers).toEqual([]);

    const dst = await phone();
    const rep = await restoreBackup(dst, made.file, PW);
    expect(rep.entries).toMatchObject({ added: 5, same: 0 });
    expect(rep.skipped).toBe(0);
    expect(rep.profileApplied).toBe(true);
    expect(await listEntries(dst, L)).toEqual(await listEntries(src, L));
    expect(await listEntries(dst, sita.id)).toEqual(await listEntries(src, sita.id));
    expect(await sqlTotals(dst, L)).toEqual(await sqlTotals(src, L));
    expect(await sqlTotals(dst, sita.id)).toEqual({ receivedPaise: 7100, givenPaise: 0 });
    expect(totals(await listEntries(dst, L))).toEqual(await sqlTotals(dst, L));
    expect((await listLedgers(dst)).map((l) => l.name)).toEqual(['घर का खाता', 'सीता']);
    expect((await listEvents(dst, L)).filter((e) => e.occasion === 'SHAADI').map((e) => e.date)).toEqual(['2026-11-21']);
    expect(await getMyHouseholdId(dst)).toBe(await getMyHouseholdId(src));
    expect(await getIncrement(dst)).toEqual({ type: 'FIXED', rupees: 101 });
    // restored rows are marked for cloud sync
    expect((await dst.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM entries WHERE dirty = 0', []))!.n).toBe(0);
  }, 30_000);

  it('never exports PINs, hashes, photos; PIN-protected ledgers need to be unlocked in this session', async () => {
    const src = await phone();
    const { sita } = await seed(src);
    const locked = await roundTrip(src);
    expect(locked.skippedLedgers).toEqual(['सीता']);
    expect(locked.entryCount).toBe(4);
    const text = await decryptBackup(locked.file, PW);
    expect(text).not.toContain('pbkdf2');
    expect(text).not.toContain('pin');
    expect(text).not.toContain('secret.jpg');
    expect(text).not.toContain('सीता');
    const open = await roundTrip(src, new Set([sita.id]));
    expect(open.skippedLedgers).toEqual([]);
    expect(open.entryCount).toBe(5);
    const dst = await phone();
    await restoreBackup(dst, open.file, PW);
    expect((await listLedgers(dst)).find((l) => l.id === sita.id)).toMatchObject({ name: 'सीता', hasPin: false });
  }, 30_000);

  it('restoring twice, or onto a phone that already has the data, adds nothing (entries insert-or-ignore)', async () => {
    const src = await phone();
    await seed(src);
    const { file } = await roundTrip(src, new Set((await listLedgers(src)).map((l) => l.id)));
    const dst = await phone();
    await restoreBackup(dst, file, PW);
    const again = await restoreBackup(dst, file, PW);
    expect(again.entries).toEqual({ added: 0, updated: 0, same: 5 });
    expect(again.households.added).toBe(0);
    expect(await listEntries(dst, L)).toHaveLength(4);
    const onSelf = await restoreBackup(src, file, PW);
    expect(onSelf.entries).toMatchObject({ added: 0, same: 5 });
  }, 30_000);

  it('merges: other phone\'s entries are added, newer family edits win, older ones do not, a local-only entry survives', async () => {
    const a = await phone();
    const { a: fam } = await seed(a);
    const { file } = await roundTrip(a, new Set((await listLedgers(a)).map((l) => l.id)));

    const b = await phone();
    await restoreBackup(b, file, PW);
    // b edits the family later and records a new entry
    await new Promise((r) => setTimeout(r, 5));
    await updateHousehold(b, { ...(await listHouseholds(b)).find((h) => h.id === fam.id)!, village: 'खेरवाड़ा' });
    const local = await addE(b, { ...base, otherHouseholdId: fam.id, direction: 'GAYA', cashPaise: 999 });
    // b restores a's (older) backup again: its newer edit and its own entry are untouched
    const rep = await restoreBackup(b, file, PW);
    expect(rep.households.same).toBeGreaterThan(0);
    expect((await listHouseholds(b)).find((h) => h.id === fam.id)!.village).toBe('खेरवाड़ा');
    expect((await listEntries(b, L)).some((e) => e.id === local.id)).toBe(true);

    // a restores b's backup: gets b's entry and b's newer village
    const back = await createBackup(b, PW, new Set((await listLedgers(b)).map((l) => l.id)), deps);
    const rep2 = await restoreBackup(a, back.file, PW);
    expect(rep2.entries.added).toBe(1);
    expect(rep2.households.updated).toBe(1);
    expect((await listHouseholds(a)).find((h) => h.id === fam.id)!.village).toBe('खेरवाड़ा');
    expect((await listEntries(a, L)).some((e) => e.id === local.id)).toBe(true);
  }, 60_000);

  it('a wrong password restores nothing at all', async () => {
    const src = await phone();
    await seed(src);
    const { file } = await roundTrip(src);
    const dst = await phone();
    await expect(restoreBackup(dst, file, 'wrong-password')).rejects.toMatchObject({ code: 'wrong_password_or_damaged' });
    expect(await listHouseholds(dst)).toHaveLength(0);
    expect(await listEntries(dst, L)).toHaveLength(0);
  }, 30_000);

  it('a tampered file restores nothing', async () => {
    const src = await phone();
    await seed(src);
    const { file } = await roundTrip(src);
    const j = JSON.parse(file);
    const ct = fromBase64(j.ct);
    ct[ct.length >> 1] = ct[ct.length >> 1]! ^ 0xff;
    const dst = await phone();
    await expect(restoreBackup(dst, JSON.stringify({ ...j, ct: toBase64(ct) }), PW)).rejects.toMatchObject({ code: 'wrong_password_or_damaged' });
    expect(await listEntries(dst, L)).toHaveLength(0);
  }, 30_000);
});

describe('snapshot validation', () => {
  const snap = (over: object = {}) => JSON.stringify({ app: 'notra-diary', version: 1, exportedAt: 'x', ledgers: [], households: [], events: [], entries: [], profile: null, ...over });
  const good = { id: 'h1', headName: 'रमेश', fatherName: '', jati: '', atak: '', village: '', fala: '', phone: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
  const ent = { id: 'e1', eventId: null, otherHouseholdId: 'h1', direction: 'AAYA', cashPaise: 100, inKindItem: null, inKindValuePaise: 0, paymentMode: 'CASH', recordedBy: 'me', createdAt: '2026-01-01T00:00:00.000Z', correctsEntryId: null, isVoid: false, ledgerId: L };

  it('refuses files that are not snapshots', () => {
    for (const t of ['nope', '[]', '{}', snap({ app: 'other' }), snap({ version: 2 }), snap({ entries: 'x' })]) {
      expect(() => parseSnapshot(t)).toThrow(BackupError);
    }
  });

  it('drops malformed rows and counts them instead of importing them', () => {
    const bad = [
      { ...ent, id: 'e2', cashPaise: -1 }, { ...ent, id: 'e3', direction: 'X' }, { ...ent, id: 'e4', cashPaise: 1.5 },
      { ...ent, id: 'bad id!' }, { ...ent, id: 'e5', isVoid: true }, { ...ent, id: 'e6', inKindItem: 'a\u0000b' }, { ...ent, id: 'e7', paymentMode: 'BTC' },
    ];
    const r = parseSnapshot(snap({ households: [good, { ...good, id: 'h2', headName: 5 }], entries: [ent, ...bad] }));
    expect(r.snapshot.entries.map((e) => e.id)).toEqual(['e1']);
    expect(r.snapshot.households.map((h) => h.id)).toEqual(['h1']);
    expect(r.invalid).toBe(bad.length + 1);
  });

  it('skips entries that point at a family or ledger that is nowhere to be found, and never touches existing PINs', async () => {
    const db = await phone();
    const sita = await createLedger(db, 'सीता', hashPin('1234', new Uint8Array(16).fill(2)));
    const parsed = parseSnapshot(snap({
      households: [good],
      ledgers: [{ id: sita.id, name: 'सीता देवी', kind: 'PERSONAL', createdAt: sita.createdAt, updatedAt: '2999-01-01T00:00:00.000Z' }],
      entries: [ent, { ...ent, id: 'e2', otherHouseholdId: 'ghost' }, { ...ent, id: 'e3', ledgerId: 'ghost-ledger' }],
    }));
    const rep = await mergeSnapshot(db, parsed);
    expect(rep.entries.added).toBe(1);
    expect(rep.skipped).toBe(2);
    const l = (await listLedgers(db)).find((x) => x.id === sita.id)!;
    expect(l).toMatchObject({ name: 'सीता देवी', hasPin: true });
    expect((await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM entries WHERE id IN ('e2','e3')", []))!.n).toBe(0);
    expect((await db.getFirstAsync<{ foreign_keys: number }>('PRAGMA foreign_keys', []))!.foreign_keys).toBe(1);
  });

  it('names the file by date', () => {
    expect(backupFileName(new Date('2026-10-05T10:00:00Z'))).toBe('notra-backup-2026-10-05.notra');
  });
});

async function clearPin(db: Db, id: string) {
  await db.runAsync('UPDATE ledgers SET pin_hash = NULL WHERE id = ?', [id]);
}
