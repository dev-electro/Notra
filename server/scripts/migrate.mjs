// Applies server/migrations/*.sql (in name order) to DATABASE_URL. Each file runs once, in a transaction.
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

// Migrations run as the table OWNER (MIGRATION_DATABASE_URL). The Worker's DATABASE_URL is a different, restricted role (RLS applies to it).
const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error('MIGRATION_DATABASE_URL (or DATABASE_URL) is not set');
  process.exit(1);
}
const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
const sql = postgres(url, { max: 1, onnotice: () => {} });
try {
  await sql`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;
  const done = new Set((await sql`SELECT name FROM schema_migrations`).map((r) => r.name));
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    if (done.has(f)) continue;
    const text = await readFile(join(dir, f), 'utf8');
    await sql.begin(async (tx) => {
      await tx.unsafe(text);
      await tx`INSERT INTO schema_migrations (name) VALUES (${f})`;
    });
    console.log(`applied ${f}`);
  }
  console.log('migrations up to date');
} finally {
  await sql.end();
}
