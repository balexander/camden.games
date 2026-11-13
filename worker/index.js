// Sync backend for Fact Dash. Static files come from the assets binding; /api/sync stores one family's players.
// Each sync code maps to its own Durable Object (named by the SHA-256 of the code, so the code itself is never stored).
import { DurableObject } from 'cloudflare:workers';

const CODE = /^[A-Z0-9]{16,64}$/, DOC = /^(meta|p_[a-z0-9]{1,40})$/, MAX_DOC = 1_000_000, MAX_DOCS = 60;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

async function room(env, code) {
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('factdash:' + code)))].map(b => b.toString(16).padStart(2, '0')).join('');
  return env.ROOMS.get(env.ROOMS.idFromName(hash));
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/sync')) return env.ASSETS.fetch(req);
    const code = (req.headers.get('x-sync-key') || '').toUpperCase();
    if (!CODE.test(code)) return json({ error: 'bad sync code' }, 401);
    const m = url.pathname.match(/^\/api\/sync(?:\/([^/]+))?$/);
    if (!m) return json({ error: 'not found' }, 404);
    const stub = await room(env, code), id = m[1];
    if (!id) return req.method === 'GET' ? json({ docs: await stub.list() }) : json({ error: 'method not allowed' }, 405);
    if (!DOC.test(id)) return json({ error: 'bad document id' }, 400);
    if (req.method === 'DELETE') { await stub.remove(id); return json({ ok: true }); }
    if (req.method === 'PUT') {
      const text = await req.text();
      if (text.length > MAX_DOC) return json({ error: 'too large' }, 413);
      let b; try { b = JSON.parse(text); } catch { return json({ error: 'bad json' }, 400); }
      if (!b || typeof b.json !== 'string' || !Number.isFinite(+b.updated)) return json({ error: 'bad document' }, 400);
      const ok = await stub.put(id, String(b.name ?? '').slice(0, 60), +b.updated, b.json);
      return ok ? json({ ok: true }) : json({ error: 'too many documents' }, 409);
    }
    return json({ error: 'method not allowed' }, 405);
  },
};

export class SyncRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS docs (id TEXT PRIMARY KEY, name TEXT, updated REAL, json TEXT)');
  }
  list() { return this.sql.exec('SELECT id, name, updated, json FROM docs').toArray(); }
  // The newer copy of a document wins; an older write from a device that was offline is ignored.
  put(id, name, updated, body) {
    const row = this.sql.exec('SELECT updated FROM docs WHERE id = ?', id).toArray()[0];
    if (!row && this.sql.exec('SELECT COUNT(*) AS n FROM docs').one().n >= MAX_DOCS) return false;
    if (!row || updated >= row.updated) this.sql.exec('INSERT OR REPLACE INTO docs (id, name, updated, json) VALUES (?, ?, ?, ?)', id, name, updated, body);
    return true;
  }
  remove(id) { this.sql.exec('DELETE FROM docs WHERE id = ?', id); }
}
