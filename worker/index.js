// Backend for Fact Dash. Static files come from the assets binding; /api keeps each account's players.
// Each account is its own Durable Object (named by the SHA-256 of the sign-in name) holding the password check, the signed-in devices and the saved players.
// The browser stretches the password into a key before sending it, so the password itself never arrives here and this Worker only does one quick hash.
import { DurableObject } from 'cloudflare:workers';

const NAME = /^[a-z0-9][a-z0-9._@+-]{2,63}$/, KEY = /^[0-9a-f]{64}$/, DOC = /^(meta|p_[a-z0-9]{1,40})$/;
const MAX_DOC = 1_000_000, MAX_DOCS = 60, MAX_SESSIONS = 20, MAX_FAILS = 10, LOCK_MS = 15 * 60_000, COOKIE_AGE = 400 * 86_400;
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const sha = async text => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
const json = (body, status = 200, cookie) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...(cookie && { 'set-cookie': cookie }) } });
// The sign-in cookie is "<random token>.<name>". Pages cannot read it, and it is only ever sent to /api on this site.
const cookie = (url, value, age) => `fd=${value}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${age}${url.protocol === 'https:' ? '; Secure' : ''}`;
const room = async (env, name) => env.ROOMS.get(env.ROOMS.idFromName(await sha('factdash:account:' + name)));
const read = async req => { try { const t = await req.text(); return t.length > MAX_DOC ? null : JSON.parse(t); } catch { return null; } };

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    const origin = req.headers.get('origin'), path = url.pathname.slice(5), signedOut = () => json({ error: 'signed out' }, 401, cookie(url, '', 0));
    if (req.method !== 'GET' && origin && origin !== url.origin) return json({ error: 'wrong origin' }, 403);

    if (path === 'signup' || path === 'login') {
      if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
      const b = await read(req), name = String(b?.name ?? '').trim().toLowerCase(), key = String(b?.key ?? '');
      if (!NAME.test(name) || !KEY.test(key)) return json({ error: 'bad name or password' }, 400);
      if (path === 'signup' && env.SIGNUP === 'closed') return json({ error: 'new accounts are closed' }, 403);
      const token = hex(crypto.getRandomValues(new Uint8Array(32)));
      const result = await (await room(env, name))[path](await sha('factdash:password:' + key), await sha(token));
      if (result !== 'ok') return json({ error: result }, { taken: 409, wrong: 401, locked: 429 }[result]);
      return json({ ok: true, name }, 200, cookie(url, token + '.' + name, COOKIE_AGE));
    }

    const m = /(?:^|;\s*)fd=([0-9a-f]{64})\.([^;\s]+)/.exec(req.headers.get('cookie') || '');
    if (path === 'logout') {
      if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
      if (m && NAME.test(m[2])) await (await room(env, m[2])).logout(await sha(m[1]));
      return json({ ok: true }, 200, cookie(url, '', 0));
    }
    const s = path.match(/^sync(?:\/([^/]+))?$/);
    if (!s) return json({ error: 'not found' }, 404);
    if (!m || !NAME.test(m[2])) return signedOut();
    const stub = await room(env, m[2]), session = await sha(m[1]), id = s[1];
    if (!id) {
      if (req.method !== 'GET') return json({ error: 'method not allowed' }, 405);
      const docs = await stub.list(session);   // every visit also renews the cookie, so a device in use stays signed in
      return docs ? json({ docs, name: m[2] }, 200, cookie(url, m[1] + '.' + m[2], COOKIE_AGE)) : signedOut();
    }
    if (!DOC.test(id)) return json({ error: 'bad document id' }, 400);
    if (req.method === 'DELETE') return (await stub.remove(session, id)) ? json({ ok: true }) : signedOut();
    if (req.method === 'PUT') {
      const b = await read(req);
      if (!b || typeof b.json !== 'string' || !Number.isFinite(+b.updated)) return json({ error: 'bad document' }, 400);
      const result = await stub.put(session, id, String(b.name ?? '').slice(0, 60), +b.updated, b.json);
      return result === 'ok' ? json({ ok: true }) : result === 'full' ? json({ error: 'too many documents' }, 409) : signedOut();
    }
    return json({ error: 'method not allowed' }, 405);
  },
};

export class SyncRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    // Nothing is written until someone signs up, so guessing at names leaves no storage behind.
    this.made = this.sql.exec("SELECT 1 FROM sqlite_master WHERE name = 'auth'").toArray().length > 0;
  }
  get(k) { return this.sql.exec('SELECT v FROM auth WHERE k = ?', k).toArray()[0]?.v; }
  set(k, v) { this.sql.exec('INSERT OR REPLACE INTO auth (k, v) VALUES (?, ?)', k, String(v)); }
  open(session) {
    this.sql.exec('INSERT OR REPLACE INTO sessions (h, t) VALUES (?, ?)', session, Date.now());
    this.sql.exec('DELETE FROM sessions WHERE h NOT IN (SELECT h FROM sessions ORDER BY t DESC LIMIT ?)', MAX_SESSIONS);
  }
  known(session) { return this.made && this.sql.exec('SELECT 1 FROM sessions WHERE h = ?', session).toArray().length > 0; }

  signup(pass, session) {
    if (this.made) return 'taken';
    this.sql.exec('CREATE TABLE auth (k TEXT PRIMARY KEY, v TEXT)');
    this.sql.exec('CREATE TABLE sessions (h TEXT PRIMARY KEY, t REAL)');
    this.sql.exec('CREATE TABLE docs (id TEXT PRIMARY KEY, name TEXT, updated REAL, json TEXT)');
    this.made = true; this.set('pass', pass); this.open(session);
    return 'ok';
  }
  // Ten wrong passwords in a row lock new sign-ins for 15 minutes. Devices already signed in keep working.
  login(pass, session) {
    if (!this.made) return 'wrong';
    if (+this.get('until') > Date.now()) return 'locked';
    if (this.get('pass') !== pass) {
      const fails = (+this.get('fails') || 0) + 1;
      if (fails >= MAX_FAILS) { this.set('until', Date.now() + LOCK_MS); this.set('fails', 0); } else this.set('fails', fails);
      return 'wrong';
    }
    this.set('fails', 0); this.open(session);
    return 'ok';
  }
  logout(session) { if (this.made) this.sql.exec('DELETE FROM sessions WHERE h = ?', session); }

  list(session) { return this.known(session) ? this.sql.exec('SELECT id, name, updated, json FROM docs').toArray() : null; }
  // The newer copy of a document wins; an older write from a device that was offline is ignored.
  put(session, id, name, updated, body) {
    if (!this.known(session)) return 'signed out';
    const row = this.sql.exec('SELECT updated FROM docs WHERE id = ?', id).toArray()[0];
    if (!row && this.sql.exec('SELECT COUNT(*) AS n FROM docs').one().n >= MAX_DOCS) return 'full';
    if (!row || updated >= row.updated) this.sql.exec('INSERT OR REPLACE INTO docs (id, name, updated, json) VALUES (?, ?, ?, ?)', id, name, updated, body);
    return 'ok';
  }
  remove(session, id) { if (!this.known(session)) return false; this.sql.exec('DELETE FROM docs WHERE id = ?', id); return true; }
}
