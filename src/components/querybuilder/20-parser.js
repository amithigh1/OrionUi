/* <o-query-builder> — compact search-bar query language.
 *   status:active age>30 "exact phrase" -excluded
 * `key:value` / `key>value` / `key>=value` / `key<value` / `key<=value` / `key!=value` become a rule
 * against that field (operator chosen from the field's type when `fields` is known, else text
 * defaults); a bare word or "quoted phrase" becomes a free-text `contains` rule on field `_text`;
 * a leading `-` negates the token. All conditions are AND-joined at the top level.
 */
/** Tokenize only (no field-type awareness) -> [{ field, op, value, not }] with op one of : > >= < <= !=
 * Supports a quoted value right after the operator (key:"quoted value") as well as bare/quoted
 * free-text terms (which get field '_text'); a leading "-" on any token negates it. */
function qbParseQueryString(input) {
  const conditions = [];
  const re = /(-)?(?:([A-Za-z_][\w.]*)(:|>=|<=|!=|>|<)(?:"([^"]*)"|'([^']*)'|(\S+))|"([^"]*)"|'([^']*)'|(\S+))/g;
  let m;
  while ((m = re.exec(String(input || '')))) {
    const not = !!m[1];
    if (m[2] != null) { conditions.push({ field: m[2], op: m[3], value: m[4] != null ? m[4] : m[5] != null ? m[5] : m[6], not }); continue; }
    const text = m[7] != null ? m[7] : m[8] != null ? m[8] : m[9];
    if (text) conditions.push({ field: '_text', op: ':', value: text, not });
  }
  return conditions;
}
function qbSymbolOperator(type, symbol) {
  switch (type) {
    case 'number': return { ':': 'eq', '!=': 'ne', '>': 'gt', '>=': 'gte', '<': 'lt', '<=': 'lte' }[symbol] || 'eq';
    case 'date': return { ':': 'on', '!=': 'on', '>': 'after', '>=': 'after', '<': 'before', '<=': 'before' }[symbol] || 'on';
    case 'select': return { ':': 'in', '!=': 'notIn' }[symbol] || 'in';
    case 'array': return { ':': 'containsAny', '!=': 'containsNone' }[symbol] || 'containsAny';
    default: return { ':': 'equals', '!=': 'notEquals' }[symbol] || 'equals';
  }
}
/** A parsed condition -> a concrete Rule, resolving the operator against `fields` (optional). */
function qbConditionToRule(cond, fields) {
  if (cond.field === '_text') return qbRule({ field: '_text', operator: 'contains', value: cond.value, not: cond.not });
  const f = qbField(fields, cond.field);
  const type = f ? f.type : 'text';
  let value = cond.value, not = cond.not, operator;
  if (type === 'boolean') { operator = /^(false|0|no)$/i.test(String(value)) ? 'isFalse' : 'isTrue'; value = null; }
  else {
    operator = qbSymbolOperator(type, cond.op);
    if (cond.op === '!=' && type === 'date') not = !not;
    if (type === 'number') value = Number(value);
    if (type === 'select' || type === 'array') value = String(value).split(',').map(s => s.trim()).filter(Boolean);
  }
  return qbRule({ field: cond.field, operator, value, not });
}
/** Parse the whole search-bar string into a (flat, AND-joined) Group tree — the same shape as the builder's `value`. */
function qbParseToTree(input, fields) {
  const root = qbGroup({ op: 'and' });
  root.children = qbParseQueryString(input).map(c => qbConditionToRule(c, fields));
  return root;
}
/** The inverse (best-effort): a flat AND-of-rules tree -> a search-bar string. Nested/OR groups fall back to toString(). */
function qbTreeToQueryString(tree, fields) {
  if (tree.type !== 'group' || tree.op !== 'and' || tree.not || tree.children.some(c => c.type === 'group')) return qbToString(tree, fields);
  return tree.children.map(r => {
    if (r.field === '_text') { const v = /\s/.test(String(r.value || '')) ? `"${r.value}"` : r.value; return (r.not ? '-' : '') + v; }
    const sym = { equals: ':', notEquals: '!=', eq: ':', ne: '!=', gt: '>', gte: '>=', lt: '<', lte: '<=', on: ':', in: ':', notIn: '!=', containsAny: ':', containsNone: '!=' }[r.operator] || ':';
    const val = Array.isArray(r.value) ? r.value.join(',') : (r.value == null ? '' : r.value);
    return (r.not ? '-' : '') + r.field + sym + val;
  }).join(' ');
}
