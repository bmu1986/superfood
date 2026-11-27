// SuperFood: shopping list, recipes with photos, weekly menu with calories and a health score.
// Same data rules and Dropbox sync as Organizer; one code for the phone (home-screen app) and the computer.
(function () {
  const { Store, Blobs, IDB, uid, Dropbox, startAuth, finishAuth, sync, photoBytes, Pending } = window.SF;
  const F = window.Food;
  const VERSION = '0.1.0';

  // ---------- DOM helpers ----------
  const $ = (s, r = document) => r.querySelector(s);
  function h(tag, attrs = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on')) el[k] = v;
      else if (k === 'style' && typeof v === 'object') for (const [sk, sv] of Object.entries(v)) el.style.setProperty(sk, sv);
      else if (k === 'value') el.value = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat()) if (k != null && k !== false) el.append(k instanceof Node ? k : document.createTextNode(String(k)));
    return el;
  }
  const svg = (d, n = 20, w = 1.8) => `<svg width="${n}" height="${n}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const I = {
    cart: (n) => svg('<path d="M3 4h2l2.2 10.2a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.2L20.5 7H6.2"/><circle cx="9.5" cy="19.5" r="1.3"/><circle cx="17" cy="19.5" r="1.3"/>', n),
    book: (n) => svg('<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/><path d="M9 7.5h7M9 11h5"/>', n),
    cal: (n) => svg('<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M8 14h3M8 17h6"/>', n),
    gear: (n) => svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>', n, 1.5),
    plus: (n = 26) => svg('<path d="M12 5v14M5 12h14"/>', n, 2.2),
    close: (n = 18) => svg('<path d="M6 6l12 12M18 6L6 18"/>', n),
    check: (n = 15) => svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', n, 2.8),
    left: (n = 18) => svg('<path d="M15 6l-6 6 6 6"/>', n, 2),
    right: (n = 18) => svg('<path d="M9 6l6 6-6 6"/>', n, 2),
    reroll: (n = 18) => svg('<path d="M20 11a8 8 0 0 0-14.6-4.5L4 8"/><path d="M4 3v5h5"/><path d="M4 13a8 8 0 0 0 14.6 4.5L20 16"/><path d="M20 21v-5h-5"/>', n),
    lock: (n = 17) => svg('<rect x="5" y="11" width="14" height="9.5" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>', n),
    sync: (n = 19) => svg('<path d="M20 11a8 8 0 0 0-14.6-4.5L4 8"/><path d="M4 3v5h5"/><path d="M4 13a8 8 0 0 0 14.6 4.5L20 16"/><path d="M20 21v-5h-5"/>', n),
    dots: (n = 20) => svg('<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>', n, 2),
    magic: (n = 19) => svg('<path d="M15 4V2M15 10V8M11 6H9M21 6h-2M18 3l-1.5 1.5M18 9l-1.5-1.5M12 3l1.5 1.5"/><path d="M3 21l11-11"/>', n),
    heart: (n = 19, fill = 'none') => `<svg width="${n}" height="${n}" viewBox="0 0 24 24" fill="${fill}" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M12 20s-7.5-4.6-9.2-9.2C1.6 7.4 3.8 4 7.2 4c2 0 3.4 1.1 4.8 2.9C13.4 5.1 14.8 4 16.8 4c3.4 0 5.6 3.4 4.4 6.8C19.5 15.4 12 20 12 20z"/></svg>`,
  };

  // ---------- state ----------
  let store = null, dbx = null, model = null;
  let cfg = { theme: 'auto', view: 'shop', weekOffset: 0 };
  const saveCfg = () => IDB.set('kv', 'cfg', cfg);
  const st = { recipeId: null, servings: null, rq: '', rfilters: {}, role: '', sync: { running: false }, photoUrls: new Map(), prodQ: '', page: null };
  const wideMQ = matchMedia('(min-width: 768px)');
  const threeMQ = matchMedia('(min-width: 1180px)');
  const isWide = () => wideMQ.matches;

  const S = () => {
    const s = store.settings();
    return { goal: s.goal || 1900, split: s.split || F.DEFAULT_SPLIT, slots: s.slots || ['b', 'l', 'd', 's'], eaters: s.eaters || 2, filters: s.filters || {} };
  };

  function rebuildModel() {
    model = F.buildModel({
      products: store.all('SELECT * FROM products WHERE deleted = 0 ORDER BY name'),
      recipes: store.all('SELECT * FROM recipes WHERE deleted = 0 ORDER BY title'),
      items: store.all('SELECT * FROM recipe_items WHERE deleted = 0'),
      tags: store.all('SELECT * FROM tags WHERE deleted = 0 ORDER BY sort, name'),
      recipeTags: store.all('SELECT * FROM recipe_tags WHERE deleted = 0'),
    });
  }

  // ---------- theme / toast / sheets ----------
  const darkMQ = matchMedia('(prefers-color-scheme: dark)');
  function applyTheme() {
    const dark = cfg.theme === 'dark' || (cfg.theme !== 'light' && darkMQ.matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    for (const m of document.querySelectorAll('meta[name="theme-color"]')) m.content = dark ? '#16181c' : '#f6f7f9';
  }
  darkMQ.addEventListener('change', applyTheme);
  let toastTimer = null;
  function toast(text, actionText, action, ms = 3500) {
    const el = $('#toast');
    el.innerHTML = '';
    el.append(h('span', {}, text));
    if (actionText) el.append(h('button', { onclick: () => { el.classList.remove('show'); action(); } }, actionText));
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), ms);
  }
  function sheet(title, body, { onClose, full = false, right = null } = {}) {
    const wrap = h('div', { class: 'sheet-wrap' });
    const close = () => { wrap.classList.remove('open'); setTimeout(() => wrap.remove(), 250); onClose && onClose(); };
    const card = h('div', { class: 'sheet' + (full ? ' full' : '') },
      h('div', { class: 'sheet-head' }, h('span', { class: 'grip' }), h('b', {}, title), right || h('button', { class: 'icon-btn', 'aria-label': 'Закрыть', html: I.close(), onclick: close })),
      h('div', { class: 'sheet-body' }, body));
    wrap.append(h('div', { class: 'scrim', onclick: close }), card);
    $('#sheets').append(wrap);
    requestAnimationFrame(() => wrap.classList.add('open'));
    return { close, card };
  }
  function choose(title, items) {
    return new Promise((res) => {
      let done = false;
      const body = h('div', { class: 'menu' }, items.map((it) => h('button', {
        class: 'menu-item' + (it.danger ? ' danger' : ''), onclick: () => { done = true; s.close(); res(it.value); },
      }, h('span', { class: 'mi-label' }, it.label), it.hint ? h('span', { class: 'mi-hint' }, it.hint) : null)));
      const s = sheet(title, body, { onClose: () => { if (!done) res(undefined); } });
    });
  }
  const confirmDlg = (title, ok = 'Удалить') => choose(title, [{ label: ok, value: true, danger: true }, { label: 'Отмена', value: false }]).then((v) => v === true);

  // ---------- photos ----------
  const PALETTE = { breakfast: ['#f6c560', '#e88a3a'], soup: ['#e0644a', '#9c2a2a'], main: ['#5aa36b', '#24603d'], side: ['#c9a66b', '#8a6236'], sauce: ['#e6b35a', '#b0602a'], salad: ['#8cc35a', '#3e7a2e'], snack: ['#a48ad8', '#5a3d9a'], dessert: ['#e88aa8', '#a0365a'] };
  function artStyle(r) {
    const [a, b] = PALETTE[r.role] || PALETTE.main;
    return `radial-gradient(circle at 50% 46%, rgba(255,255,255,.28) 0 30%, rgba(255,255,255,0) 31%), radial-gradient(circle at 50% 46%, rgba(255,255,255,.18) 0 41%, rgba(255,255,255,0) 42%), linear-gradient(150deg, ${a}, ${b})`;
  }
  async function photoUrl(hash) {
    if (!hash) return null;
    if (st.photoUrls.has(hash)) return st.photoUrls.get(hash);
    let bytes = await Blobs.read(hash);
    if (!bytes && cfg.refreshToken) { try { bytes = await photoBytes(getDbx(), hash); } catch { bytes = null; } }
    if (!bytes) return null;
    const url = URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' }));
    st.photoUrls.set(hash, url);
    return url;
  }
  // a tile/background with the dish photo, or a drawn plate with the first letter until the photo arrives
  function paint(el, r, letter = true) {
    el.style.backgroundImage = artStyle(r);
    if (letter && !r.photo) { el.classList.add('ph-art'); el.textContent = (r.title || '?').trim().charAt(0).toUpperCase(); }
    if (r.photo) photoUrl(r.photo).then((u) => { if (u) { el.style.backgroundImage = `url("${u}")`; el.textContent = ''; el.classList.remove('ph-art'); } });
    return el;
  }
  async function resizeImage(file) {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.82));
    return new Uint8Array(await blob.arrayBuffer());
  }

  // ---------- small UI pieces ----------
  const hsClass = (s) => (s == null ? 'n' : s >= 7.5 ? 'g' : s >= 5.5 ? 'y' : 'o');
  const hsEl = (s, title) => h('span', { class: 'hs ' + hsClass(s), title: title || 'Полезность из 10' }, s == null ? '–' : F.fmtNum(s));
  const kc = (n) => Math.round(n).toLocaleString('ru-RU');
  const cbEl = (on, onclick) => h('button', { class: 'cb' + (on ? ' on' : ''), 'aria-label': on ? 'Снять отметку' : 'Отметить', html: on ? I.check() : '', onclick });
  function filterChips(filters, names, onchange) {
    return names.map((n) => h('button', { class: 'fchip ' + (filters[n] || ''), onclick: () => {
      const next = { undefined: 'need', need: 'skip', skip: undefined }[filters[n]];
      if (next) filters[n] = next; else delete filters[n];
      onchange();
    } }, n));
  }
  const filterNames = () => [...F.AUTO, ...[...model.T.values()].map((t) => t.name).filter((n) => !F.AUTO.includes(n))];

  // ---------- layout ----------
  const VIEWS = [['shop', 'Покупки', I.cart], ['menu', 'Меню', I.cal], ['recipes', 'Рецепты', I.book], ['more', 'Ещё', I.gear]];
  function go(view) { cfg.view = view; st.page = null; saveCfg(); render(); $('#scroll').scrollTop = 0; }
  function render() {
    document.body.classList.toggle('wide', isWide());
    document.body.classList.toggle('three', threeMQ.matches);
    const side = $('#side'); side.innerHTML = '';
    side.append(h('div', { class: 'brand' }, h('span', { class: 'logo' }), 'SuperFood'),
      h('div', { class: 'side-scroll navs' }, VIEWS.map(([v, l, ic]) => h('div', { class: 'nav' + (cfg.view === v ? ' active' : ''), onclick: () => go(v) }, h('span', { class: 'nav-ic', html: ic(20) }), h('span', { class: 'nav-label' }, l), v === 'shop' ? h('span', { class: 'count' }, shopLeft() || '') : null))));
    const tabs = $('#tabs'); tabs.innerHTML = '';
    for (const [v, l, ic] of VIEWS) tabs.append(h('button', { class: 'tab' + (cfg.view === v ? ' active' : ''), onclick: () => go(v) }, h('span', { html: ic(24) }), h('small', {}, l), v === 'shop' && shopLeft() ? h('i', { class: 'badge' }, shopLeft()) : null));
    const bar = $('#bar'), list = $('#list'), fab = $('#fab');
    bar.innerHTML = ''; list.innerHTML = '';
    fab.style.display = 'none';
    ({ shop: renderShop, menu: renderMenu, recipes: renderRecipes, more: renderMore }[cfg.view] || renderShop)(bar, list, fab);
    renderDetail();
  }
  const shopLeft = () => (store ? store.get('SELECT COUNT(*) AS n FROM shop WHERE deleted = 0 AND done = 0').n : 0);
  const syncBtn = () => cfg.refreshToken ? h('button', { class: 'sync-btn' + (st.sync.running ? ' running' : '') + (cfg.lastError ? ' err' : ''), title: cfg.lastError || 'Синхронизировать', html: I.sync(), onclick: () => syncNow({ manual: true }) }) : null;
  const header = (bar, title, sub, ...actions) => { bar.append(h('div', { class: 'bar-row' }, h('h1', {}, title), h('div', { class: 'bar-actions' }, syncBtn(), ...actions))); if (sub) bar.append(h('div', { class: 'bar-sub' }, sub)); };

  // =====================================================================
  // SHOPPING LIST
  // =====================================================================
  function renderShop(bar, list) {
    const rows = store.all('SELECT * FROM shop WHERE deleted = 0 ORDER BY done, sort, created_at');
    const left = rows.filter((r) => !r.done);
    header(bar, 'Покупки', left.length ? `Осталось ${left.length}` : rows.length ? 'Всё куплено' : '', h('button', { class: 'icon-btn', 'aria-label': 'Ещё', html: I.dots(), onclick: shopMenu }));
    const inp = h('input', { class: 'search', placeholder: 'Добавить: «молоко 2», «яйца 10»…', enterkeyhint: 'done', autocomplete: 'off' });
    const add = () => { const v = inp.value.trim(); if (!v) return; addShopText(v); inp.value = ''; render(); setTimeout(() => $('#quick-add')?.focus(), 0); };
    inp.id = 'quick-add';
    inp.onkeydown = (e) => { if (e.key === 'Enter') add(); };
    bar.append(h('div', { class: 'quick', style: { padding: '8px 0 0' } }, inp, h('button', { class: 'btn primary', onclick: add }, 'Добавить')));
    if (!rows.length) {
      list.append(h('div', { class: 'empty' }, h('b', {}, 'Список пуст'), 'Добавь продукт строкой выше, нажми «Всё в список» в рецепте или собери список из меню недели.',
        h('br'), h('button', { class: 'btn primary', onclick: () => shopFromWeek() }, 'Собрать из меню недели')));
      return;
    }
    const byDept = new Map();
    for (const r of left) { const d = r.dept || 'oth'; if (!byDept.has(d)) byDept.set(d, []); byDept.get(d).push(r); }
    for (const [d] of F.DEPTS) {
      const g = byDept.get(d);
      if (!g) continue;
      list.append(h('div', { class: 'dept' }, h('span', {}, F.DEPT_NAME[d]), h('span', {}, g.length)));
      for (const r of g) list.append(shopRow(r));
    }
    const done = rows.filter((r) => r.done);
    if (done.length) {
      list.append(h('div', { class: 'done-head' }, h('span', {}, `Куплено · ${done.length}`), h('button', { onclick: clearDone }, 'Убрать купленное')));
      for (const r of done) list.append(shopRow(r));
    }
  }
  function shopRow(r) {
    const toggle = () => { store.upsert('shop', { id: r.id, done: r.done ? 0 : 1 }); render(); };
    const inner = h('div', { class: 'inner' }, cbEl(r.done, (e) => { e.stopPropagation(); toggle(); }),
      h('div', { class: 'sname' }, r.name, r.note ? h('small', {}, shortNote(r.note)) : null),
      r.qty != null || r.unit ? h('span', { class: 'qty' }, F.fmtQty(r.qty, r.unit)) : null);
    const row = h('div', { class: 'srow2' + (r.done ? ' done' : '') }, h('div', { class: 'swipe-bg ok' }, r.done ? 'Вернуть' : 'Куплено'), h('div', { class: 'swipe-bg del' }, 'Удалить'), inner);
    // swipe right = bought, swipe left = delete
    let x0 = null, y0 = 0, dx = 0, moved = false;
    row.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dx = 0; moved = false; }, { passive: true });
    row.addEventListener('touchmove', (e) => {
      if (x0 == null) return;
      dx = e.touches[0].clientX - x0;
      if (!moved && Math.abs(e.touches[0].clientY - y0) > Math.abs(dx)) { x0 = null; return; }
      if (Math.abs(dx) > 8) moved = true;
      row.classList.add('dragging');
      inner.style.transform = `translateX(${dx}px)`;
      row.querySelector('.ok').style.opacity = dx > 0 ? Math.min(1, dx / 80) : 0;
      row.querySelector('.del').style.opacity = dx < 0 ? Math.min(1, -dx / 80) : 0;
    }, { passive: true });
    row.addEventListener('touchend', () => {
      row.classList.remove('dragging');
      if (x0 != null && dx > 80) { toggle(); return; }
      if (x0 != null && dx < -100) { removeShop(r); return; }
      inner.style.transform = '';
      x0 = null;
    });
    row.onclick = () => { if (!moved) editShop(r); };
    return row;
  }
  const shortNote = (n) => { const p = n.split(', '); return p.length > 2 ? `${p.slice(0, 2).join(', ')} и ещё ${p.length - 2}` : n; };
  function removeShop(r) {
    store.softDelete('shop', r.id); render();
    toast(`Удалено: ${r.name}`, 'Вернуть', () => { store.upsert('shop', { id: r.id, deleted: 0 }); render(); });
  }
  function addShopText(text) {
    const p = F.parseLine(text, model.index);
    if (!p) return;
    const prod = p.product_id ? model.P.get(p.product_id) : null;
    addShopItems([{ product_id: p.product_id, name: prod ? prod.name : p.name, qty: p.qty, unit: p.unit, dept: prod ? (String(prod.flags).includes('b') ? 'home' : prod.dept) : 'oth', note: '' }], 'manual');
  }
  // add or sum into existing open rows of the same product and unit
  function addShopItems(items, source) {
    const open = store.all('SELECT * FROM shop WHERE deleted = 0 AND done = 0');
    const maxSort = (store.get('SELECT MAX(sort) AS m FROM shop').m || 0) + 1;
    store.batch(() => items.forEach((it, i) => {
      const same = open.find((o) => (it.product_id ? o.product_id === it.product_id : F.norm(o.name) === F.norm(it.name)) && (o.unit || '') === (it.unit || ''));
      if (same) {
        const notes = [...new Set([...(same.note ? same.note.split(', ') : []), ...(it.note ? it.note.split(', ') : [])])].join(', ');
        store.upsert('shop', { id: same.id, qty: same.qty != null && it.qty != null ? Math.round((same.qty + it.qty) * 100) / 100 : same.qty ?? it.qty, note: notes });
      } else {
        store.upsert('shop', { id: uid(), name: it.name, product_id: it.product_id || null, qty: it.qty ?? null, unit: it.unit || '', dept: it.dept || 'oth', note: it.note || '', done: 0, source, sort: maxSort + i, created_at: Date.now() });
      }
    }));
  }
  function editShop(r) {
    const name = h('input', { class: 'field', value: r.name });
    const qty = h('input', { class: 'field', value: r.qty ?? '', inputmode: 'decimal', placeholder: 'Сколько' });
    const unit = h('select', { class: 'field' }, ['', 'шт', 'г', 'кг', 'мл', 'л', 'уп.', 'банка', 'пучок'].map((u) => h('option', { value: u, selected: (r.unit || '') === u ? true : null }, u || '—')));
    const dept = h('select', { class: 'field' }, F.DEPTS.map(([k, n]) => h('option', { value: k, selected: r.dept === k ? true : null }, n)));
    const save = () => { store.upsert('shop', { id: r.id, name: name.value.trim() || r.name, qty: qty.value.trim() === '' ? null : Number(qty.value.replace(',', '.')), unit: unit.value, dept: dept.value }); s.close(); render(); };
    const s = sheet('Покупка', h('div', { class: 'form' }, name, h('div', { class: 'row2' }, qty, unit), h('div', { class: 'lbl' }, 'Отдел'), dept,
      r.note ? h('p', { class: 'hint' }, 'Для: ' + r.note) : null,
      h('button', { class: 'btn primary', onclick: save }, 'Сохранить'),
      h('button', { class: 'btn', style: { color: 'var(--red)' }, onclick: () => { s.close(); removeShop(r); } }, 'Удалить')));
  }
  function clearDone() { const n = store.get('SELECT COUNT(*) AS n FROM shop WHERE deleted = 0 AND done = 1').n; store.batch(() => { for (const r of store.all('SELECT id FROM shop WHERE deleted = 0 AND done = 1')) store.softDelete('shop', r.id); }); render(); toast(`Убрано: ${n}`); }
  async function shopMenu() {
    const v = await choose('Покупки', [
      { label: 'Собрать из меню этой недели', value: 'week' }, { label: 'Собрать из меню на сегодня и завтра', value: 'two' },
      { label: 'Убрать купленное', value: 'done' }, { label: 'Очистить весь список', value: 'all', danger: true }]);
    if (v === 'week') shopFromWeek();
    if (v === 'two') { const d = new Date(); const t = new Date(); t.setDate(d.getDate() + 1); shopFromDates([F.iso(d), F.iso(t)]); }
    if (v === 'done') clearDone();
    if (v === 'all' && await confirmDlg('Очистить весь список?', 'Очистить')) { store.batch(() => { for (const r of store.all('SELECT id FROM shop WHERE deleted = 0')) store.softDelete('shop', r.id); }); render(); }
  }
  function weekDates() { const s = F.weekStart(); s.setDate(s.getDate() + 7 * (cfg.weekOffset || 0)); return F.weekDates(s); }
  function shopFromWeek() { shopFromDates(weekDates()); }
  function shopFromDates(dates) {
    const today = F.iso(new Date());
    const rows = store.all(`SELECT * FROM plan WHERE deleted = 0 AND date IN (${dates.map(() => '?').join(',')}) AND date >= ?`, [...dates, today]);
    if (!rows.length) { toast('В меню на эти дни пусто. Сначала подбери меню.'); return; }
    const eaters = S().eaters;
    const parts = rows.map((r) => F.partInfo(model, r)).filter(Boolean).map((i) => ({ title: i.title, raw: i.raw.map(([p, g, it]) => [p, g * eaters, it]) }));
    const items = F.shoppingFrom(model, parts);
    // the menu list is rebuilt: open rows from an earlier menu run go away, bought ones stay
    store.batch(() => { for (const r of store.all("SELECT id FROM shop WHERE deleted = 0 AND done = 0 AND source = 'menu'")) store.softDelete('shop', r.id); });
    addShopItems(items, 'menu');
    toast(`В списке ${items.length} продуктов на ${eaters} ${eaters === 1 ? 'едока' : 'едоков'}`);
    go('shop');
  }

  // =====================================================================
  // WEEKLY MENU
  // =====================================================================
  const WD = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const MON = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const dayName = (iso) => { const d = F.fromIso(iso); return [WD[d.getDay()], `${d.getDate()} ${MON[d.getMonth()]}`]; };
  function renderMenu(bar, list) {
    const dates = weekDates();
    const s = S();
    const [a] = [F.fromIso(dates[0])], b = F.fromIso(dates[6]);
    const range = `${a.getDate()} ${MON[a.getMonth()]} – ${b.getDate()} ${MON[b.getMonth()]}`;
    const shift = (k) => { cfg.weekOffset = (cfg.weekOffset || 0) + k; saveCfg(); render(); };
    header(bar, 'Меню', null,
      h('button', { class: 'icon-btn', title: 'Подобрать меню', 'aria-label': 'Подобрать меню', html: I.magic(), onclick: plannerSheet }),
      h('button', { class: 'icon-btn', 'aria-label': 'Ещё', html: I.dots(), onclick: menuMenu }));
    bar.append(h('div', { class: 'bar-sub' }, h('button', { class: 'wk-nav', 'aria-label': 'Прошлая неделя', html: I.left(), onclick: () => shift(-1) }), h('span', {}, range),
      h('button', { class: 'wk-nav', 'aria-label': 'Следующая неделя', html: I.right(), onclick: () => shift(1) }),
      cfg.weekOffset ? h('button', { class: 'txt-btn', onclick: () => shift(-cfg.weekOffset) }, 'Эта неделя') : null,
      h('span', { style: { marginLeft: 'auto' } }, `Цель ${kc(s.goal)} ккал`)));
    const rows = store.all(`SELECT * FROM plan WHERE deleted = 0 AND date >= ? AND date <= ? ORDER BY date`, [dates[0], dates[6]]);
    if (!rows.length) {
      list.append(h('div', { class: 'empty' }, h('b', {}, 'Меню на неделю ещё нет'), 'Выбери ограничения (пост, рыба, без изжоги), и программа подберёт завтраки, обеды, ужины и перекусы с гарнирами и соусами под твою цель по калориям.',
        h('br'), h('button', { class: 'btn primary', onclick: plannerSheet }, 'Подобрать меню')));
      return;
    }
    const today = F.iso(new Date());
    const wrap = h('div', { class: 'days' });
    for (const date of dates) {
      const dr = rows.filter((r) => r.date === date);
      const stats = F.dayStats(model, dr, s.goal);
      const [wd, dm] = dayName(date);
      const card = h('div', { class: 'day' + (date === today ? ' today' : '') },
        h('div', { class: 'day-h' }, h('b', {}, date === today ? 'Сегодня' : wd, h('small', {}, dm)), dr.length ? hsEl(stats.health.score, 'Полезность дня из 10') : null,
          h('span', { class: 'kc' }, dr.length ? `${kc(stats.kcal)} / ${kc(s.goal)} ккал` : '')));
      if (dr.length) {
        const pct = Math.min(100, stats.kcal / s.goal * 100);
        card.append(h('div', { class: 'kbar' }, h('i', { class: stats.kcal > s.goal * 1.08 ? 'over' : '', style: { width: pct + '%' } })));
        if (stats.health.why.length) card.append(h('div', { class: 'why' }, stats.health.why.slice(0, 4).map(([sg, t]) => h('span', { class: sg === '+' ? 'p' : 'm' }, `${sg} ${t}`)), h('span', {}, `Б ${Math.round(stats.p)} · Ж ${Math.round(stats.f)} · У ${Math.round(stats.c)}`)));
        for (const [slot] of F.SLOTS) {
          const sr = dr.filter((r) => r.slot === slot);
          if (sr.length) card.append(mealRow(date, slot, sr));
        }
        if (date === today && stats.kcal < s.goal - 120) card.append(h('div', { class: 'tip' }, tipFor(s.goal - stats.kcal)));
      } else {
        card.append(h('div', { class: 'day-empty' }, h('span', {}, 'Пусто'), h('button', { class: 'btn small primary', onclick: () => regenerate({ date }) }, 'Подобрать день')));
      }
      wrap.append(card);
    }
    list.append(wrap);
  }
  function tipFor(left) {
    left = Math.round(left);
    const ideas = [['яблоко', 47, 180], ['банан', 96, 150], ['грецких орехов', 654, 0], ['кефира', 40, 0], ['творога 5%', 121, 0], ['хлебец с сыром', 0, 0]];
    const opts = [];
    if (left >= 80) opts.push(`яблоко (${Math.round(47 * 1.8)} ккал)`);
    if (left >= 120) opts.push(`${Math.max(10, Math.round(left / 6.54 / 2 / 5) * 5)} г грецких орехов`);
    if (left >= 100) opts.push(`${Math.round(Math.min(400, left / 0.4) / 50) * 50} мл кефира`);
    return `До цели ещё ${left} ккал: ${opts.slice(0, 2).join(' или ') || 'можно чай с чем-то лёгким'}.`;
  }
  function mealRow(date, slot, sr) {
    const main = sr.find((r) => r.part === 'main') || sr[0];
    const mi = F.partInfo(model, main);
    const extra = sr.filter((r) => r !== main).map((r) => { const i = F.partInfo(model, r); return i ? `${i.title} ${Math.round(r.grams)} г` : null; }).filter(Boolean);
    const locked = sr.some((r) => r.locked);
    const kcal = sr.reduce((n, r) => n + (F.partInfo(model, r)?.kcal || 0), 0);
    const thumb = h('div', { class: 'thumb' });
    if (mi && mi.r) paint(thumb, mi.r); else { thumb.style.background = 'linear-gradient(150deg,#a48ad8,#5a3d9a)'; thumb.textContent = (mi?.title || '?').charAt(0); }
    return h('div', { class: 'meal', onclick: () => mealSheet(date, slot) }, thumb,
      h('div', { class: 'mt' }, h('div', { class: 'slot' }, F.SLOT_NAME[slot]), h('div', { class: 'nm' }, mi ? mi.title : '—'), extra.length ? h('div', { class: 'ex' }, '+ ' + extra.join(' · ')) : null),
      h('div', { class: 'gr' }, `${Math.round(main.grams || 0)} ${mi && mi.r && mi.r.role === 'soup' ? 'мл' : 'г'}`, h('small', {}, `${kc(kcal)} ккал`)),
      h('button', { class: 'mbtn' + (locked ? ' on' : ''), title: locked ? 'Закреплено' : 'Закрепить', 'aria-label': 'Закрепить', html: I.lock(), onclick: (e) => { e.stopPropagation(); store.batch(() => { for (const r of sr) store.upsert('plan', { id: r.id, locked: locked ? 0 : 1 }); }); render(); } }),
      h('button', { class: 'mbtn', title: 'Другое блюдо', 'aria-label': 'Другое блюдо', html: I.reroll(), onclick: (e) => { e.stopPropagation(); regenerate({ date, slot }); } }));
  }
  async function menuMenu() {
    const v = await choose('Меню', [{ label: 'Подобрать заново (кроме закреплённых)', value: 'gen' }, { label: 'Список покупок на эту неделю', value: 'shop' }, { label: 'Очистить неделю', value: 'clear', danger: true }]);
    if (v === 'gen') regenerate({});
    if (v === 'shop') shopFromWeek();
    if (v === 'clear' && await confirmDlg('Очистить меню недели?', 'Очистить')) { const d = weekDates(); store.batch(() => { for (const r of store.all('SELECT id FROM plan WHERE deleted = 0 AND date >= ? AND date <= ?', [d[0], d[6]])) store.softDelete('plan', r.id); }); render(); }
  }
  // generate the whole week, one day or one meal; locked meals stay
  let genCount = 0;
  function regenerate({ date, slot, emptyOnly } = {}) {
    const s = S();
    const dates = weekDates();
    const existing = store.all('SELECT * FROM plan WHERE deleted = 0 AND date >= ? AND date <= ?', [dates[0], dates[6]]);
    const prev = new Date(F.fromIso(dates[0])); prev.setDate(prev.getDate() - 7);
    const history = store.all('SELECT * FROM plan WHERE deleted = 0 AND date >= ? AND date < ?', [F.iso(prev), dates[0]]);
    const only = date ? { date, slot } : null;
    const keep = existing.filter((r) => r.locked || (only && (r.date !== date || (slot && r.slot !== slot))) || (emptyOnly && existing.some((x) => x.date === r.date)));
    const skipDates = emptyOnly ? new Set(existing.map((r) => r.date)) : new Set();
    const hist = history.concat(existing.filter((r) => !only || r.date !== date || (slot && r.slot !== slot)));
    const plan = F.planWeek(model, { dates: dates.filter((d) => !skipDates.has(d)), slots: s.slots, target: s.goal, split: s.split, filters: s.filters, history: hist, keep, seed: Date.now() % 1e9 + (++genCount), only });
    const t = Date.now();
    store.batch(() => {
      const touched = new Set(plan.map((r) => `${r.date}:${r.slot}`));
      for (const r of existing) {
        if (r.locked) continue;
        if (only ? r.date === date && (!slot || r.slot === slot) : !skipDates.has(r.date)) store.softDelete('plan', r.id);
      }
      for (const r of plan) {
        if (r.locked) continue;
        const id = `${r.date}:${r.slot}:${r.part}`;
        store.upsert('plan', { id, date: r.date, slot: r.slot, part: r.part, recipe_id: r.recipe_id || null, product_id: r.product_id || null, grams: r.grams, locked: 0, deleted: 0 }, t);
      }
      void touched;
    });
    if (date && slot) {
      // a single meal changed: keep the day near the goal by re-portioning the free meals of that day
      const day = store.all('SELECT * FROM plan WHERE deleted = 0 AND date = ?', [date]);
      F.balanceDay(model, day, s.goal);
      store.batch(() => { for (const r of day) if (!r.locked) store.upsert('plan', { id: r.id, grams: r.grams }); });
    }
    render();
    if (!date) toast('Меню готово', 'В покупки', shopFromWeek, 5000);
  }
  function plannerSheet() {
    const s = S();
    const filters = { ...s.filters };
    const slots = new Set(s.slots);
    const chips = h('div', { class: 'chips wrap' });
    const drawChips = () => { chips.innerHTML = ''; chips.append(...filterChips(filters, filterNames(), drawChips)); };
    drawChips();
    const slotPills = h('div', { class: 'chips wrap' });
    const drawSlots = () => { slotPills.innerHTML = ''; slotPills.append(...F.SLOTS.map(([k, n]) => h('button', { class: 'fchip' + (slots.has(k) ? ' on' : ''), onclick: () => { if (slots.has(k)) { if (slots.size > 1) slots.delete(k); } else slots.add(k); drawSlots(); } }, n))); };
    drawSlots();
    const goal = h('input', { class: 'field', type: 'number', inputmode: 'numeric', value: s.goal, min: 800, max: 5000, step: 50 });
    let eaters = s.eaters;
    const eat = h('div', { class: 'seg' });
    const drawEat = () => { eat.innerHTML = ''; eat.append(...[1, 2, 3, 4, 5, 6].map((n) => h('button', { class: eaters === n ? 'on' : '', onclick: () => { eaters = n; drawEat(); } }, n))); };
    drawEat();
    const save = () => {
      store.setSetting('filters', filters);
      store.setSetting('slots', F.SLOTS.map(([k]) => k).filter((k) => slots.has(k)));
      store.setSetting('goal', Math.max(800, Math.min(6000, Number(goal.value) || 1900)));
      store.setSetting('eaters', eaters);
    };
    const sh = sheet('Подобрать меню', h('div', { class: 'form' },
      h('div', { class: 'lbl' }, 'Ограничения: нажми раз, чтобы «нужно», два, чтобы «исключить»'), chips,
      h('div', { class: 'lbl' }, 'Приёмы пищи'), slotPills,
      h('div', { class: 'row2' }, h('div', {}, h('div', { class: 'lbl', style: { marginBottom: '6px' } }, 'Цель, ккал в день'), goal), h('div', {}, h('div', { class: 'lbl', style: { marginBottom: '6px' } }, 'Сколько едоков (для покупок)'), eat)),
      h('p', { class: 'hint' }, 'Закреплённые блюда останутся. Гарниры и соусы подбираются к блюдам, где они нужны, порции считаются под цель.'),
      h('button', { class: 'btn primary', onclick: () => { save(); sh.close(); rebuildModel(); regenerate({}); } }, 'Подобрать на неделю'),
      h('button', { class: 'btn', onclick: () => { save(); sh.close(); regenerate({ emptyOnly: true }); } }, 'Заполнить только пустые дни')), { full: true });
  }
  // one meal: parts with grams, swap, add side or sauce, lock
  function mealSheet(date, slot) {
    const load = () => store.all('SELECT * FROM plan WHERE deleted = 0 AND date = ? AND slot = ? ORDER BY CASE part WHEN \'main\' THEN 0 WHEN \'side\' THEN 1 ELSE 2 END', [date, slot]);
    const body = h('div', {});
    const [wd, dm] = dayName(date);
    const sh = sheet(`${F.SLOT_NAME[slot]} · ${wd}, ${dm}`, body, { onClose: render });
    const draw = () => {
      const rows = load();
      body.innerHTML = '';
      const block = h('div', { class: 'block' });
      for (const r of rows) {
        const i = F.partInfo(model, r);
        if (!i) continue;
        const step = r.part === 'sauce' ? 5 : 10;
        const setG = (g) => { store.upsert('plan', { id: r.id, grams: Math.max(step, g), locked: 1 }); draw(); };
        block.append(h('div', { class: 'part' },
          h('div', { class: 'pt', onclick: () => { if (i.r) { sh.close(); openRecipe(i.r.id); } } }, h('small', {}, { main: 'Блюдо', side: 'Гарнир', sauce: 'Соус' }[r.part]), h('b', {}, i.title), h('small', {}, `${kc(i.kcal)} ккал${i.r && i.r.health.score != null ? ' · полезность ' + F.fmtNum(i.r.health.score) : ''}`)),
          h('div', { class: 'stepper' }, h('button', { onclick: () => setG((r.grams || 0) - step) }, '−'), h('b', {}, `${Math.round(r.grams || 0)} г`), h('button', { onclick: () => setG((r.grams || 0) + step) }, '+')),
          h('button', { class: 'mbtn', 'aria-label': 'Заменить', html: I.reroll(), onclick: () => swapPart(date, slot, r.part, draw) }),
          r.part !== 'main' ? h('button', { class: 'mbtn', 'aria-label': 'Убрать', html: I.close(), onclick: () => { store.softDelete('plan', r.id); draw(); } }) : null));
      }
      body.append(block);
      const has = (p) => rows.some((r) => r.part === p);
      const locked = rows.some((r) => r.locked);
      body.append(h('div', { class: 'actions' },
        !has('side') ? h('button', { class: 'btn', onclick: () => swapPart(date, slot, 'side', draw) }, '+ Гарнир') : null,
        !has('sauce') ? h('button', { class: 'btn', onclick: () => swapPart(date, slot, 'sauce', draw) }, '+ Соус или подлива') : null,
        h('button', { class: 'btn', onclick: () => { store.batch(() => { for (const r of rows) store.upsert('plan', { id: r.id, locked: locked ? 0 : 1 }); }); draw(); } }, locked ? 'Открепить' : 'Закрепить'),
        h('button', { class: 'btn', onclick: () => { sh.close(); regenerate({ date, slot }); } }, 'Подобрать другое'),
        h('button', { class: 'btn', style: { color: 'var(--red)' }, onclick: () => { store.batch(() => { for (const r of rows) store.softDelete('plan', r.id); }); sh.close(); } }, 'Убрать приём пищи')));
      body.append(h('p', { class: 'hint', style: { padding: '0 16px' } }, 'Изменённые вручную граммы закрепляются, чтобы подбор их не трогал.'));
    };
    draw();
  }
  function swapPart(date, slot, part, after) {
    const s = S();
    const roleOk = part === 'main' ? ({ b: ['breakfast'], l: ['soup', 'main', 'salad'], d: ['main', 'salad', 'soup'], s: ['snack'] }[slot]) : part === 'side' ? ['side', 'salad'] : ['sauce'];
    const recs = [...model.R.values()].filter((r) => roleOk.includes(r.role) && F.passes(r.labels, s.filters, part !== 'main')).sort((a, b) => (b.health.score || 0) - (a.health.score || 0));
    const prods = part === 'main' ? (slot === 's' ? model.products.filter((p) => String(p.flags).includes('n')) : []) : model.products.filter((p) => String(p.flags).includes(part === 'side' ? 'g' : 's'));
    const q = h('input', { class: 'search', placeholder: 'Поиск', style: { margin: '0 16px 8px', width: 'calc(100% - 32px)' } });
    const listEl = h('div', { class: 'menu' });
    const pick = (o) => {
      const id = `${date}:${slot}:${part}`;
      store.upsert('plan', { id, date, slot, part, recipe_id: o.recipe_id || null, product_id: o.product_id || null, grams: 0, locked: 1, deleted: 0 });
      const rows = store.all('SELECT * FROM plan WHERE deleted = 0 AND date = ? AND slot = ?', [date, slot]);
      const split = s.split; const sum = s.slots.reduce((a, k) => a + (split[k] || 0), 0) || 1;
      const fresh = rows.map((r) => (r.part === part ? { ...r, locked: 0 } : r));
      F.portion(model, fresh, s.goal * (split[slot] || 0) / sum, fresh.filter((r) => r.locked && r.part !== part));
      store.batch(() => { for (const r of fresh) store.upsert('plan', { id: r.id, grams: r.grams }); });
      sh.close(); after && after();
    };
    const draw = () => {
      const t = F.norm(q.value);
      listEl.innerHTML = '';
      const rr = recs.filter((r) => !t || F.norm(r.title).includes(t)).slice(0, 60);
      for (const r of rr) listEl.append(h('button', { class: 'pickrow', onclick: () => pick({ recipe_id: r.id }) }, paint(h('div', { class: 'thumb' }), r), h('span', {}, r.title, h('small', {}, `${F.ROLE_NAME[r.role] || ''} · ${kc(r.nut.kpg * 100)} ккал/100 г`)), hsEl(r.health.score)));
      for (const p of prods.filter((p) => !t || F.norm(p.name).includes(t)).slice(0, 40)) listEl.append(h('button', { class: 'pickrow', onclick: () => pick({ product_id: p.id }) }, h('div', { class: 'thumb', style: { background: 'linear-gradient(150deg,#9bc7a5,#3f7d55)' } }, p.name.charAt(0)), h('span', {}, p.name, h('small', {}, `продукт · ${kc(p.kcal)} ккал/100 г`))));
      if (!listEl.children.length) listEl.append(h('div', { class: 'empty' }, 'Ничего не нашлось с текущими ограничениями.'));
    };
    q.oninput = draw;
    draw();
    const sh = sheet({ main: 'Выбрать блюдо', side: 'Выбрать гарнир', sauce: 'Выбрать соус или подливу' }[part], h('div', {}, q, listEl), { full: true });
  }

  // =====================================================================
  // RECIPES
  // =====================================================================
  const ROLE_FILTERS = [['', 'Все'], ['fav', 'Любимые'], ['breakfast', 'Завтраки'], ['soup', 'Супы'], ['main', 'Основные'], ['side', 'Гарниры'], ['sauce', 'Соусы'], ['salad', 'Салаты'], ['snack', 'Перекусы']];
  function renderRecipes(bar, list, fab) {
    header(bar, 'Рецепты', `${model.R.size} ${plural(model.R.size, 'рецепт', 'рецепта', 'рецептов')}`);
    const q = h('input', { class: 'search', placeholder: 'Поиск по названию или продукту', value: st.rq, type: 'search' });
    q.oninput = () => { st.rq = q.value; drawGrid(); };
    bar.append(h('div', { class: 'quick', style: { padding: '8px 0 0' } }, q));
    const roles = h('div', { class: 'chips', style: { padding: '4px 0 6px' } }, ROLE_FILTERS.map(([k, n]) => h('button', { class: 'fchip' + (st.role === k ? ' on' : ''), onclick: () => { st.role = k; render(); } }, n)));
    const fchips = h('div', { class: 'chips', style: { padding: '0 0 4px' } });
    const drawF = () => { fchips.innerHTML = ''; fchips.append(...filterChips(st.rfilters, filterNames(), () => { drawF(); drawGrid(); })); };
    drawF();
    bar.append(roles, fchips);
    const grid = h('div', { class: 'grid' });
    list.append(grid);
    function drawGrid() {
      grid.innerHTML = '';
      const t = F.norm(st.rq);
      const rs = [...model.R.values()].filter((r) => (!st.role || (st.role === 'fav' ? r.fav : r.role === st.role)) && F.passes(r.labels, st.rfilters)
        && (!t || F.norm(r.title).includes(t) || r.items.some((i) => F.norm(i.name).includes(t))))
        .sort((a, b) => (b.fav - a.fav) || a.title.localeCompare(b.title, 'ru'));
      if (!rs.length) { grid.append(h('div', { class: 'empty', style: { gridColumn: '1 / -1' } }, 'Ничего не нашлось.')); return; }
      for (const r of rs) {
        const lbl = r.labels.has('Пост') ? 'Пост' : r.labels.has('Рыба') ? 'Рыба' : r.labels.has('Птица') ? 'Птица' : r.labels.has('Мясо') ? 'Мясо' : null;
        grid.append(h('button', { class: 'rcard', onclick: () => openRecipe(r.id) }, paint(h('div', { class: 'ph' }), r),
          lbl ? h('span', { class: 'lbl' }, lbl) : null, hsEl(r.health.score),
          h('div', { class: 'cap' }, h('b', {}, r.title), h('small', {}, [r.time ? `${r.time} мин` : null, `${kc(r.nut.kcal / (r.servings || 1))} ккал/порц.`].filter(Boolean).join(' · ')))));
      }
    }
    drawGrid();
    fab.style.display = '';
    fab.innerHTML = I.plus();
    fab.onclick = () => editRecipe(null);
  }
  const plural = (n, a, b, c) => { const m = n % 10, k = n % 100; return m === 1 && k !== 11 ? a : m >= 2 && m <= 4 && (k < 10 || k >= 20) ? b : c; };
  function openRecipe(id) { st.recipeId = id; st.servings = null; renderDetail(); }
  function renderDetail() {
    const det = $('#detail');
    const r = st.recipeId && model.R.get(st.recipeId);
    det.classList.toggle('open', !!r);
    document.body.classList.toggle('has-detail', !!r);
    det.innerHTML = '';
    if (!r) { if (!threeMQ.matches) det.setAttribute('aria-hidden', 'true'); return; }
    det.removeAttribute('aria-hidden');
    const close = () => { st.recipeId = null; renderDetail(); };
    const serv = st.servings || r.servings || 2;
    const k = serv / (r.servings || 1);
    const hero = paint(h('div', { class: 'rv-hero' }), r, false);
    if (!r.photo) hero.append(h('div', { class: 'ph-art' }, r.title.charAt(0).toUpperCase()));
    hero.append(h('button', { class: 'rv-close', 'aria-label': 'Закрыть', html: I.close(20), onclick: close }),
      h('button', { class: 'rv-close rv-fav' + (r.fav ? ' on' : ''), 'aria-label': 'Любимое', html: I.heart(20, r.fav ? 'currentColor' : 'none'), onclick: () => { store.upsert('recipes', { id: r.id, fav: r.fav ? 0 : 1 }); } }));
    const per = r.nut.kcal / (r.servings || 1);
    const labels = [...r.labels];
    const body = h('div', { class: 'rv-body' },
      h('div', { class: 'rv-title' }, r.title),
      h('div', { class: 'rv-chips' }, h('span', { class: 'lchip' }, F.ROLE_NAME[r.role] || ''), labels.map((l) => h('span', { class: 'lchip ' + (l === 'Изжога' ? 'r' : ['Пост', 'Без изжоги', 'Быстро'].includes(l) ? 'g' : '') }, l === 'Изжога' ? 'Может вызвать изжогу' : l))),
      h('div', { class: 'stats' },
        h('div', { class: 'stat' }, h('b', {}, kc(per)), h('small', {}, 'ккал/порц.')),
        h('div', { class: 'stat' }, h('b', {}, kc(r.nut.kpg * 100)), h('small', {}, 'ккал/100 г')),
        h('div', { class: 'stat' }, h('b', {}, r.time ? `${r.time}′` : '—'), h('small', {}, 'минут')),
        h('div', { class: 'stat' }, h('b', { style: { color: { g: '#14a982', y: '#c9a000', o: '#e5484d', n: 'inherit' }[hsClass(r.health.score)] } }, r.health.score == null ? '—' : F.fmtNum(r.health.score)), h('small', {}, 'полезность'))),
      r.health.why.length ? h('div', { class: 'whybox' }, r.health.why.map(([s2, t]) => h('span', { class: s2 === '+' ? 'p' : 'm' }, t)), h('span', { class: 'hint', style: { margin: 0 } }, `На порцию: белки ${Math.round(r.nut.p / r.servings)} г, жиры ${Math.round(r.nut.f / r.servings)} г, углеводы ${Math.round(r.nut.c / r.servings)} г. Готовое блюдо около ${kc(r.nut.weight)} г.`)) : null,
      h('div', { class: 'block' },
        h('div', { class: 'block-head' }, h('span', {}, 'Ингредиенты'), h('div', { class: 'stepper' }, h('button', { onclick: () => { st.servings = Math.max(1, serv - 1); renderDetail(); } }, '−'), h('b', {}, `${serv} порц.`), h('button', { onclick: () => { st.servings = serv + 1; renderDetail(); } }, '+'))),
        r.items.map((i) => h('div', { class: 'ing' + (i.product_id ? '' : ' unk') }, h('span', {}, i.name), h('span', {}, i.qty == null ? 'по вкусу' : F.fmtQty(Math.round(i.qty * k * 100) / 100, i.unit))))),
      r.steps ? h('div', { class: 'block' }, h('div', { class: 'block-head' }, h('span', {}, 'Как готовить')), h('div', { class: 'steps' }, r.steps)) : null,
      r.source ? h('p', { class: 'hint', style: { padding: '0 18px 10px', overflowWrap: 'anywhere' } }, 'Источник: ', r.source) : null,
      h('div', { class: 'actions' },
        h('button', { class: 'btn primary', onclick: () => { const x = F.recipeForShopping(r, serv); addShopItems(F.shoppingFrom(model, [x]), 'recipe'); toast(`Добавлено в покупки: ${r.title}`, 'Открыть', () => { close(); go('shop'); }); render(); } }, 'Всё в список покупок'),
        h('button', { class: 'btn', onclick: () => addToMenu(r) }, 'В меню…'),
        h('button', { class: 'btn', onclick: () => editRecipe(r) }, 'Изменить'),
        h('button', { class: 'btn', style: { color: 'var(--red)' }, onclick: async () => { if (await confirmDlg(`Удалить «${r.title}»?`)) { store.softDelete('recipes', r.id); close(); } } }, 'Удалить')),
      h('div', { style: { height: 'calc(var(--safe-bot) + 30px)' } }));
    det.append(h('div', { class: 'd-scroll' }, hero, body));
  }
  async function addToMenu(r) {
    const dates = weekDates();
    const d = await choose('Какой день?', dates.map((x) => { const [wd, dm] = dayName(x); return { label: `${wd}, ${dm}`, value: x }; }));
    if (!d) return;
    const slotsOk = F.SLOTS.filter(([k]) => String(r.meals || 'ld').includes(k) || r.role === 'snack');
    const slot = await choose('Какой приём пищи?', (slotsOk.length ? slotsOk : F.SLOTS).map(([k, n]) => ({ label: n, value: k })));
    if (!slot) return;
    const part = r.role === 'side' ? 'side' : r.role === 'sauce' ? 'sauce' : 'main';
    const s = S(); const sum = s.slots.reduce((a, k) => a + (s.split[k] || 0), 0) || 1;
    store.upsert('plan', { id: `${d}:${slot}:${part}`, date: d, slot, part, recipe_id: r.id, product_id: null, grams: 0, locked: 1, deleted: 0 });
    const rows = store.all('SELECT * FROM plan WHERE deleted = 0 AND date = ? AND slot = ?', [d, slot]).map((x) => (x.part === part ? { ...x, locked: 0 } : x));
    F.portion(model, rows, s.goal * (s.split[slot] || 25) / sum, rows.filter((x) => x.locked));
    store.batch(() => { for (const x of rows) store.upsert('plan', { id: x.id, grams: x.grams }); });
    toast('Добавлено в меню', 'Открыть', () => { st.recipeId = null; go('menu'); });
  }
  function editRecipe(r, prefill) {
    const isNew = !r;
    r = r || { title: '', role: 'main', meals: 'ld', servings: 2, time: 30, steps: '', source: '', items: [], tagIds: [], needs_side: 0, needs_sauce: 0 };
    let photo = r.photo || null;
    const pick = h('label', { class: 'pick' }, h('span', {}, photo ? 'Сменить фото' : 'Добавить фото блюда'));
    const setPick = () => { if (photo) photoUrl(photo).then((u) => { if (u) pick.style.backgroundImage = `url("${u}")`; }); };
    setPick();
    const file = h('input', { type: 'file', accept: 'image/*' });
    file.onchange = async () => {
      const f = file.files[0]; if (!f) return;
      pick.firstChild.textContent = 'Обрабатываю…';
      try { const bytes = await resizeImage(f); photo = await Blobs.put(bytes); await Pending.add(photo); setPick(); pick.firstChild.textContent = 'Сменить фото'; } catch (e) { pick.firstChild.textContent = 'Не удалось прочитать фото'; }
    };
    pick.append(file);
    const title = h('input', { class: 'field', placeholder: 'Название', value: r.title, style: { fontWeight: '650' } });
    const role = h('select', { class: 'field' }, F.ROLES.map(([k, n]) => h('option', { value: k, selected: r.role === k ? true : null }, n)));
    const meals = new Set(String(r.meals || ''));
    const mealPills = h('div', { class: 'chips wrap' });
    const drawMeals = () => { mealPills.innerHTML = ''; mealPills.append(...F.SLOTS.map(([k, n]) => h('button', { class: 'fchip' + (meals.has(k) ? ' on' : ''), onclick: () => { meals.has(k) ? meals.delete(k) : meals.add(k); drawMeals(); } }, n))); };
    drawMeals();
    role.onchange = () => { const def = { breakfast: 'b', soup: 'l', main: 'ld', side: 'ld', sauce: 'ld', salad: 'ld', snack: 's', dessert: 's' }[role.value]; meals.clear(); for (const c of def) meals.add(c); drawMeals(); };
    const servings = h('input', { class: 'field', type: 'number', inputmode: 'numeric', value: r.servings, min: 1 });
    const time = h('input', { class: 'field', type: 'number', inputmode: 'numeric', value: r.time || '', placeholder: 'мин' });
    const ingText = r.items.map((i) => `${i.name}${i.qty != null ? ' ' + F.fmtQty(i.qty, i.unit) : ''}`).join('\n');
    const ing = h('textarea', { class: 'field', rows: 7, placeholder: 'По одному на строку:\nрис 500 г\nморковь 3 шт\nлук 2\nсоль по вкусу' });
    ing.value = prefill?.ingredients ?? ingText;
    const parsed = h('div', { class: 'parsed' });
    let items = [];
    const reparse = () => {
      const old = new Map(r.items.map((i) => [F.norm(i.name), i]));
      items = ing.value.split('\n').map((l) => F.parseLine(l, model.index)).filter(Boolean).map((p) => {
        const o = old.get(F.norm(p.name));
        return o && o.product_id && !p.product_id ? { ...p, product_id: o.product_id } : p;
      });
      parsed.innerHTML = '';
      let kcal = 0;
      for (const it of items) {
        const p = it.product_id && model.P.get(it.product_id);
        const g = F.itemGrams(it.qty, it.unit, p);
        if (p) kcal += p.kcal * g / 100;
        parsed.append(h('span', { class: p ? '' : 'unk', title: p ? `${p.name}: ${p.kcal} ккал/100 г` : 'Нет в справочнике: калории не посчитаются' }, `${it.name}${it.qty != null ? ' · ' + F.fmtQty(it.qty, it.unit) : ''}`));
      }
      if (items.length) parsed.append(h('span', { style: { background: 'none', color: 'var(--muted)' } }, `≈ ${kc(kcal / (Number(servings.value) || 1))} ккал на порцию`));
    };
    ing.oninput = reparse; servings.oninput = reparse;
    reparse();
    const steps = h('textarea', { class: 'field', rows: 5, placeholder: 'Как готовить' });
    steps.value = prefill?.steps ?? r.steps ?? '';
    const source = h('input', { class: 'field', placeholder: 'Ссылка на источник (необязательно)', value: prefill?.source ?? r.source ?? '' });
    if (prefill?.title) title.value = prefill.title;
    const tagSet = new Set(r.tagIds);
    const tagPills = h('div', { class: 'chips wrap' });
    const drawTags = () => { tagPills.innerHTML = ''; tagPills.append(...[...model.T.values()].map((t) => h('button', { class: 'fchip' + (tagSet.has(t.id) ? ' on' : ''), onclick: () => { tagSet.has(t.id) ? tagSet.delete(t.id) : tagSet.add(t.id); drawTags(); } }, t.name))); };
    drawTags();
    const sw = (on) => h('button', { class: 'switch' + (on ? ' on' : ''), onclick: (e) => e.currentTarget.classList.toggle('on') }, h('i'));
    const needSide = sw(r.needs_side), needSauce = sw(r.needs_sauce);
    const save = () => {
      if (!title.value.trim()) { title.focus(); toast('Напиши название'); return; }
      const id = store.saveRecipe({ id: r.id, title: title.value.trim(), role: role.value, meals: [...meals].join(''), servings: Number(servings.value) || 2, time: Number(time.value) || 0,
        steps: steps.value.trim(), source: source.value.trim(), photo, needs_side: needSide.classList.contains('on') ? 1 : 0, needs_sauce: needSauce.classList.contains('on') ? 1 : 0, out_g: r.out_g ?? null, fav: r.fav || 0 }, items, [...tagSet]);
      sh.close();
      openRecipe(id);
    };
    const sh = sheet(isNew ? 'Новый рецепт' : 'Рецепт', h('div', { class: 'form' },
      pick, title,
      h('div', { class: 'row2' }, h('div', {}, h('div', { class: 'lbl', style: { marginBottom: '6px' } }, 'Что это'), role), h('div', { class: 'row2' }, h('div', {}, h('div', { class: 'lbl', style: { marginBottom: '6px' } }, 'Порций'), servings), h('div', {}, h('div', { class: 'lbl', style: { marginBottom: '6px' } }, 'Минут'), time))),
      h('div', { class: 'lbl' }, 'Когда есть'), mealPills,
      h('div', { class: 'lbl' }, 'Ингредиенты'), ing, parsed,
      h('div', { class: 'lbl' }, 'Приготовление'), steps,
      h('div', { class: 'sg-card', style: { margin: 0 } }, h('div', { class: 'srow' }, h('span', {}, 'Подавать с гарниром'), needSide), h('div', { class: 'srow' }, h('span', {}, 'Нужен соус или подлива'), needSauce)),
      h('div', { class: 'lbl' }, 'Метки (пост, рыба и изжога ставятся сами по продуктам)'), tagPills,
      source,
      h('button', { class: 'btn primary', onclick: save }, 'Сохранить')), { full: true, right: h('button', { class: 'txt-btn', onclick: save }, 'Готово') });
    if (isNew && !prefill) setTimeout(() => title.focus(), 300);
  }

  // =====================================================================
  // MORE: goal, products, tags, sync, look
  // =====================================================================
  function renderMore(bar, list, fab) {
    if (st.page === 'products') return renderProducts(bar, list, fab);
    header(bar, 'Ещё');
    const s = S();
    const page = h('div', { class: 'settings' });
    const group = (title, ...kids) => h('div', { class: 'sgroup' }, title ? h('div', { class: 'sg-title' }, title) : null, h('div', { class: 'sg-card' }, kids));
    const num = (v, on) => { const i = h('input', { class: 'field num', type: 'number', inputmode: 'numeric', value: v }); i.onchange = () => on(Number(i.value)); return i; };
    page.append(group('Цель по калориям',
      h('div', { class: 'srow' }, h('span', {}, 'Ккал в день'), num(s.goal, (v) => { store.setSetting('goal', Math.max(800, Math.min(6000, v || 1900))); })),
      ...F.SLOTS.map(([k, n]) => h('div', { class: 'srow' }, h('span', {}, `${n}, % от дня`), num(s.split[k] ?? 0, (v) => { store.setSetting('split', { ...S().split, [k]: Math.max(0, Math.min(70, v || 0)) }); }))),
      h('div', { class: 'srow' }, h('span', {}, 'Едоков (для покупок)'), num(s.eaters, (v) => store.setSetting('eaters', Math.max(1, Math.min(12, v || 1))))),
      h('div', { class: 'spad' }, h('p', { class: 'hint' }, 'Подбор меню делит цель между приёмами пищи и считает граммы порций так, чтобы день уложился в цель. Если приём выключен, его доля делится между остальными.'))));
    page.append(group('Справочник',
      h('button', { class: 'srow btn-row', onclick: () => { st.page = 'products'; render(); } }, `Продукты и калории · ${model.products.length}`),
      h('button', { class: 'srow btn-row', onclick: editTags }, `Свои метки · ${model.T.size}`),
      h('button', { class: 'srow btn-row', onclick: () => loadCatalog(true) }, 'Проверить обновления справочника'),
      h('div', { class: 'spad' }, h('p', { class: 'hint' }, 'Справочник калорий и стартовые рецепты приходят с обновлениями программы. Твои правки не затираются: побеждает более свежее изменение.'))));
    page.append(syncGroup(group));
    const themeSeg = h('div', { class: 'seg' }, [['auto', 'Как в системе'], ['light', 'Светлая'], ['dark', 'Тёмная']].map(([v, l]) => h('button', { class: cfg.theme === v ? 'on' : '', onclick: () => { cfg.theme = v; saveCfg(); applyTheme(); render(); } }, l)));
    page.append(group('Оформление', h('div', { class: 'spad' }, themeSeg)));
    const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    page.append(group('Установка и «Поделиться»', h('div', { class: 'spad' },
      !standalone ? h('p', { class: 'hint' }, 'iPhone: в Safari «Поделиться» → «На экран Домой». Компьютер: программа SuperFood для Mac и Windows в папке SuperFood на рабочем столе.') : null,
      h('p', { class: 'hint' }, 'Рецепт из Safari или заметок: сделай быструю команду iOS «В SuperFood» (Команды → новая → «Получать: текст и URL из меню Поделиться» → «Открыть URL»: ', h('code', {}, location.origin + location.pathname + '?add=[Ввод быстрой команды]'), '). Она появится в меню «Поделиться» и откроет новый рецепт с этим текстом.'))));
    page.append(group('О программе', h('div', { class: 'srow' }, h('span', {}, 'Версия'), h('b', {}, `SuperFood ${VERSION}`)),
      h('div', { class: 'srow' }, h('span', {}, 'Рецептов'), h('b', {}, model.R.size)),
      h('button', { class: 'srow btn-row danger', onclick: resetLocal }, 'Стереть данные на этом устройстве')));
    list.append(page);
  }
  function syncGroup(group) {
    if (cfg.refreshToken) {
      return group('Синхронизация через Dropbox',
        h('div', { class: 'srow' }, h('span', {}, 'Аккаунт'), h('b', {}, cfg.account || 'подключён')),
        h('div', { class: 'srow' }, h('span', {}, 'Последняя'), h('b', {}, st.sync.running ? (st.sync.msg || 'идёт…') : cfg.lastSync ? new Date(cfg.lastSync).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'ещё не было')),
        cfg.lastError ? h('div', { class: 'srow err' }, cfg.lastError) : null,
        h('button', { class: 'srow btn-row', onclick: () => syncNow({ manual: true }) }, 'Синхронизировать сейчас'),
        h('button', { class: 'srow btn-row danger', onclick: async () => { if (await confirmDlg('Отключить Dropbox?', 'Отключить')) { delete cfg.refreshToken; delete cfg.account; delete cfg.syncState; delete cfg.lastError; dbx = null; saveCfg(); render(); } } }, 'Отключить Dropbox'));
    }
    const key = h('input', { class: 'field', placeholder: 'App key', value: cfg.appKey || '', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false' });
    const code = h('input', { class: 'field', placeholder: 'Код из Dropbox', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false' });
    const err = h('div', { class: 'srow err', style: { border: 0, padding: 0, minHeight: 0 } });
    const openBtn = h('a', { class: 'btn link-btn disabled', target: '_blank', rel: 'noopener', href: '#' }, '1. Открыть Dropbox и разрешить доступ');
    let seq = 0;
    const prep = async () => {
      const k = key.value.trim(); const my = ++seq;
      if (!k) { openBtn.classList.add('disabled'); openBtn.href = '#'; return; }
      const { url, verifier } = await startAuth(k);
      if (my !== seq) return;
      openBtn.href = url; openBtn.classList.remove('disabled'); openBtn.dataset.verifier = verifier;
    };
    key.oninput = prep; prep();
    openBtn.onclick = (e) => {
      if (openBtn.classList.contains('disabled')) { e.preventDefault(); err.textContent = 'Вставь App key.'; return; }
      cfg.appKey = key.value.trim(); cfg.verifier = openBtn.dataset.verifier; saveCfg();
      if (window.superfoodDesktop) { e.preventDefault(); window.superfoodDesktop.openExternal(openBtn.href); }
    };
    const connect = h('button', { class: 'btn primary', onclick: async () => {
      err.textContent = '';
      if (!cfg.verifier) { err.textContent = 'Сначала нажми «Открыть Dropbox».'; return; }
      if (!code.value.trim()) { err.textContent = 'Вставь код, который показал Dropbox.'; return; }
      connect.disabled = true; connect.textContent = 'Подключаю…';
      try {
        const { refreshToken } = await finishAuth(cfg.appKey, code.value, cfg.verifier);
        dbx = new Dropbox({ appKey: cfg.appKey, refreshToken });
        cfg.account = await dbx.account().catch(() => '');
        cfg.refreshToken = refreshToken; delete cfg.verifier; cfg.syncState = {};
        await saveCfg(); render(); syncNow({ manual: true });
      } catch (e) { err.textContent = e.message; connect.disabled = false; connect.textContent = '2. Подключить'; }
    } }, '2. Подключить');
    return group('Синхронизация через Dropbox', h('div', { class: 'spad' },
      h('p', { class: 'hint' }, 'Тот же App key, что в Органайзере (Органайзер → Настройки → Синхронизация → Dropbox). SuperFood хранит свою базу рядом, в файле superfood.db.gz, задачи Органайзера не трогает.'),
      key, openBtn, h('p', { class: 'hint' }, 'Dropbox покажет код. Скопируй его и вставь сюда:'), code, connect, err));
  }
  function renderProducts(bar, list, fab) {
    bar.append(h('div', { class: 'bar-row' }, h('button', { class: 'back', onclick: () => { st.page = null; render(); }, html: I.left() + ' Ещё' })), h('div', { class: 'bar-row' }, h('h1', {}, 'Продукты')));
    const q = h('input', { class: 'search', placeholder: 'Поиск', value: st.prodQ, type: 'search' });
    bar.append(h('div', { class: 'quick', style: { padding: '8px 0 0' } }, q));
    const box = h('div', {});
    list.append(box);
    const draw = () => {
      box.innerHTML = '';
      const t = F.norm(q.value); st.prodQ = q.value;
      const ps = model.products.filter((p) => !t || F.norm(p.name + ' ' + p.aliases).includes(t));
      let lastDept = null;
      for (const p of [...ps].sort((a, b) => F.DEPTS.findIndex((d) => d[0] === a.dept) - F.DEPTS.findIndex((d) => d[0] === b.dept) || a.name.localeCompare(b.name, 'ru'))) {
        if (p.dept !== lastDept) { box.append(h('div', { class: 'dept' }, F.DEPT_NAME[p.dept] || p.dept)); lastDept = p.dept; }
        box.append(h('div', { class: 'prod', onclick: () => editProduct(p) }, h('span', {}, p.name, h('small', {}, `Б ${F.fmtNum(p.protein)} · Ж ${F.fmtNum(p.fat)} · У ${F.fmtNum(p.carbs)}${String(p.flags).includes('g') ? ' · гарнир' : ''}${String(p.flags).includes('s') ? ' · соус' : ''}`)), h('b', {}, `${kc(p.kcal)} ккал`)));
      }
    };
    q.oninput = draw; draw();
    fab.style.display = ''; fab.innerHTML = I.plus(); fab.onclick = () => editProduct(null);
  }
  function editProduct(p) {
    const isNew = !p;
    p = p || { name: '', aliases: '', dept: 'oth', kcal: 0, protein: 0, fat: 0, carbs: 0, piece_g: 0, yield: 1, diet: 'v', flags: '', quality: 0 };
    const f = (v, ph, num = true) => h('input', { class: 'field', value: v ?? '', placeholder: ph, inputmode: num ? 'decimal' : null });
    const name = f(p.name, 'Название', false), aliases = f(p.aliases, 'Другие названия через запятую', false);
    const kcal = f(p.kcal, 'ккал'), pr = f(p.protein, 'белки'), fa = f(p.fat, 'жиры'), ca = f(p.carbs, 'углеводы'), piece = f(p.piece_g || '', 'вес 1 шт, г'), yl = f(p.yield, 'выход после варки');
    const dept = h('select', { class: 'field' }, F.DEPTS.filter(([k]) => k !== 'home').map(([k, n]) => h('option', { value: k, selected: p.dept === k ? true : null }, n)));
    const diet = h('select', { class: 'field' }, [['v', 'Постное (растительное)'], ['f', 'Рыба и морепродукты'], ['c', 'Птица'], ['m', 'Мясо'], ['d', 'Молочное'], ['e', 'Яйца']].map(([k, n]) => h('option', { value: k, selected: p.diet === k ? true : null }, n)));
    const flags = new Set(String(p.flags));
    const fl = h('div', { class: 'chips wrap' });
    const drawFl = () => { fl.innerHTML = ''; fl.append(...[['g', 'Гарнир'], ['s', 'Соус'], ['n', 'Перекус'], ['b', 'Обычно есть дома'], ['h', 'Может вызвать изжогу']].map(([k, n]) => h('button', { class: 'fchip' + (flags.has(k) ? ' on' : ''), onclick: () => { flags.has(k) ? flags.delete(k) : flags.add(k); drawFl(); } }, n))); };
    drawFl();
    const quality = h('select', { class: 'field' }, [[2, 'Очень полезно'], [1, 'Полезно'], [0, 'Нейтрально'], [-1, 'Лучше пореже'], [-2, 'Вредно']].map(([k, n]) => h('option', { value: k, selected: Number(p.quality) === k ? true : null }, n)));
    const n = (el) => Number(String(el.value).replace(',', '.')) || 0;
    const save = () => {
      if (!name.value.trim()) return;
      store.upsert('products', { id: p.id || 'u-' + uid(), name: name.value.trim(), aliases: aliases.value.trim(), dept: dept.value, kcal: n(kcal), protein: n(pr), fat: n(fa), carbs: n(ca), piece_g: n(piece), yield: n(yl) || 1, diet: diet.value, flags: [...flags].join(''), quality: Number(quality.value), deleted: 0 });
      sh.close(); render();
    };
    const L = (t) => h('div', { class: 'lbl' }, t);
    const sh = sheet(isNew ? 'Новый продукт' : p.name, h('div', { class: 'form' }, name, aliases,
      L('На 100 г: ккал, белки, жиры, углеводы'), h('div', { class: 'row2' }, kcal, pr), h('div', { class: 'row2' }, fa, ca),
      L('Вес 1 шт (г) и выход после варки (гречка 2,5; мясо 0,7)'), h('div', { class: 'row2' }, piece, yl),
      L('Отдел магазина'), dept, L('Тип для поста'), diet, L('Пометки'), fl, L('Полезность'), quality,
      h('button', { class: 'btn primary', onclick: save }, 'Сохранить'),
      !isNew ? h('button', { class: 'btn', style: { color: 'var(--red)' }, onclick: async () => { if (await confirmDlg(`Удалить «${p.name}»?`)) { store.softDelete('products', p.id); sh.close(); render(); } } }, 'Удалить') : null), { full: true });
  }
  async function editTags() {
    const tags = [...model.T.values()];
    const v = await choose('Свои метки', [...tags.map((t) => ({ label: t.name, value: t.id, hint: 'изменить' })), { label: '+ Новая метка', value: '+' }]);
    if (!v) return;
    const t = v === '+' ? { id: 't-' + uid(), name: '', color: '#14a982', sort: tags.length } : model.T.get(v);
    const name = h('input', { class: 'field', value: t.name, placeholder: 'Например: Детям' });
    const sh = sheet(v === '+' ? 'Новая метка' : t.name, h('div', { class: 'form' }, name,
      h('button', { class: 'btn primary', onclick: () => { if (name.value.trim()) store.upsert('tags', { id: t.id, name: name.value.trim(), color: t.color, sort: t.sort, deleted: 0 }); sh.close(); } }, 'Сохранить'),
      v !== '+' ? h('button', { class: 'btn', style: { color: 'var(--red)' }, onclick: () => { store.softDelete('tags', t.id); sh.close(); } }, 'Удалить') : null));
  }
  async function resetLocal() {
    if (!(await confirmDlg('Стереть данные на этом устройстве?', 'Стереть'))) return;
    if (cfg.refreshToken && store.isDirty() && !(await confirmDlg('Есть изменения, которые ещё не ушли в Dropbox. Всё равно стереть?', 'Стереть'))) return;
    await IDB.del('kv', 'db'); await IDB.del('kv', 'cfg');
    location.reload();
  }

  // ---------- catalog (products with calories, starter recipes) ----------
  const strHash = (s) => { let x = 0; for (let i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) | 0; return String(x); };
  async function loadCatalog(manual = false) {
    try {
      const [tsv, json] = await Promise.all([fetch('data/products.tsv', { cache: 'no-cache' }).then((r) => r.text()), fetch('data/recipes.json', { cache: 'no-cache' }).then((r) => r.text())]);
      const sig = strHash(tsv) + ':' + strHash(json);
      if (!manual && store.meta('catalog_sig') === sig) return;
      const n = store.applyCatalog(Catalog.parseProducts(tsv), Catalog.parseRecipes(JSON.parse(json)), Catalog.tagRows(1795788000000));
      store.meta('catalog_sig', sig);
      if (manual) toast(n ? `Справочник обновлён: ${n} изменений` : 'Справочник уже свежий');
    } catch (e) { if (manual) toast('Не удалось загрузить справочник: ' + e.message); }
  }

  // ---------- sync (as in Organizer) ----------
  function getDbx() { if (!dbx && cfg.refreshToken) dbx = new Dropbox({ appKey: cfg.appKey, refreshToken: cfg.refreshToken }); return dbx; }
  let syncTimer = null;
  async function syncNow({ manual = false } = {}) {
    if (!cfg.refreshToken) return;
    if (st.sync.running) { st.sync.again = true; return; }
    if (!navigator.onLine && !manual) return;
    st.sync = { running: true, msg: 'Синхронизация…' };
    for (const b of document.querySelectorAll('.sync-btn')) b.classList.add('running');
    try {
      const res = await sync(store, getDbx(), cfg.syncState || {}, (msg) => { st.sync.msg = msg; });
      cfg.syncState = res.state; cfg.lastSync = Date.now(); delete cfg.lastError;
      if (manual) toast(res.skipped ? 'Всё уже синхронизировано' : res.taken ? `Синхронизировано: получено изменений ${res.taken}` : 'Синхронизировано');
    } catch (e) { cfg.lastError = e.message; if (manual) toast(e.message, null, null, 6000); }
    const again = st.sync.again;
    st.sync = { running: false };
    await saveCfg();
    rebuildModel(); render();
    if (again) syncNow();
  }
  const scheduleSync = (ms = 4000) => { clearTimeout(syncTimer); syncTimer = setTimeout(() => syncNow(), ms); };

  // ---------- "?add=" from the iOS share shortcut ----------
  function handleIncoming() {
    const u = new URL(location.href);
    const text = u.searchParams.get('add');
    if (!text) return;
    history.replaceState(null, '', u.pathname);
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    const url = lines.find((l) => /^https?:\/\//i.test(l));
    const rest = lines.filter((l) => l !== url);
    const title = rest.length && !F.parseLine(rest[0], model.index)?.qty ? rest.shift() : '';
    const ingLines = rest.filter((l) => l.length < 60);
    const stepLines = rest.filter((l) => l.length >= 60);
    cfg.view = 'recipes';
    render();
    editRecipe(null, { title, ingredients: ingLines.join('\n'), steps: stepLines.join('\n'), source: url || '' });
  }

  // ---------- start ----------
  async function start() {
    try {
      cfg = Object.assign(cfg, (await IDB.get('kv', 'cfg')) || {});
      applyTheme();
      store = await Store.open();
      await loadCatalog();
      rebuildModel();
      let rebuildTimer = null;
      store.onChange((local) => {
        clearTimeout(rebuildTimer);
        rebuildTimer = setTimeout(() => { rebuildModel(); render(); }, 30);
        if (local) scheduleSync();
      });
      render();
      document.getElementById('app').classList.add('ready');
      handleIncoming();
      wideMQ.addEventListener('change', render);
      threeMQ.addEventListener('change', render);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow(); });
      window.addEventListener('online', () => syncNow());
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && st.recipeId && !document.querySelector('.sheet-wrap.open')) { st.recipeId = null; renderDetail(); } });
      syncNow();
      if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
    } catch (e) {
      console.error(e);
      document.body.append(h('div', { class: 'fatal' }, h('b', {}, 'SuperFood не запустился'), h('p', {}, e.message)));
    }
  }
  start();
  window.__sf = { get store() { return store; }, get model() { return model; }, regenerate, go };
})();
