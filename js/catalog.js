// Reads the starter catalog (data/products.tsv, data/recipes.json) into database rows.
(function (root) {
  const NUM = ['kcal', 'protein', 'fat', 'carbs', 'piece_g', 'yield', 'quality'];
  function parseProducts(tsv) {
    const lines = tsv.replace(/\r/g, '').split('\n').filter(Boolean);
    const head = lines.shift().split('\t');
    return lines.map((l) => {
      const c = l.split('\t');
      const o = Object.fromEntries(head.map((h, i) => [h, c[i] ?? '']));
      const row = { id: o.id, name: o.name, aliases: o.aliases, dept: o.dept, diet: o.diet || 'v', flags: o.flags || '', updated_at: Number(o.updated), deleted: o.deleted === '1' ? 1 : 0 };
      if (o.photo_url) row.photo_url = o.photo_url;
      for (const k of NUM) row[k] = Number(String(o[k]).replace(',', '.')) || 0;
      if (!row.yield) row.yield = 1;
      return row;
    });
  }
  const TAGS = [
    ['t-bystro', 'Быстро', '#14a982'], ['t-izzhoga', 'Изжога', '#e5484d'],
    ['t-ostroe', 'Острое', '#d9432b'], ['t-detyam', 'Детям', '#a06cd5'], ['t-prazdnik', 'Праздничное', '#3b82f6'],
  ];
  // «Без изжоги» is gone since 0.3: heartburn is only a red mark, its absence means none
  function tagRows(t) { return [...TAGS.map(([id, name, color], i) => ({ id, name, color, sort: i, updated_at: t, deleted: 0 })), { id: 't-bez-izzhogi', name: 'Без изжоги', color: '#f4a259', sort: 9, updated_at: 1795802900000, deleted: 1 }]; }
  function parseRecipes(list) {
    const byName = Object.fromEntries(TAGS.map(([id, name]) => [name, id]));
    return list.map((r) => ({
      id: r.id, title: r.title, role: r.role, meals: r.meals, servings: r.servings, time: r.time, out_g: r.out_g || null,
      needs_side: r.needs_side ? 1 : 0, needs_sauce: r.needs_sauce ? 1 : 0, steps: r.steps || '', source: '', photo: null, fav: 0,
      created_at: r.updated, updated_at: r.updated, deleted: 0,
      items: r.items, tags: (r.tags || []).map((n) => byName[n]).filter(Boolean),
    }));
  }
  const DEPTS = [['veg', 'Овощи и зелень'], ['fru', 'Фрукты и ягоды'], ['mea', 'Мясо и птица'], ['fis', 'Рыба и морепродукты'], ['dai', 'Молочное и яйца'],
    ['gro', 'Крупы, макароны, бобовые'], ['bre', 'Хлеб'], ['bak', 'Бакалея'], ['can', 'Консервы'], ['sau', 'Соусы и специи'], ['nut', 'Орехи и сухофрукты'],
    ['frz', 'Заморозка'], ['drk', 'Напитки'], ['oth', 'Другое']];
  function deptRows(t) { return DEPTS.map(([id, name], i) => ({ id, name, sort: i, updated_at: t, deleted: 0 })); }
  root.Catalog = { parseProducts, parseRecipes, tagRows, deptRows, TAGS, DEPTS };
})(typeof window !== 'undefined' ? window : globalThis);
