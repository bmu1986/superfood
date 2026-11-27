// SuperFood database: SQLite in the browser (sql.js), working copy in IndexedDB.
// Same rules as Organizer: every row has updated_at and a deleted flag; sync merges row by row, newest wins.
(function (root) {
  const SYNC_TABLES = ['depts', 'products', 'recipes', 'recipe_items', 'tags', 'recipe_tags', 'plan', 'shop', 'settings'];
  const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS depts (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, sort REAL DEFAULT 0,
  updated_at INTEGER NOT NULL, deleted INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, aliases TEXT DEFAULT '', dept TEXT DEFAULT 'oth',
  kcal REAL DEFAULT 0, protein REAL DEFAULT 0, fat REAL DEFAULT 0, carbs REAL DEFAULT 0,
  piece_g REAL DEFAULT 0, yield REAL DEFAULT 1, diet TEXT DEFAULT 'v', flags TEXT DEFAULT '', quality INTEGER DEFAULT 0,
  updated_at INTEGER NOT NULL, deleted INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS recipes (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, role TEXT DEFAULT 'main', meals TEXT DEFAULT 'ld',
  servings REAL DEFAULT 2, time INTEGER DEFAULT 0, out_g REAL, needs_side INTEGER DEFAULT 0, needs_sauce INTEGER DEFAULT 0,
  steps TEXT DEFAULT '', source TEXT DEFAULT '', photo TEXT, fav INTEGER DEFAULT 0, created_at INTEGER,
  updated_at INTEGER NOT NULL, deleted INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS recipe_items (
  id TEXT PRIMARY KEY, recipe_id TEXT NOT NULL, product_id TEXT, name TEXT NOT NULL, qty REAL, unit TEXT, sort REAL DEFAULT 0,
  updated_at INTEGER NOT NULL, deleted INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL, sort REAL DEFAULT 0,
  updated_at INTEGER NOT NULL, deleted INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS recipe_tags (
  id TEXT PRIMARY KEY, recipe_id TEXT NOT NULL, tag_id TEXT NOT NULL,
  updated_at INTEGER NOT NULL, deleted INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS plan (
  id TEXT PRIMARY KEY, date TEXT NOT NULL, slot TEXT NOT NULL, part TEXT NOT NULL,
  recipe_id TEXT, product_id TEXT, grams REAL, locked INTEGER DEFAULT 0,
  updated_at INTEGER NOT NULL, deleted INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS shop (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, product_id TEXT, qty REAL, unit TEXT, dept TEXT, note TEXT DEFAULT '',
  done INTEGER DEFAULT 0, source TEXT DEFAULT '', sort REAL DEFAULT 0, created_at INTEGER,
  updated_at INTEGER NOT NULL, deleted INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY, value TEXT, updated_at INTEGER NOT NULL, deleted INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_ri_recipe ON recipe_items(recipe_id);
CREATE INDEX IF NOT EXISTS idx_rt_recipe ON recipe_tags(recipe_id);
CREATE INDEX IF NOT EXISTS idx_plan_date ON plan(date);
`;

  // ---------- IndexedDB key/value ----------
  const IDB = {
    db: null,
    open() {
      if (this.db) return Promise.resolve(this.db);
      return new Promise((res, rej) => {
        const r = indexedDB.open('superfood', 1);
        r.onupgradeneeded = () => { r.result.createObjectStore('kv'); r.result.createObjectStore('blobs'); };
        r.onsuccess = () => { this.db = r.result; res(this.db); };
        r.onerror = () => rej(r.error);
      });
    },
    async op(store, mode, fn) {
      const db = await this.open();
      return new Promise((res, rej) => {
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        tx.oncomplete = () => res(req && req.result);
        tx.onerror = () => rej(tx.error);
        tx.onabort = () => rej(tx.error || new Error('IndexedDB aborted'));
      });
    },
    get(store, k) { return this.op(store, 'readonly', (s) => s.get(k)); },
    set(store, k, v) { return this.op(store, 'readwrite', (s) => s.put(v, k)); },
    del(store, k) { return this.op(store, 'readwrite', (s) => s.delete(k)); },
    keys(store) { return this.op(store, 'readonly', (s) => s.getAllKeys()); },
  };

  // ---------- photos (content addressed, like Organizer attachments) ----------
  const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const Blobs = {
    async sha256(bytes) { return hex(await crypto.subtle.digest('SHA-256', bytes)); },
    async has(h) { return !!(await IDB.get('blobs', h)); },
    async read(h) { return IDB.get('blobs', h); },
    async put(bytes) { const h = await this.sha256(bytes); await IDB.set('blobs', h, new Uint8Array(bytes)); return h; },
    async putVerified(h, bytes) { if ((await this.sha256(bytes)) !== h) throw new Error('фото повреждено при скачивании'); await IDB.set('blobs', h, new Uint8Array(bytes)); },
  };

  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16); }));
  const now = () => Date.now();
  let SQL = null;
  async function sql() {
    if (!SQL) SQL = await initSqlJs({ locateFile: (f) => `vendor/${f}` });
    return SQL;
  }

  class Store {
    constructor() { this.db = null; this.saveTimer = null; this.listeners = new Set(); this.persist = false; this.batching = 0; }

    static async open() {
      const S = await sql();
      const s = new Store();
      s.persist = true;
      const bytes = await IDB.get('kv', 'db');
      s.db = bytes ? new S.Database(bytes) : new S.Database();
      s.db.run(SCHEMA);
      s.migrate();
      await s.saveNow();
      return s;
    }
    static async openBuffer(buf) {
      const S = await sql();
      const s = new Store();
      s.db = new S.Database(buf);
      s.db.run(SCHEMA);
      return s;
    }
    static async memory() { const S = await sql(); const s = new Store(); s.db = new S.Database(); s.db.run(SCHEMA); s.migrate(); return s; }

    migrate() {
      if (!this.meta('device')) this.meta('device', uid());
    }
    meta(key, value) {
      if (value === undefined) { const r = this.get('SELECT value FROM meta WHERE key = ?', [key]); return r ? r.value : null; }
      this.db.run('INSERT OR REPLACE INTO meta VALUES (?, ?)', [key, String(value)]);
      return value;
    }
    changeSeq() { return Number(this.meta('change_seq') || 0); }
    isDirty() { return this.changeSeq() > Number(this.meta('synced_seq') || 0); }
    markSynced(seq) { this.meta('synced_seq', seq); this.scheduleSave(); }

    all(q, params = []) {
      const st = this.db.prepare(q);
      st.bind(params);
      const rows = [];
      while (st.step()) rows.push(st.getAsObject());
      st.free();
      return rows;
    }
    get(q, params = []) { return this.all(q, params)[0]; }
    run(q, params = []) { this.db.run(q, params); this.changed(); }

    // Group many writes into one change notification.
    batch(fn) {
      this.batching++;
      try { return fn(); } finally { this.batching--; if (!this.batching) this.changed(); }
    }
    changed(local = true) {
      if (this.batching) return;
      if (local) this.meta('change_seq', this.changeSeq() + 1);
      this.scheduleSave();
      for (const l of this.listeners) l(local);
    }
    onChange(fn) { this.listeners.add(fn); }
    scheduleSave() {
      if (!this.persist) return;
      clearTimeout(this.saveTimer);
      this.saveTimer = setTimeout(() => this.saveNow(), 300);
    }
    async saveNow() {
      if (!this.persist) return;
      clearTimeout(this.saveTimer);
      await IDB.set('kv', 'db', this.db.export());
    }
    exportBuffer() { return this.db.export(); }

    upsert(table, row, t = now()) {
      const r = { ...row, updated_at: t };
      if (!r.id) r.id = uid();
      const cols = Object.keys(r);
      const existing = this.get(`SELECT id FROM ${table} WHERE id = ?`, [r.id]);
      if (existing) {
        const rest = cols.filter((c) => c !== 'id');
        this.db.run(`UPDATE ${table} SET ${rest.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, [...rest.map((c) => r[c]), r.id]);
      } else {
        this.db.run(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, cols.map((c) => r[c]));
      }
      this.changed();
      return r.id;
    }
    softDelete(table, id) {
      const t = now();
      this.db.run(`UPDATE ${table} SET deleted = 1, updated_at = ? WHERE id = ?`, [t, id]);
      if (table === 'recipes') {
        this.db.run('UPDATE recipe_items SET deleted = 1, updated_at = ? WHERE recipe_id = ? AND deleted = 0', [t, id]);
        this.db.run('UPDATE recipe_tags SET deleted = 1, updated_at = ? WHERE recipe_id = ? AND deleted = 0', [t, id]);
      }
      this.changed();
    }

    // ---------- settings ----------
    settings() {
      const out = {};
      for (const r of this.all('SELECT id, value FROM settings WHERE deleted = 0')) { try { out[r.id] = JSON.parse(r.value); } catch { /* ignore */ } }
      return out;
    }
    setSetting(key, value) { this.upsert('settings', { id: key, value: JSON.stringify(value) }); }

    // ---------- recipes ----------
    saveRecipe(rec, items, tagIds) {
      return this.batch(() => {
        const t = now();
        const id = this.upsert('recipes', { ...rec, created_at: rec.created_at || t }, t);
        const old = this.all('SELECT id FROM recipe_items WHERE recipe_id = ? AND deleted = 0', [id]).map((r) => r.id);
        const keep = new Set();
        items.forEach((it, i) => {
          const iid = it.id || uid();
          keep.add(iid);
          this.upsert('recipe_items', { id: iid, recipe_id: id, product_id: it.product_id || null, name: it.name, qty: it.qty ?? null, unit: it.unit || '', sort: i, deleted: 0 }, t);
        });
        for (const o of old) if (!keep.has(o)) this.db.run('UPDATE recipe_items SET deleted = 1, updated_at = ? WHERE id = ?', [t, o]);
        if (tagIds) this.setRecipeTags(id, tagIds, t);
        return id;
      });
    }
    setRecipeTags(recipeId, tagIds, t = now()) {
      const current = this.all('SELECT id, tag_id, deleted FROM recipe_tags WHERE recipe_id = ?', [recipeId]);
      const want = new Set(tagIds);
      for (const r of current) {
        const del = want.has(r.tag_id) ? 0 : 1;
        if (r.deleted !== del) this.db.run('UPDATE recipe_tags SET deleted = ?, updated_at = ? WHERE id = ?', [del, t, r.id]);
        want.delete(r.tag_id);
      }
      for (const tagId of want) this.db.run('INSERT OR REPLACE INTO recipe_tags (id, recipe_id, tag_id, updated_at, deleted) VALUES (?,?,?,?,0)', [`${recipeId}:${tagId}`, recipeId, tagId, t]);
      this.changed();
    }

    referencedHashes() {
      return new Set(this.all('SELECT DISTINCT photo FROM recipes WHERE deleted = 0 AND photo IS NOT NULL AND photo <> \'\'').map((r) => r.photo));
    }

    // Starter catalog (data/products.tsv, data/recipes.json). Catalog rows carry their own updated_at, so they
    // merge like a sync from "the catalog device": new rows arrive, rows you edited later stay yours.
    applyCatalog(products, recipes, tags, depts = []) {
      let n = 0;
      const take = (table, row) => {
        const cur = this.get(`SELECT updated_at FROM ${table} WHERE id = ?`, [row.id]);
        if (cur && cur.updated_at >= row.updated_at) return false;
        const cols = Object.keys(row);
        this.db.run(`INSERT OR REPLACE INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, cols.map((c) => row[c]));
        n++;
        return true;
      };
      this.batch(() => {
        for (const d of depts) take('depts', d);
        for (const t of tags) take('tags', t);
        for (const p of products) take('products', p);
        for (const r of recipes) {
          const { items, tags: rtags, ...rec } = r;
          if (!take('recipes', rec)) continue;
          items.forEach((it, i) => take('recipe_items', { id: `${rec.id}:${i}`, recipe_id: rec.id, product_id: it[0], name: it[1], qty: it[2], unit: it[3], sort: i, updated_at: rec.updated_at, deleted: 0 }));
          for (const tg of rtags) take('recipe_tags', { id: `${rec.id}:${tg}`, recipe_id: rec.id, tag_id: tg, updated_at: rec.updated_at, deleted: 0 });
        }
      });
      return n;
    }

    // Same rule as Organizer: take every row that is newer there (or missing here).
    mergeFrom(other) {
      let taken = 0;
      for (const table of SYNC_TABLES) {
        const cols = this.all(`PRAGMA table_info(${table})`).map((c) => c.name);
        const otherCols = new Set(other.all(`PRAGMA table_info(${table})`).map((c) => c.name));
        const useCols = cols.filter((c) => otherCols.has(c));
        const mine = new Map(this.all(`SELECT id, updated_at FROM ${table}`).map((r) => [r.id, r.updated_at]));
        const st = other.db.prepare(`SELECT ${useCols.join(',')} FROM ${table}`);
        while (st.step()) {
          const r = st.getAsObject();
          const local = mine.get(r.id);
          if (local === undefined || r.updated_at > local) {
            this.db.run(`INSERT OR REPLACE INTO ${table} (${useCols.join(',')}) VALUES (${useCols.map(() => '?').join(',')})`, useCols.map((c) => r[c]));
            taken++;
          }
        }
        st.free();
      }
      if (taken) this.changed(false);
      return taken;
    }
  }

  root.SF = Object.assign(root.SF || {}, { Store, Blobs, IDB, uid, now });
})(typeof window !== 'undefined' ? window : globalThis);
