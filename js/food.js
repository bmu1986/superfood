// SuperFood logic without UI: units, ingredient parsing, nutrition, dish labels, health score,
// weekly menu planner and shopping-list building. Pure functions over a Model built from the database.
(function (root) {
  const DEPTS = [
    ['veg', 'Овощи и зелень'], ['fru', 'Фрукты и ягоды'], ['mea', 'Мясо и птица'], ['fis', 'Рыба и морепродукты'],
    ['dai', 'Молочное и яйца'], ['gro', 'Крупы, макароны, бобовые'], ['bre', 'Хлеб'], ['bak', 'Бакалея'],
    ['can', 'Консервы'], ['sau', 'Соусы и специи'], ['nut', 'Орехи и сухофрукты'], ['frz', 'Заморозка'],
    ['drk', 'Напитки'], ['oth', 'Другое'], ['home', 'Проверь, есть ли дома'],
  ];
  const DEPT_NAME = Object.fromEntries(DEPTS);
  const SLOTS = [['b', 'Завтрак'], ['l', 'Обед'], ['d', 'Ужин'], ['s', 'Перекус']];
  const SLOT_NAME = Object.fromEntries(SLOTS);
  const ROLES = [['breakfast', 'Завтрак'], ['soup', 'Суп'], ['main', 'Основное блюдо'], ['side', 'Гарнир'], ['sauce', 'Соус или подлива'], ['salad', 'Салат'], ['snack', 'Перекус'], ['dessert', 'Десерт']];
  const ROLE_NAME = Object.fromEntries(ROLES);
  const DEFAULT_SPLIT = { b: 25, l: 35, d: 30, s: 10 };

  // ---------- units ----------
  const UNIT_G = { 'г': 1, 'кг': 1000, 'мл': 1, 'л': 1000, 'ст.л.': 15, 'ч.л.': 5, 'щепотка': 1, 'зубчик': 5, 'головка': 50, 'кусок': 30, 'стакан': 200, 'пучок': 30, 'банка': 400, 'уп.': 0 };
  function itemGrams(qty, unit, p) {
    const q = Number(qty);
    if (!isFinite(q) || q <= 0) return 0;
    if (unit === 'шт' || !unit) return q * ((p && p.piece_g) || (unit === 'шт' ? 100 : 0));
    if (unit === 'банка') return q * ((p && p.piece_g) || 400);
    if (unit === 'пучок') return q * ((p && p.piece_g) || 30);
    if (unit === 'уп.') return q * ((p && p.piece_g) || 500);
    return q * (UNIT_G[unit] ?? 0);
  }
  const fmtNum = (n) => { const r = Math.round(n * 10) / 10; return String(r).replace('.', ','); };
  function fmtQty(qty, unit) {
    if (qty == null || qty === '') return unit || '';
    if (unit === 'г' && qty >= 1000) return `${fmtNum(qty / 1000)} кг`;
    if (unit === 'мл' && qty >= 1000) return `${fmtNum(qty / 1000)} л`;
    const frac = { 0.5: '½', 0.25: '¼', 0.75: '¾' }[qty];
    return `${frac || fmtNum(qty)}${unit ? ' ' + unit : ''}`;
  }

  // ---------- text normalisation and product search ----------
  const norm = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9%,. ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const stem = (w) => (w.length > 5 ? w.slice(0, w.length > 7 ? 5 : 4) : w.replace(/[аяыиуюео]$/, ''));
  function productIndex(products) {
    const list = products.map((p) => {
      const names = [p.name, ...String(p.aliases || '').split(',')].map(norm).filter(Boolean);
      return { p, names, stems: names.map((n) => n.split(' ').filter((w) => w.length > 1).map(stem)) };
    });
    return {
      find(text) {
        const t = norm(text);
        if (!t) return null;
        for (const e of list) if (e.names.includes(t)) return e.p;
        const words = t.split(' ').filter((w) => w.length > 1 && !/^\d/.test(w)).map(stem);
        if (!words.length) return null;
        let best = null, bestScore = 0;
        for (const e of list) {
          for (const ns of e.stems) {
            if (!ns.length) continue;
            const hit = ns.filter((s) => words.some((w) => w.startsWith(s) || s.startsWith(w))).length;
            if (!hit) continue;
            // all words of the product name should be present; the first word of the text matters most
            const score = hit + hit / ns.length + (words[0] && (words[0].startsWith(ns[0]) || ns[0].startsWith(words[0])) ? 0.5 : 0) - ns.length * 0.01;
            if (hit === ns.length && score > bestScore) { bestScore = score; best = e.p; }
          }
        }
        return best;
      },
      search(text, n = 20) {
        const t = norm(text);
        if (!t) return [];
        return list.filter((e) => e.names.some((x) => x.includes(t))).slice(0, n).map((e) => e.p);
      },
    };
  }

  // ---------- ingredient line parsing: "рис 500 г", "2 ст. л. масла", "лук 2", "соль по вкусу" ----------
  const UNIT_RE = [
    [/^кг\.?$|^килограмм\w*/, 'кг'], [/^г\.?$|^гр\.?$|^грамм\w*/, 'г'], [/^мл\.?$|^миллилитр\w*/, 'мл'], [/^л\.?$|^литр\w*/, 'л'],
    [/^шт\.?\w*/, 'шт'], [/^ст\.?л\.?$|^столов\w*/, 'ст.л.'], [/^ч\.?л\.?$|^чайн\w*/, 'ч.л.'], [/^стакан\w*/, 'стакан'],
    [/^зубч\w*/, 'зубчик'], [/^пуч\w*/, 'пучок'], [/^щепот\w*/, 'щепотка'], [/^банк\w*/, 'банка'], [/^головк\w*/, 'головка'],
    [/^кус\w*/, 'кусок'], [/^уп\w*/, 'уп.'], [/^пач\w*/, 'уп.'],
  ];
  const NUM = String.raw`(\d+\s*\/\s*\d+|\d+(?:[.,]\d+)?|½|¼|¾)`;
  const toNum = (s) => {
    s = s.replace(/\s/g, '');
    if (s === '½') return 0.5; if (s === '¼') return 0.25; if (s === '¾') return 0.75;
    if (s.includes('/')) { const [a, b] = s.split('/').map(Number); return b ? a / b : null; }
    return Number(s.replace(',', '.'));
  };
  function unitOf(word) {
    const w = String(word || '').toLowerCase().replace(/\s+/g, '');
    for (const [re, u] of UNIT_RE) if (re.test(w)) return u;
    return null;
  }
  function parseLine(line, index) {
    let s = String(line || '').replace(/^[\s•\-–—*·\d.)]+(?=[^\d\s.,/])/, (m) => (/\d/.test(m) && !/[).]\s*$/.test(m) ? m : '')).trim();
    s = s.replace(/^[•\-–—*·]\s*/, '').trim();
    if (!s) return null;
    let qty = null, unit = '';
    const tasteRe = /\s*(по вкусу|для подачи|по желанию)\s*/i;
    const toTaste = tasteRe.test(s);
    s = s.replace(tasteRe, ' ');
    // qty + unit anywhere: "500 г", "2 ст. л.", "1/2"
    const re = new RegExp(NUM + String.raw`\s*((?:ст|ч)\.?\s*л\.?|[a-zа-яё.]+)?`, 'i');
    const m = s.match(re);
    let name = s;
    if (m) {
      qty = toNum(m[1]);
      const u = m[2] ? unitOf(m[2]) : null;
      unit = u || '';
      const cut = u ? m[0] : m[1];
      name = (s.slice(0, m.index) + ' ' + s.slice(m.index + cut.length)).trim();
    }
    name = name.replace(/[:–—\-,(]+\s*$/, '').replace(/^\s*[:–—\-,]+/, '').replace(/\s+/g, ' ').trim();
    if (!name) return null;
    const p = index ? index.find(name) : null;
    if (qty != null && !unit && p && p.piece_g) unit = 'шт';
    if (toTaste && qty == null) { qty = null; unit = ''; }
    return { name: p && norm(name).length < p.name.length + 4 ? p.name : cap(name), qty, unit, product_id: p ? p.id : null };
  }
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  // ---------- model ----------
  // Built from the database rows; recipes get their items, tags, nutrition, labels and health score.
  function buildModel({ products, recipes, items, tags, recipeTags }) {
    const P = new Map(products.map((p) => [p.id, p]));
    const T = new Map(tags.map((t) => [t.id, t]));
    const byRecipe = new Map();
    for (const it of items) { if (!byRecipe.has(it.recipe_id)) byRecipe.set(it.recipe_id, []); byRecipe.get(it.recipe_id).push(it); }
    const tagsBy = new Map();
    for (const rt of recipeTags) { if (!T.has(rt.tag_id)) continue; if (!tagsBy.has(rt.recipe_id)) tagsBy.set(rt.recipe_id, []); tagsBy.get(rt.recipe_id).push(rt.tag_id); }
    const R = new Map();
    for (const r of recipes) {
      const its = (byRecipe.get(r.id) || []).sort((a, b) => a.sort - b.sort).map((it) => {
        const p = it.product_id ? P.get(it.product_id) : null;
        return { ...it, p, g: itemGrams(it.qty, it.unit, p) };
      });
      const rec = { ...r, items: its, tagIds: tagsBy.get(r.id) || [] };
      rec.nut = nutrition(its.map((i) => [i.p, i.g]), r.out_g);
      rec.labels = labelsFor(rec, T);
      rec.health = health(its.map((i) => [i.p, i.g]), rec.nut);
      R.set(r.id, rec);
    }
    return { P, R, T, products, index: productIndex(products) };
  }

  // parts: [[product, grams]]; cooked weight from out_g or each product's cooked yield
  function nutrition(parts, outG) {
    let kcal = 0, p = 0, f = 0, c = 0, raw = 0, cooked = 0;
    for (const [pr, g] of parts) {
      if (!g) continue;
      raw += g;
      cooked += g * ((pr && pr.yield) || 1);
      if (!pr) continue;
      kcal += pr.kcal * g / 100; p += pr.protein * g / 100; f += pr.fat * g / 100; c += pr.carbs * g / 100;
    }
    const weight = outG || cooked || raw;
    return { kcal, p, f, c, raw, weight, kpg: weight ? kcal / weight : 0 };
  }

  const AUTO = ['Пост', 'Пост с рыбой', 'Вегетарианское', 'Рыба', 'Птица', 'Мясо', 'Изжога'];
  const STRICT = new Set(['Пост', 'Пост с рыбой', 'Вегетарианское']);
  function labelsFor(rec, T) {
    const diets = new Set();
    let hb = false;
    for (const i of rec.items) {
      if (!i.p) continue;
      diets.add(i.p.diet);
      // heartburn is a plain mark: one marked product makes the whole dish «Изжога»
      if (String(i.p.flags).includes('h')) hb = true;
    }
    const out = new Set();
    const animal = ['m', 'c', 'f', 'd', 'e'].some((d) => diets.has(d));
    if (!animal) { out.add('Пост'); out.add('Пост с рыбой'); }
    if (diets.has('f') && !['m', 'c', 'd', 'e'].some((d) => diets.has(d))) out.add('Пост с рыбой');
    if (!diets.has('m') && !diets.has('c') && !diets.has('f')) out.add('Вегетарианское');
    if (diets.has('f')) out.add('Рыба');
    if (diets.has('c')) out.add('Птица');
    if (diets.has('m')) out.add('Мясо');
    const manual = rec.tagIds.map((id) => T.get(id)).filter(Boolean).map((t) => t.name);
    for (const m of manual) if (m !== 'Без изжоги') out.add(m);
    if (hb) out.add('Изжога');
    return out;
  }
  function productLabels(p) {
    const out = new Set();
    if (p.diet === 'v') { out.add('Пост'); out.add('Пост с рыбой'); out.add('Вегетарианское'); }
    if (p.diet === 'f') { out.add('Пост с рыбой'); out.add('Рыба'); }
    if (p.diet === 'd' || p.diet === 'e') out.add('Вегетарианское');
    if (p.diet === 'c') out.add('Птица');
    if (p.diet === 'm') out.add('Мясо');
    if (String(p.flags).includes('h')) out.add('Изжога');
    return out;
  }

  // ---------- health score 1..10 with reasons ----------
  const SUGARY = /сахар|мёд|мед$|сгущ|шоколад|мармелад|пастил|варенье|сироп|сырок/i;
  function health(parts, nut) {
    nut = nut || nutrition(parts);
    let qg = 0, g = 0, veg = 0, sugarK = 0;
    for (const [p, gr] of parts) {
      if (!p || !gr || String(p.flags).includes('w')) continue;
      g += gr; qg += (p.quality || 0) * gr;
      if (p.dept === 'veg' || p.dept === 'fru' || (p.dept === 'frz' && p.quality >= 2)) veg += gr;
      if (SUGARY.test(p.name)) sugarK += p.kcal * gr / 100;
    }
    if (!g || !nut.kcal) return { score: null, why: [] };
    const why = [];
    const q = qg / g;
    let s = 5 + q * 1.4;
    if (q >= 1.2) why.push(['+', 'полезные продукты']); else if (q <= -0.5) why.push(['−', 'много переработанного или жирного']);
    const vs = veg / g;
    if (vs >= 0.4) { s += 1; why.push(['+', 'много овощей']); } else if (vs >= 0.2) s += 0.5;
    const pp = nut.p * 4 / nut.kcal, fp = nut.f * 9 / nut.kcal, sp = sugarK / nut.kcal;
    if (pp >= 0.2) { s += 0.8; why.push(['+', 'много белка']); } else if (pp >= 0.15) s += 0.4; else if (pp < 0.08) { s -= 0.7; why.push(['−', 'мало белка']); }
    if (fp > 0.45) { s -= 1; why.push(['−', 'жирно']); } else if (fp > 0.35) s -= 0.4;
    if (sp > 0.15) { s -= 1.2; why.push(['−', 'много сахара']); } else if (sp > 0.08) { s -= 0.5; why.push(['−', 'есть сахар']); }
    const dens = nut.weight ? nut.kcal / nut.weight * 100 : 0;
    if (dens > 300) { s -= 0.8; why.push(['−', 'очень калорийно']); } else if (dens > 200) s -= 0.3; else if (dens && dens < 90) { s += 0.3; why.push(['+', 'лёгкое']); }
    return { score: Math.max(1, Math.min(10, Math.round(s * 2) / 2)), why };
  }

  // ---------- menu: plan rows → parts with nutrition ----------
  function partInfo(model, row) {
    if (row.recipe_id) {
      const r = model.R.get(row.recipe_id);
      if (!r) return null;
      const k = r.nut.weight ? (row.grams || 0) / r.nut.weight : 0;
      return { title: r.title, r, grams: row.grams, kcal: r.nut.kcal * k, p: r.nut.p * k, f: r.nut.f * k, c: r.nut.c * k,
        raw: r.items.map((i) => [i.p, i.g * k, i]) };
    }
    const p = model.P.get(row.product_id);
    if (!p) return null;
    const rawG = (row.grams || 0) / (p.yield || 1);
    return { title: p.name, p, grams: row.grams, kcal: p.kcal * rawG / 100, p_: p, p: p.protein * rawG / 100, f: p.fat * rawG / 100, c: p.carbs * rawG / 100, raw: [[p, rawG, null]] };
  }
  function dayStats(model, rows, target) {
    let kcal = 0, p = 0, f = 0, c = 0;
    const parts = [];
    const vegSet = new Set();
    for (const row of rows) {
      const info = partInfo(model, row);
      if (!info) continue;
      kcal += info.kcal; p += info.p; f += info.f; c += info.c;
      for (const [pr, g] of info.raw) { parts.push([pr, g]); if (pr && (pr.dept === 'veg' || pr.dept === 'fru') && g >= 20) vegSet.add(pr.id); }
    }
    const h = health(parts, { kcal, p, f, c, weight: 0 });
    if (h.score != null) {
      let s = h.score;
      if (vegSet.size >= 6) { s += 0.5; h.why.push(['+', `${vegSet.size} разных овощей и фруктов`]); }
      if (target && Math.abs(kcal - target) / target > 0.15) { s -= 0.7; h.why.push(['−', kcal > target ? 'больше цели по калориям' : 'меньше цели по калориям']); }
      h.score = Math.max(1, Math.min(10, Math.round(s * 2) / 2));
    }
    return { kcal, p, f, c, health: h };
  }

  // ---------- planner ----------
  function rng(seed) { let s = (seed % 2147483646) + 1; return () => (s = s * 16807 % 2147483647) / 2147483647; }
  const dietOf = (r) => (r.labels.has('Рыба') ? 'f' : r.labels.has('Мясо') ? 'm' : r.labels.has('Птица') ? 'c' : 'v');
  function passes(labels, filters, strictOnly) {
    for (let [name, mode] of Object.entries(filters || {})) {
      if (name === 'Без изжоги') { if (mode !== 'need') continue; name = 'Изжога'; mode = 'skip'; } // filters saved by 0.1–0.2
      if (strictOnly && mode === 'need' && !STRICT.has(name)) continue;
      if (mode === 'need' && !labels.has(name)) return false;
      if (mode === 'skip' && labels.has(name)) return false;
    }
    return true;
  }
  const SLOT_ROLES = { b: ['breakfast'], l: ['soup', 'main'], d: ['main'], s: ['snack'] };
  const LIMITS = { main: [80, 500, 10], soup: [250, 500, 10], side: [50, 300, 10], sauce: [15, 80, 5], snack: [30, 300, 10], bread: [30, 60, 10] };
  const clampRound = (v, [lo, hi, st]) => Math.round(Math.max(lo, Math.min(hi, v)) / st) * st;

  // opts: { dates:[iso], slots:['b','l','d','s'], target, split, filters, history:[rows before], keep:[rows locked], seed, only:{date,slot} }
  function planWeek(model, opts) {
    const rand = rng(opts.seed || 1);
    const split = opts.split || DEFAULT_SPLIT;
    const slots = opts.slots;
    const sum = slots.reduce((a, s) => a + (split[s] || 0), 0) || 1;
    const budget = (s) => (opts.target || 2000) * (split[s] || 0) / sum;
    const recipes = [...model.R.values()].filter((r) => !r.deleted);
    const used = new Map(); // recipe id -> [day index]
    const dayIdx = new Map(opts.dates.map((d, i) => [d, i]));
    for (const h of opts.history || []) if (h.part === 'main' && h.recipe_id) {
      const di = h.date < opts.dates[0] ? -1 - Math.max(0, Math.round((Date.parse(opts.dates[0]) - Date.parse(h.date)) / 864e5) - 1) : dayIdx.get(h.date);
      if (di == null) continue;
      if (!used.has(h.recipe_id)) used.set(h.recipe_id, []);
      used.get(h.recipe_id).push(di);
    }
    const chosenProducts = new Map();
    const remember = (r) => { for (const i of r.items) if (i.p && !/[bw]/.test(i.p.flags)) chosenProducts.set(i.p.id, (chosenProducts.get(i.p.id) || 0) + 1); };
    const keep = new Map((opts.keep || []).map((k) => [`${k.date}:${k.slot}:${k.part}`, k]));
    const out = [];
    let lastSide = null;
    // dishes cooked for several days (recipe.days): slot -> { left, parts } to repeat as «доедаем»
    const carry = new Map();
    const first = opts.dates[0];
    for (const hr of [...(opts.history || [])].sort((a, b) => (a.date < b.date ? -1 : 1))) {
      if (hr.part !== 'main' || !hr.recipe_id || hr.leftover || hr.date >= first) continue;
      const r = model.R.get(hr.recipe_id);
      const gap = Math.round((Date.parse(first) - Date.parse(hr.date)) / 864e5);
      if (r && (r.days || 1) > gap) carry.set(hr.slot, { left: (r.days || 1) - gap, parts: opts.history.filter((x) => x.date === hr.date && x.slot === hr.slot && !x.leftover).map((x) => ({ part: x.part, recipe_id: x.recipe_id, product_id: x.product_id })) });
      else if (carry.has(hr.slot)) carry.delete(hr.slot);
    }
    opts.dates.forEach((date, di) => {
      let prevDiet = null;
      for (const slot of slots) {
        if (opts.only && (opts.only.date !== date || (opts.only.slot && opts.only.slot !== slot))) continue;
        const key = (part) => `${date}:${slot}:${part}`;
        const kept = ['main', 'side', 'sauce'].map((p) => keep.get(key(p))).filter(Boolean);
        if (kept.find((k) => k.part === 'main')) { out.push(...kept); carry.delete(slot); continue; }
        const B = budget(slot);
        const c = !opts.only && carry.get(slot);
        if (c) {
          // the same dish again: cooked earlier for several days
          const rows = c.parts.map((x) => ({ date, slot, part: x.part, recipe_id: x.recipe_id || null, product_id: x.product_id || null, leftover: 1 }));
          portion(model, rows, B, []);
          out.push(...rows.map((r) => ({ ...r, locked: 0 })));
          const m = c.parts.find((x) => x.part === 'main');
          if (m && m.recipe_id) { if (!used.has(m.recipe_id)) used.set(m.recipe_id, []); used.get(m.recipe_id).push(di); }
          if (--c.left <= 0) carry.delete(slot);
          continue;
        }
        // main
        const roles = SLOT_ROLES[slot];
        let cands = recipes.filter((r) => roles.includes(r.role) && String(r.meals || '').includes(slot) && passes(r.labels, opts.filters) && r.nut.kcal > 0);
        if (cands.length < 2 && (slot === 'l' || slot === 'd')) cands = cands.concat(recipes.filter((r) => ['main', 'soup', 'salad'].includes(r.role) && !cands.includes(r) && passes(r.labels, opts.filters) && r.nut.kcal > 0));
        let main = null, mainProduct = null, best = -1e9;
        for (const r of cands) {
          const u = used.get(r.id) || [];
          let s = (u.filter((x) => x >= 0).length >= 2 ? -2 : 0) + rand() * 1.0 + (r.health.score || 5) / 10 * 0.6 + (r.fav ? 0.4 : 0);
          for (const x of u) s -= Math.abs(di - x) <= 2 ? 1.5 : 0.8;
          if (prevDiet && dietOf(r) === prevDiet && slot !== 'b') s -= 0.4;
          // dishes that cannot fill this meal's calories even at the largest portion lose points
          const lim = servingLimit(r, r.role === 'soup' ? LIMITS.soup : r.role === 'snack' ? LIMITS.snack : LIMITS.main);
          const room = r.nut.kpg * lim[1] + (r.needs_side ? B * 0.3 : 0) + (r.role === 'soup' ? 120 : 0);
          if (room < B * 0.85) s -= 0.9 * (1 - room / B);
          let shared = 0; for (const i of r.items) if (i.p && chosenProducts.has(i.p.id)) shared++;
          s += Math.min(0.4, shared * 0.08);
          if (s > best) { best = s; main = r; }
        }
        if (!main && slot === 's') {
          const snacks = model.products.filter((p) => String(p.flags).includes('n') && passes(productLabels(p), opts.filters, true) && p.kcal > 0);
          if (snacks.length) mainProduct = snacks[Math.floor(rand() * snacks.length)];
        }
        if (!main && !mainProduct) continue;
        const rows = [];
        if (main) {
          if (!used.has(main.id)) used.set(main.id, []);
          used.get(main.id).push(di);
          remember(main);
          prevDiet = slot !== 'b' ? dietOf(main) : prevDiet;
          rows.push({ date, slot, part: 'main', recipe_id: main.id, product_id: null });
          // side
          const side = kept.find((k) => k.part === 'side') || (main.needs_side ? pickSide(model, recipes, opts.filters, rand, lastSide) : null);
          if (side) { rows.push({ date, slot, part: 'side', ...side }); lastSide = side.recipe_id || side.product_id; }
          else if (main.role === 'soup') {
            const bread = model.P.get('p-hleb-rzhanoy');
            if (bread && passes(productLabels(bread), opts.filters, true)) rows.push({ date, slot, part: 'side', recipe_id: null, product_id: bread.id });
          }
          const sauce = kept.find((k) => k.part === 'sauce') || (main.needs_sauce ? pickSauce(model, recipes, opts.filters, rand) : null);
          if (sauce) rows.push({ date, slot, part: 'sauce', ...sauce });
        } else rows.push({ date, slot, part: 'main', recipe_id: null, product_id: mainProduct.id });
        portion(model, rows, B, kept);
        out.push(...rows.map((r) => ({ ...r, locked: kept.find((k) => k.part === r.part) ? 1 : 0, grams: r.grams })));
        if (main && (main.days || 1) > 1 && !opts.only) carry.set(slot, { left: main.days - 1, parts: rows.map((x) => ({ part: x.part, recipe_id: x.recipe_id, product_id: x.product_id })) });
      }
      if (!opts.only) {
        const T = opts.target || 2000;
        let day = out.filter((r) => r.date === date);
        balanceDay(model, day, T);
        // still short (light lenten food hits the portion limits): add a side where there is none
        for (const slot of ['d', 'l']) {
          if (dayKcal(model, day) >= T * 0.92) break;
          const main = day.find((r) => r.slot === slot && r.part === 'main' && r.recipe_id);
          if (!main || main.locked || day.some((r) => r.slot === slot && r.part === 'side')) continue;
          if (model.R.get(main.recipe_id).role === 'soup') continue;
          const side = pickSide(model, recipes, opts.filters, rand, lastSide);
          if (!side) continue;
          const row = { date, slot, part: 'side', ...side, locked: 0, grams: 150 };
          out.push(row); day.push(row);
          balanceDay(model, day, T);
        }
      }
    });
    return out;
  }
  function pickSide(model, recipes, filters, rand, avoid) {
    const opts = [];
    for (const r of recipes) if (r.role === 'side' && passes(r.labels, filters, true) && r.nut.kcal > 0) opts.push({ recipe_id: r.id, product_id: null, w: (r.health.score || 5) / 10 });
    for (const p of model.products) if (String(p.flags).includes('g') && ['veg', 'frz'].includes(p.dept) && p.kcal > 0 && passes(productLabels(p), filters, true)) opts.push({ recipe_id: null, product_id: p.id, w: 0.45 });
    let best = null, bs = -1;
    for (const o of opts) { const s = rand() + o.w - ((o.recipe_id || o.product_id) === avoid ? 1 : 0); if (s > bs) { bs = s; best = o; } }
    return best && { recipe_id: best.recipe_id, product_id: best.product_id };
  }
  const NOT_GRAVY = /тахини|горчиц|хрен|соев|кокос|бальзам|хумус/i;
  function pickSauce(model, recipes, filters, rand) {
    const opts = [];
    for (const r of recipes) if (r.role === 'sauce' && String(r.meals || '').length && passes(r.labels, filters, true)) opts.push({ recipe_id: r.id, product_id: null });
    for (const p of model.products) if (String(p.flags).includes('s') && !NOT_GRAVY.test(p.name) && passes(productLabels(p), filters, true) && (p.quality || 0) >= 0) opts.push({ recipe_id: null, product_id: p.id });
    return opts.length ? opts[Math.floor(rand() * opts.length)] : null;
  }
  // Portions hit their limits, so a day can miss the goal: stretch or shrink the free portions toward it.
  function limitsOf(model, r) {
    if (r.recipe_id) { const rec = model.R.get(r.recipe_id); return servingLimit(rec, r.part === 'main' ? (rec.role === 'soup' ? LIMITS.soup : rec.role === 'snack' ? LIMITS.snack : LIMITS.main) : LIMITS[r.part]); }
    return r.part === 'main' ? LIMITS.snack : r.product_id === 'p-hleb-rzhanoy' ? LIMITS.bread : LIMITS[r.part];
  }
  // a portion stays between half and one and a half of the recipe's own serving
  function servingLimit(rec, [lo, hi, step]) {
    const sw = rec.nut.weight / (rec.servings || 1);
    if (!sw) return [lo, hi, step];
    const h2 = Math.max(lo, Math.min(hi, Math.round(sw * 1.5 / step) * step));
    return [Math.min(Math.max(lo, Math.round(sw * 0.5 / step) * step), h2), h2, step];
  }
  function dayKcal(model, rows) { let k = 0; for (const r of rows) { const i = partInfo(model, r); if (i) k += i.kcal; } return k; }
  function balanceDay(model, rows, target) {
    for (let pass = 0; pass < 3; pass++) {
      let kcal = 0;
      for (const r of rows) { const i = partInfo(model, r); if (i) kcal += i.kcal; }
      if (!kcal || Math.abs(kcal - target) / target < 0.05) return;
      const k = Math.max(0.7, Math.min(1.4, target / kcal));
      for (const r of rows) if (!r.locked && r.part !== 'sauce') r.grams = clampRound(r.grams * k, limitsOf(model, r));
    }
  }
  // Split the slot's calorie budget between main, side and sauce and turn it into grams.
  function portion(model, rows, B, kept = []) {
    const has = (p) => rows.some((r) => r.part === p);
    const shares = has('side') && has('sauce') ? { main: 0.62, side: 0.28, sauce: 0.1 } : has('side') ? { main: 0.68, side: 0.32 } : has('sauce') ? { main: 0.88, sauce: 0.12 } : { main: 1 };
    for (const r of rows) {
      const k = kept.find((x) => x.part === r.part);
      if (k && k.grams) { r.grams = k.grams; continue; }
      let kpg, lim;
      if (r.recipe_id) { const rec = model.R.get(r.recipe_id); kpg = rec.nut.kpg; lim = servingLimit(rec, r.part === 'main' ? (rec.role === 'soup' ? LIMITS.soup : rec.role === 'snack' ? LIMITS.snack : LIMITS.main) : LIMITS[r.part]); }
      else { const p = model.P.get(r.product_id); kpg = p.kcal / 100 / (p.yield || 1); lim = r.part === 'main' ? LIMITS.snack : p.id === 'p-hleb-rzhanoy' ? LIMITS.bread : LIMITS[r.part]; }
      r.grams = kpg > 0 ? clampRound(B * (shares[r.part] || 0.1) / kpg, lim) : lim[0];
    }
    return rows;
  }

  // ---------- shopping ----------
  // entries: [{recipe|product, grams cooked or factor}] → aggregated list of {product_id, name, qty, unit, dept, sources}
  function shoppingFrom(model, parts) {
    const acc = new Map();
    for (const { raw, title } of parts) {
      for (const [p, g, it] of raw) {
        if (!g && !(it && it.qty == null)) continue;
        if (p && String(p.flags).includes('w')) continue;
        const key = p ? p.id : norm(it ? it.name : '');
        if (!acc.has(key)) acc.set(key, { product_id: p ? p.id : null, name: p ? p.name : it.name, g: 0, pcs: false, ml: false, dept: p ? (String(p.flags).includes('b') ? 'home' : p.dept) : 'oth', sources: new Set(), free: [] });
        const a = acc.get(key);
        a.g += g || 0;
        if (it && it.unit === 'шт') a.pcs = true;
        if (it && (it.unit === 'мл' || it.unit === 'л')) a.ml = true;
        if (!p && it) a.free.push(it);
        if (title) a.sources.add(title);
      }
    }
    return [...acc.values()].map((a) => {
      const p = a.product_id ? model.P.get(a.product_id) : null;
      let qty = null, unit = '';
      if (a.dept === 'home') { qty = null; unit = ''; }
      else if (p && a.pcs && p.piece_g) { qty = Math.ceil(a.g / p.piece_g - 0.15) || 1; unit = 'шт'; }
      else if (a.g) { const step = a.g >= 1000 ? 100 : a.g >= 200 ? 50 : 10; qty = Math.ceil(a.g / step) * step; unit = a.ml ? 'мл' : 'г'; }
      else if (a.free.length) { qty = a.free[0].qty; unit = a.free[0].unit; }
      return { product_id: a.product_id, name: a.name, qty, unit, dept: a.dept, note: [...a.sources].join(', ') };
    });
  }
  function recipeForShopping(rec, servings) {
    const k = rec.servings ? servings / rec.servings : 1;
    return { title: rec.title, raw: rec.items.map((i) => [i.p, i.g * k, { ...i, qty: i.qty == null ? null : i.qty * k }]) };
  }

  // ---------- dates ----------
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const fromIso = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  function weekStart(d = new Date()) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
  function weekDates(start) { return Array.from({ length: 7 }, (_, i) => { const x = new Date(start); x.setDate(x.getDate() + i); return iso(x); }); }

  root.Food = { DEPTS, DEPT_NAME, SLOTS, SLOT_NAME, ROLES, ROLE_NAME, DEFAULT_SPLIT, AUTO, STRICT, itemGrams, fmtQty, fmtNum, norm,
    productIndex, parseLine, unitOf, buildModel, nutrition, health, labelsFor, productLabels, partInfo, dayStats, planWeek, portion, passes,
    pickSide, pickSauce, balanceDay, shoppingFrom, recipeForShopping, iso, fromIso, weekStart, weekDates, LIMITS };
})(typeof window !== 'undefined' ? window : globalThis);
