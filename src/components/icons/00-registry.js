/* Icons: the complete Orion Admin icon set (24x24 grid, 2px round strokes, currentColor).
 *   Files 10-..80- register icons per category with reg(category, { name: '<path .../>' }).
 *   99-meta.js adds everything in one O.icons.add() call and publishes:
 *     O.icons.categories  { Navigation: ['arrow-up', ...], ... }
 *     O.icons.aliases     { close: 'x', delete: 'trash', ... }  (registered as duplicates)
 *     O.icons.search(q), O.icons.resolve(name), O.icons.alias(name, target), O.icons.names()
 */
const SET = Object.create(null);   // name -> markup (new + refined icons)
const CATS = Object.create(null);  // category -> [names]
/** reg('Category', { name: markup }) — new or refined icons */
function reg(cat, map) {
  Object.assign(SET, map);
  const list = CATS[cat] || (CATS[cat] = []);
  for (const k of Object.keys(map)) if (!list.includes(k)) list.push(k);
}
/** tag('Category', ['core-name', ...]) — categorise icons that already exist in core */
function tag(cat, names) {
  const list = CATS[cat] || (CATS[cat] = []);
  for (const k of names) if (!list.includes(k)) list.push(k);
}
