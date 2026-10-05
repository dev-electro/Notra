import { CONFIG_DEFAULTS, InvalidConfig, isConfigKey, loadConfig, setConfig } from '../appconfig';
import { ApiError } from '../errors';
import { audit, iso, pageOf, parseJsonb, readBody, reasonOf, type Env, type Registry } from './kit';

export function configRoutes(r: Registry, _env: Env): void {
  r.get('/config', 'viewer', async (c) => {
    const items = await loadConfig(c.get('q'));
    return c.json({ items: items.map((e) => ({ ...e, default: CONFIG_DEFAULTS[e.key] })) });
  });

  r.put('/config/:key', 'admin', async (c) => {
    const key = c.req.param('key') ?? '';
    if (!isConfigKey(key)) throw new ApiError(404, 'unknown_config_key');
    const b = await readBody(c);
    const reason = reasonOf(b, false);
    try {
      const { before, after } = await setConfig(c.get('q'), key, b.value, c.get('admin').label, reason);
      await audit(c, { action: 'config.set', targetType: 'config', targetId: key, reason, before, after });
      return c.json({ ok: true, key, value: after });
    } catch (e) {
      if (e instanceof InvalidConfig) throw new ApiError(400, 'invalid_config', { detail: e.message });
      throw e;
    }
  });

  r.get('/config-history', 'viewer', async (c) => {
    const { page, size, offset } = pageOf(c, 20);
    const key = c.req.query('key');
    const rows = await c.get('q').query<{ id: string; key: string; before_value: string | null; after_value: string; changed_by: string; reason: string | null; at: string | Date }>(
      `SELECT id::text, key, before_value::text, after_value::text, changed_by, reason, at FROM config_history
       WHERE ($1::text IS NULL OR key = $1) ORDER BY at DESC, id DESC LIMIT ${size} OFFSET ${offset}`, [key ?? null],
    );
    return c.json({
      items: rows.map((h) => ({ id: h.id, key: h.key, before: parseJsonb(h.before_value), after: parseJsonb(h.after_value), changed_by: h.changed_by, reason: h.reason, at: iso(h.at) })),
      page, page_size: size,
    });
  });
}
