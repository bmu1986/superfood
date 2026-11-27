const fs = require('fs'); const path = require('path');
require('../js/food.js'); require('../js/catalog.js');
const products = Catalog.parseProducts(fs.readFileSync(path.join(__dirname, '../data/products.tsv'), 'utf8'));
const recs = Catalog.parseRecipes(JSON.parse(fs.readFileSync(path.join(__dirname, '../data/recipes.json'), 'utf8')));
const tags = Catalog.tagRows(1);
const items = []; const rt = [];
for (const r of recs) { r.items.forEach((it, i) => items.push({ id: r.id + i, recipe_id: r.id, product_id: it[0], name: it[1], qty: it[2], unit: it[3], sort: i })); for (const t of r.tags) rt.push({ recipe_id: r.id, tag_id: t }); }
const model = Food.buildModel({ products, recipes: recs, items, tags, recipeTags: rt });
for (const r of model.R.values()) console.log(r.title.padEnd(36), Math.round(r.nut.kcal / r.servings), 'kcal/порц', (r.nut.kpg * 100).toFixed(0) + '/100г', 'H', r.health.score, [...r.labels].join(','));
const idx = model.index;
for (const l of ['рис 500 г', '2 ст. л. масла растительного', 'лук 2', 'соль по вкусу', '1/2 лимона', 'Морковь — 3 шт', 'филе куриное 600 г', 'яйца 3', '- Мука: 200 г', 'молоко 2', 'сметана', 'чеснок 3 зубчика', 'помидоры черри 200 г']) console.log(l, '=>', JSON.stringify(Food.parseLine(l, idx)));
const dates = Food.weekDates(Food.weekStart(new Date(2026, 11, 1)));
for (const f of [{}, { 'Пост': 'need' }, { 'Пост с рыбой': 'need', 'Без изжоги': 'need' }]) {
  const plan = Food.planWeek(model, { dates, slots: ['b', 'l', 'd', 's'], target: 1900, filters: f, seed: 42 });
  console.log('\nFILTER', JSON.stringify(f), plan.length);
  for (const d of dates.slice(0, 3)) {
    const rows = plan.filter((r) => r.date === d);
    const st = Food.dayStats(model, rows, 1900);
    console.log(d, Math.round(st.kcal), 'H', st.health.score, st.health.why.map((w) => w.join('')).join('; '));
    for (const r of rows) { const i = Food.partInfo(model, r); console.log('  ', r.slot, r.part, i.title, r.grams, Math.round(i.kcal)); }
  }
  const shop = Food.shoppingFrom(model, plan.map((r) => Food.partInfo(model, r)).map((i) => ({ ...i, raw: i.raw.map(([p, g, it]) => [p, g * 2, it]) })));
  if (!f['Пост']) console.log(shop.slice(0, 25).map((s) => `${s.name} ${s.qty ?? ''}${s.unit} [${s.dept}]`).join(' | '));
}
