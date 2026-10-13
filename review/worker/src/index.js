const ORIGINS = ['https://alesruzickadesignal.github.io', 'http://localhost:8890'];
const MAX_BODY = 16 * 1024;

const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v, min, max) => (Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : 0);

function cors(req) {
  const o = req.headers.get('Origin');
  const h = { Vary: 'Origin' };
  if (ORIGINS.includes(o)) {
    h['Access-Control-Allow-Origin'] = o;
    h['Access-Control-Allow-Methods'] = 'GET,POST,PATCH,DELETE,OPTIONS';
    h['Access-Control-Allow-Headers'] = 'Content-Type,Authorization';
    h['Access-Control-Max-Age'] = '86400';
  }
  return h;
}

export default {
  async fetch(req, env) {
    const c = cors(req);
    const json = (data, status = 200) =>
      new Response(JSON.stringify(data), { status, headers: { ...c, 'Content-Type': 'application/json; charset=utf-8' } });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: c });

    const url = new URL(req.url);
    const m = url.pathname.match(/^\/comments(?:\/([\w-]+))?\/?$/);
    if (!m) return json({ error: 'not found' }, 404);
    const id = m[1];

    // Prohlížečový požadavek z cizího originu nepustit (curl bez Origin projde).
    const origin = req.headers.get('Origin');
    if (origin && !ORIGINS.includes(origin)) return json({ error: 'forbidden origin' }, 403);

    // Seznam: klíče c:<createdAt>:<id>, řazeno vzestupně dle času.
    const list = async () => {
      const out = [];
      let cursor;
      do {
        const r = await env.COMMENTS.list({ prefix: 'c:', cursor });
        const vals = await Promise.all(r.keys.map((k) => env.COMMENTS.get(k.name, 'json')));
        out.push(...vals.filter(Boolean));
        cursor = r.list_complete ? undefined : r.cursor;
      } while (cursor);
      return out;
    };
    // Index i:<id> -> hlavní klíč; list() je eventually consistent, get() ne.
    const findKey = (cid) => env.COMMENTS.get('i:' + cid);

    if (!id && req.method === 'GET') {
      let all = await list();
      const page = url.searchParams.get('page');
      if (page) all = all.filter((x) => x.page === page);
      return json(all);
    }

    if (!id && req.method === 'POST') {
      const raw = await req.text();
      if (raw.length > MAX_BODY) return json({ error: 'body too large' }, 413);
      let b;
      try { b = JSON.parse(raw); } catch { return json({ error: 'invalid json' }, 400); }
      if (!b || typeof b !== 'object') return json({ error: 'invalid body' }, 400);
      const text = str(b.text, 4000).trim();
      const selector = str(b.selector, 1000);
      const page = str(b.page, 300);
      if (!text || !selector || !page) return json({ error: 'text, selector, page required' }, 400);
      const vp = b.viewport && typeof b.viewport === 'object' ? b.viewport : {};
      const cm = {
        id: crypto.randomUUID().slice(0, 8),
        createdAt: new Date().toISOString(),
        status: 'open',
        page,
        selector,
        label: str(b.label, 200),
        text,
        author: str(b.author, 100),
        x: num(b.x, 0, 100),
        y: num(b.y, 0, 100),
        viewport: { w: num(vp.w, 0, 20000), h: num(vp.h, 0, 20000) },
        scrollY: num(b.scrollY, 0, 1e7),
        userAgent: str(b.userAgent, 300),
      };
      const key = `c:${cm.createdAt}:${cm.id}`;
      await env.COMMENTS.put(key, JSON.stringify(cm));
      await env.COMMENTS.put('i:' + cm.id, key);
      return json(cm, 201);
    }

    if (id && req.method === 'PATCH') {
      const raw = await req.text();
      if (raw.length > MAX_BODY) return json({ error: 'body too large' }, 413);
      let b;
      try { b = JSON.parse(raw); } catch { return json({ error: 'invalid json' }, 400); }
      if (!b || !['open', 'done'].includes(b.status)) return json({ error: 'status must be open|done' }, 400);
      const key = await findKey(id);
      if (!key) return json({ error: 'not found' }, 404);
      const cm = await env.COMMENTS.get(key, 'json');
      cm.status = b.status;
      await env.COMMENTS.put(key, JSON.stringify(cm));
      return json(cm);
    }

    if (id && req.method === 'DELETE') {
      const auth = req.headers.get('Authorization') || '';
      if (!env.ADMIN_TOKEN || auth !== `Bearer ${env.ADMIN_TOKEN}`) return json({ error: 'unauthorized' }, 401);
      const key = await findKey(id);
      if (!key) return json({ error: 'not found' }, 404);
      await env.COMMENTS.delete(key);
      await env.COMMENTS.delete('i:' + id);
      return json({ ok: true });
    }

    return json({ error: 'method not allowed' }, 405);
  },
};
