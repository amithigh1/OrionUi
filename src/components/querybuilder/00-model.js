/* <o-query-builder> — shared tree model: field/operator metadata, node constructors, validation.
 * Tree shape:
 *   Group = { id, type:'group', op:'and'|'or', not, children: Node[] }
 *   Rule  = { id, type:'rule', field, operator, value, not }
 */
i18n.add('en', {
  querybuilder: {
    and: 'and', or: 'or', not: 'not', where: 'Where', matchAll: 'Match all', matchAny: 'Match any',
    addRule: 'Add rule', addGroup: 'Add group', duplicate: 'Duplicate', remove: 'Remove', value: 'Value',
    field: 'Field', operator: 'Operator', selectField: 'Select field…', selectOperator: 'Select operator…',
    days: 'days', emptyGroup: 'This group is empty — add a rule or a group.', invalid: 'Incomplete rule', removed: 'Removed', freeText: 'Text',
    sql: 'SQL', mongo: 'Mongo', sentence: 'Sentence', barPlaceholder: 'status:active age>30 "exact phrase" -excluded',
    switchToBuilder: 'Switch to builder', switchToBar: 'Switch to search bar', highlightDiff: 'Highlight differences',
    moveUp: 'Move up', moveDown: 'Move down', dragToReorder: 'Drag to reorder',
    op: {
      equals: 'is', notEquals: 'is not', contains: 'contains', notContains: 'does not contain',
      startsWith: 'starts with', endsWith: 'ends with', isEmpty: 'is empty', isNotEmpty: 'is not empty', matchesRegex: 'matches regex',
      eq: '=', ne: '≠', lt: '<', lte: '≤', gt: '>', gte: '≥', between: 'is between', notBetween: 'is not between',
      on: 'is on', before: 'is before', after: 'is after', inLastNDays: 'in the last', thisWeek: 'is this week',
      thisMonth: 'is this month', thisYear: 'is this year', isTrue: 'is true', isFalse: 'is false',
      in: 'is any of', notIn: 'is none of', containsAny: 'contains any of', containsAll: 'contains all of', containsNone: 'contains none of',
    },
  },
});

/* [operator, arity] — arity: 0 no value, 1 single value, 2 a [from, to] pair, 'list' an array of values */
const QB_OPERATORS = {
  text: [['equals', 1], ['notEquals', 1], ['contains', 1], ['notContains', 1], ['startsWith', 1], ['endsWith', 1], ['isEmpty', 0], ['isNotEmpty', 0], ['matchesRegex', 1]],
  number: [['eq', 1], ['ne', 1], ['lt', 1], ['lte', 1], ['gt', 1], ['gte', 1], ['between', 2], ['notBetween', 2]],
  date: [['on', 1], ['before', 1], ['after', 1], ['between', 2], ['inLastNDays', 1], ['thisWeek', 0], ['thisMonth', 0], ['thisYear', 0]],
  boolean: [['isTrue', 0], ['isFalse', 0]],
  select: [['in', 'list'], ['notIn', 'list']],
  array: [['containsAny', 'list'], ['containsAll', 'list'], ['containsNone', 'list']],
};
const QB_KIND = { 0: 'none', 1: 'single', 2: 'pair', list: 'list' };

/** operators for a field type -> [{ value, kind, label }] (labels follow the current locale) */
function qbOperators(type) {
  return (QB_OPERATORS[type] || QB_OPERATORS.text).map(([value, arity]) => ({ value, kind: QB_KIND[arity], label: t('querybuilder.op.' + value) }));
}
function qbValueKind(type, operator) { const op = (QB_OPERATORS[type] || QB_OPERATORS.text).find(o => o[0] === operator); return op ? QB_KIND[op[1]] : 'single'; }
/** '_text' is the reserved free-text field the search-bar parser targets for bare/quoted terms —
 * it always resolves even when the caller's `fields` list doesn't declare it. */
function qbField(fields, key) {
  const f = toArr(fields).find(x => x.key === key);
  if (f) return f;
  return key === '_text' ? { key: '_text', type: 'text', label: t('querybuilder.freeText') } : null;
}
function qbDefaultOperator(type) { return (QB_OPERATORS[type] || QB_OPERATORS.text)[0][0]; }

function qbRule(overrides = {}) { return { id: uid('qbr'), type: 'rule', field: '', operator: '', value: null, not: false, ...overrides }; }
function qbGroup(overrides = {}) { return { id: uid('qbg'), type: 'group', op: 'and', not: false, children: [], ...overrides }; }
/** Ensure every node has an id/shape (used for value= set from outside, JSON attrs, fromJSON()). */
function qbNormalize(node) {
  if (!node || !isObj(node)) return qbGroup();
  if (node.type === 'rule') return { id: node.id || uid('qbr'), type: 'rule', field: node.field || '', operator: node.operator || '', value: node.value ?? null, not: !!node.not };
  return { id: node.id || uid('qbg'), type: 'group', op: node.op === 'or' ? 'or' : 'and', not: !!node.not, children: toArr(node.children).map(qbNormalize) };
}
/** Is this rule's value complete for its operator (ignoring whether the field/operator themselves are chosen)? */
function qbRuleValid(rule, fields) {
  const f = qbField(fields, rule.field);
  if (!f || !rule.operator) return false;
  const kind = qbValueKind(f.type, rule.operator);
  if (kind === 'none') return true;
  if (kind === 'pair') return Array.isArray(rule.value) && rule.value[0] != null && rule.value[0] !== '' && rule.value[1] != null && rule.value[1] !== '';
  if (kind === 'list') return Array.isArray(rule.value) && rule.value.length > 0;
  return rule.value != null && rule.value !== '';
}
/** Whole-tree validity: every rule (with at least one operator chosen) must be complete. Empty groups are valid no-ops. */
function qbTreeValid(node, fields) {
  if (!node) return true;
  if (node.type === 'group') return node.children.every(c => qbTreeValid(c, fields));
  return qbRuleValid(node, fields);
}
function qbCountRules(node) {
  if (!node) return 0;
  if (node.type === 'rule') return 1;
  return node.children.reduce((n, c) => n + qbCountRules(c), 0);
}
/** depth-first walk; visit(node, parent, path) */
function qbWalk(node, visit, parent = null, path = []) {
  visit(node, parent, path);
  if (node.type === 'group') node.children.forEach((c, i) => qbWalk(c, visit, node, [...path, i]));
}
function qbFindParent(root, id) {
  let found = null;
  qbWalk(root, (node, parent) => { if (node.id === id) found = parent; });
  return found;
}
function qbFind(root, id) {
  let found = null;
  qbWalk(root, node => { if (node.id === id) found = node; });
  return found;
}
/** Deep clone with brand-new ids throughout (for duplicate). */
function qbCloneFresh(node) {
  if (node.type === 'rule') return { ...clone(node), id: uid('qbr') };
  return { ...clone(node), id: uid('qbg'), children: node.children.map(qbCloneFresh) };
}
