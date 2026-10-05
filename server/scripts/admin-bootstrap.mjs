// Make the first owner:  npm run admin:bootstrap -- 9876543210      (mobile number)
//                        npm run admin:bootstrap -- owner@gmail.com  (e-mail the person signs in to Google with)
// Run it with the OWNER database role (MIGRATION_DATABASE_URL, falling back to DATABASE_URL): the runtime role is not allowed to
// change roles. A phone number that has not signed in yet gets an empty account created for it, so the first OTP sign-in lands on
// it. An e-mail must already belong to an account (sign in to the app / admin panel with Google once, then run this).
import postgres from 'postgres';

const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
const arg = (process.argv[2] ?? '').trim();
if (!url || !arg) {
  console.error('Usage: MIGRATION_DATABASE_URL=... npm run admin:bootstrap -- <10-digit mobile | email>');
  process.exit(1);
}
const sql = postgres(url, { max: 1, onnotice: () => {} });
try {
  let userId;
  let label;
  if (arg.includes('@')) {
    const email = arg.toLowerCase();
    const [u] = await sql`SELECT id FROM users WHERE lower(email) = ${email}`;
    if (!u) throw new Error(`No account has the e-mail ${email}. Sign in with that Google account once, then run this again.`);
    userId = u.id;
    label = email;
  } else {
    const digits = arg.replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');
    if (!/^[6-9]\d{9}$/.test(digits)) throw new Error('That is not a valid 10-digit Indian mobile number.');
    const phone = `+91${digits}`;
    await sql`INSERT INTO users (id, phone_e164, signup_method) VALUES (gen_random_uuid(), ${phone}, 'phone') ON CONFLICT (phone_e164) DO NOTHING`;
    const [u] = await sql`SELECT id FROM users WHERE phone_e164 = ${phone}`;
    userId = u.id;
    label = `+91 ${digits.slice(0, 2)}*****${digits.slice(-3)}`;
  }
  await sql.begin(async (tx) => {
    // server_seq 0 keeps this role-only row out of the app's sync pull
    await tx`INSERT INTO profiles (user_id, updated_at, server_seq, role) VALUES (${userId}, '1970-01-01T00:00:00.000Z', 0, 'owner')
             ON CONFLICT (user_id) DO UPDATE SET role = 'owner'`;
    await tx`INSERT INTO admin_audit_log (admin_label, action, target_type, target_id, reason, after_meta)
             VALUES ('bootstrap script', 'staff.bootstrap', 'user', ${userId}, 'first owner via admin:bootstrap', ${JSON.stringify({ role: 'owner' })}::jsonb)`;
  });
  console.log(`${label} is now an owner (user ${userId}). Sign in to the admin panel with the same Google account / mobile number.`);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await sql.end();
}
