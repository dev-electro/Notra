import { BIODATA_KEY, EMPTY_BIODATA, parseBiodata, serializeBiodata } from '../../core';
import { migrate } from '../migrations';
import { memDb } from '../mem-db.testutil';
import { getSetting, setSetting } from '../repository';

/** रिश्ते biodata and इनाम counters live in the existing encrypted settings table (no new migration). */
describe('local feature storage in settings', () => {
  it('biodata round-trips through the real settings table and is replaced in place', async () => {
    const db = memDb();
    await migrate(db);
    expect(parseBiodata(await getSetting(db, BIODATA_KEY))).toBeNull();
    await setSetting(db, BIODATA_KEY, serializeBiodata({ ...EMPTY_BIODATA, name: 'राहुल', contact: '98765' }));
    await setSetting(db, BIODATA_KEY, serializeBiodata({ ...EMPTY_BIODATA, name: 'राहुल मीणा' }));
    expect(parseBiodata(await getSetting(db, BIODATA_KEY))).toMatchObject({ name: 'राहुल मीणा', contact: '' });
    const rows = await db.getAllAsync<{ n: number }>('SELECT COUNT(*) AS n FROM settings WHERE key = ?', [BIODATA_KEY]);
    expect(rows[0].n).toBe(1);
  });
});
