/* <o-query-builder> — output builders: toSQL (parameterized), toMongo, toString, toPredicate. */
const __esc_like = s => String(s).replace(/[\\%_]/g, c => '\\' + c);
const __esc_regex = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Declared text-type fields — what a `_text` (free-text) rule searches across. */
const qbTextFields = fields => toArr(fields).filter(f => f.type === 'text');

/* ── SQL (parameterized — values are always bound as params, never concatenated) ─────────── */
function qbToSQL(tree, fields, { dialect = 'ansi' } = {}) {
  const params = [];
  const quote = name => (dialect === 'mysql' ? '`' + name + '`' : `"${name}"`);
  const bind = v => { params.push(v); return dialect === 'postgres' ? '$' + params.length : '?'; };
  function buildGroup(node) {
    const parts = node.children.map(build).filter(Boolean);
    if (!parts.length) return '';
    const joined = parts.length > 1 ? parts.join(node.op === 'or' ? ' OR ' : ' AND ') : parts[0];
    const wrapped = parts.length > 1 ? `(${joined})` : joined;
    return node.not ? `NOT (${wrapped})` : wrapped;
  }
  function buildFreeText(rule) {
    if (rule.value == null || rule.value === '') return '';
    const cols = qbTextFields(fields);
    if (!cols.length) { const expr = `${quote('_text')} LIKE ${bind('%' + __esc_like(rule.value) + '%')}`; return rule.not ? `NOT (${expr})` : expr; }
    const parts = cols.map(f => `${quote(f.key)} LIKE ${bind('%' + __esc_like(rule.value) + '%')}`);
    const joined = parts.length > 1 ? `(${parts.join(' OR ')})` : parts[0];
    return rule.not ? `NOT ${joined}` : joined;
  }
  function buildRule(rule) {
    if (rule.field === '_text') return buildFreeText(rule);
    const f = qbField(fields, rule.field);
    if (!f || !rule.operator) return '';
    if (qbValueKind(f.type, rule.operator) !== 'none' && !qbRuleValid(rule, fields)) return '';
    const col = quote(rule.field);
    let expr = '1=1';
    switch (rule.operator) {
      case 'equals': case 'eq': case 'on': expr = `${col} = ${bind(rule.value)}`; break;
      case 'notEquals': case 'ne': expr = `${col} <> ${bind(rule.value)}`; break;
      case 'contains': expr = `${col} LIKE ${bind('%' + __esc_like(rule.value) + '%')}`; break;
      case 'notContains': expr = `${col} NOT LIKE ${bind('%' + __esc_like(rule.value) + '%')}`; break;
      case 'startsWith': expr = `${col} LIKE ${bind(__esc_like(rule.value) + '%')}`; break;
      case 'endsWith': expr = `${col} LIKE ${bind('%' + __esc_like(rule.value))}`; break;
      case 'isEmpty': expr = `(${col} IS NULL OR ${col} = ${bind('')})`; break;
      case 'isNotEmpty': expr = `(${col} IS NOT NULL AND ${col} <> ${bind('')})`; break;
      case 'matchesRegex': expr = dialect === 'postgres' ? `${col} ~ ${bind(rule.value)}` : `${col} REGEXP ${bind(rule.value)}`; break;
      case 'lt': case 'before': expr = `${col} < ${bind(rule.value)}`; break;
      case 'lte': expr = `${col} <= ${bind(rule.value)}`; break;
      case 'gt': case 'after': expr = `${col} > ${bind(rule.value)}`; break;
      case 'gte': expr = `${col} >= ${bind(rule.value)}`; break;
      case 'between': expr = `${col} BETWEEN ${bind(rule.value[0])} AND ${bind(rule.value[1])}`; break;
      case 'notBetween': expr = `${col} NOT BETWEEN ${bind(rule.value[0])} AND ${bind(rule.value[1])}`; break;
      case 'inLastNDays': expr = `${col} >= ${bind(date.toISODate(date.sub(date.today(), Number(rule.value) || 0, 'd')))}`; break;
      case 'thisWeek': case 'thisMonth': case 'thisYear': {
        const unit = rule.operator === 'thisWeek' ? 'week' : rule.operator === 'thisMonth' ? 'month' : 'year';
        expr = `${col} BETWEEN ${bind(date.toISODate(date.startOf(date.today(), unit)))} AND ${bind(date.toISODate(date.endOf(date.today(), unit)))}`;
        break;
      }
      case 'isTrue': expr = `${col} = ${bind(true)}`; break;
      case 'isFalse': expr = `${col} = ${bind(false)}`; break;
      case 'in': case 'containsAny': expr = `${col} IN (${toArr(rule.value).map(bind).join(', ')})`; break;
      case 'notIn': case 'containsNone': expr = `${col} NOT IN (${toArr(rule.value).map(bind).join(', ')})`; break;
      case 'containsAll': expr = toArr(rule.value).map(v => `${col} LIKE ${bind('%' + __esc_like(v) + '%')}`).join(' AND '); break;
      default: expr = '1=1';
    }
    return rule.not ? `NOT (${expr})` : expr;
  }
  function build(node) { return node.type === 'group' ? buildGroup(node) : buildRule(node); }
  return { sql: build(tree) || '1=1', params };
}

/* ── MongoDB query object ─────────────────────────────────────────────── */
function qbToMongo(tree, fields) {
  function ruleCond(rule, f) {
    switch (rule.operator) {
      case 'equals': case 'eq': case 'on': return rule.value;
      case 'notEquals': case 'ne': return { $ne: rule.value };
      case 'contains': return { $regex: __esc_regex(rule.value), $options: 'i' };
      case 'notContains': return { $not: new RegExp(__esc_regex(rule.value), 'i') };
      case 'startsWith': return { $regex: '^' + __esc_regex(rule.value), $options: 'i' };
      case 'endsWith': return { $regex: __esc_regex(rule.value) + '$', $options: 'i' };
      case 'isEmpty': return { $in: [null, ''] };
      case 'isNotEmpty': return { $nin: [null, ''] };
      case 'matchesRegex': return { $regex: rule.value };
      case 'lt': case 'before': return { $lt: rule.value };
      case 'lte': return { $lte: rule.value };
      case 'gt': case 'after': return { $gt: rule.value };
      case 'gte': return { $gte: rule.value };
      case 'between': return { $gte: rule.value[0], $lte: rule.value[1] };
      case 'notBetween': return { $not: { $gte: rule.value[0], $lte: rule.value[1] } };
      case 'inLastNDays': return { $gte: date.toISODate(date.sub(date.today(), Number(rule.value) || 0, 'd')) };
      case 'thisWeek': case 'thisMonth': case 'thisYear': {
        const unit = rule.operator === 'thisWeek' ? 'week' : rule.operator === 'thisMonth' ? 'month' : 'year';
        return { $gte: date.toISODate(date.startOf(date.today(), unit)), $lte: date.toISODate(date.endOf(date.today(), unit)) };
      }
      case 'isTrue': return true;
      case 'isFalse': return false;
      case 'in': case 'containsAny': return { $in: toArr(rule.value) };
      case 'notIn': case 'containsNone': return { $nin: toArr(rule.value) };
      case 'containsAll': return { $all: toArr(rule.value) };
      default: return undefined;
    }
  }
  function freeTextMongo(rule) {
    if (rule.value == null || rule.value === '') return {};
    const cols = qbTextFields(fields), re = { $regex: __esc_regex(rule.value), $options: 'i' };
    if (!cols.length) return { _text: rule.not ? { $not: re } : re };
    const parts = cols.map(f => ({ [f.key]: re }));
    const combined = parts.length > 1 ? { $or: parts } : parts[0];
    return rule.not ? { $nor: [combined] } : combined;
  }
  function ruleToMongo(rule) {
    if (rule.field === '_text') return freeTextMongo(rule);
    const f = qbField(fields, rule.field);
    if (!f || !rule.operator) return {};
    if (qbValueKind(f.type, rule.operator) !== 'none' && !qbRuleValid(rule, fields)) return {};
    const cond = ruleCond(rule, f);
    if (cond === undefined) return {};
    const negated = rule.not ? (isPlainObj(cond) ? { $not: cond } : { $ne: cond }) : cond;
    return { [rule.field]: negated };
  }
  function groupToMongo(node) {
    const parts = node.children.map(build).filter(p => p && Object.keys(p).length);
    if (!parts.length) return {};
    const combined = parts.length > 1 ? { [node.op === 'or' ? '$or' : '$and']: parts } : parts[0];
    return node.not ? { $nor: [combined] } : combined;
  }
  function build(node) { return node.type === 'group' ? groupToMongo(node) : ruleToMongo(node); }
  return build(tree);
}

/* ── human sentence ───────────────────────────────────────────────────── */
const __qbFmtVal = v => (v == null || v === '' ? '' : isStr(v) ? `"${v}"` : String(v));
function qbRuleToString(rule, fields) {
  const f = qbField(fields, rule.field);
  if (!f || !rule.operator) return '';
  const label = f.label || f.key;
  const opLabel = t('querybuilder.op.' + rule.operator);
  const kind = qbValueKind(f.type, rule.operator);
  let sentence;
  if (rule.operator === 'inLastNDays') sentence = `${label} ${opLabel} ${__qbFmtVal(rule.value)} ${t('querybuilder.days')}`;
  else if (kind === 'pair') sentence = `${label} ${opLabel} ${__qbFmtVal(rule.value && rule.value[0])} ${t('common.to')} ${__qbFmtVal(rule.value && rule.value[1])}`;
  else if (kind === 'list') sentence = `${label} ${opLabel} ${toArr(rule.value).map(__qbFmtVal).join(', ')}`;
  else if (kind === 'none') sentence = `${label} ${opLabel}`;
  else sentence = `${label} ${opLabel} ${__qbFmtVal(rule.value)}`;
  return rule.not ? `${t('querybuilder.not')} (${sentence})` : sentence;
}
function qbToString(node, fields, depth = 0) {
  if (node.type === 'rule') return qbRuleToString(node, fields);
  const parts = node.children.map(c => qbToString(c, fields, depth + 1)).filter(Boolean);
  if (!parts.length) return '';
  const joiner = ' ' + t('querybuilder.' + (node.op === 'or' ? 'or' : 'and')) + ' ';
  const body = parts.join(joiner);
  if (node.not) return `${t('querybuilder.not')} (${body})`;
  return depth > 0 && parts.length > 1 ? `(${body})` : body;
}

/* ── JS predicate (row) => boolean ────────────────────────────────────── */
function __qbEvalText(raw, rule) {
  const s = String(raw ?? '').toLowerCase(), v = String(rule.value ?? '').toLowerCase();
  switch (rule.operator) {
    case 'equals': return s === v;
    case 'notEquals': return s !== v;
    case 'contains': return s.includes(v);
    case 'notContains': return !s.includes(v);
    case 'startsWith': return s.startsWith(v);
    case 'endsWith': return s.endsWith(v);
    case 'isEmpty': return raw == null || raw === '';
    case 'isNotEmpty': return !(raw == null || raw === '');
    case 'matchesRegex': try { return new RegExp(rule.value).test(String(raw ?? '')); } catch { return false; }
    default: return true;
  }
}
function __qbEvalNumber(raw, rule) {
  const n = Number(raw);
  switch (rule.operator) {
    case 'eq': return n === Number(rule.value);
    case 'ne': return n !== Number(rule.value);
    case 'lt': return n < Number(rule.value);
    case 'lte': return n <= Number(rule.value);
    case 'gt': return n > Number(rule.value);
    case 'gte': return n >= Number(rule.value);
    case 'between': return n >= Number(rule.value[0]) && n <= Number(rule.value[1]);
    case 'notBetween': return !(n >= Number(rule.value[0]) && n <= Number(rule.value[1]));
    default: return true;
  }
}
function __qbEvalDate(raw, rule) {
  const d = date.parse(raw);
  if (!d) return false;
  switch (rule.operator) {
    case 'on': return !!date.isSame(d, date.parse(rule.value), 'd');
    case 'before': return !!date.isBefore(d, date.parse(rule.value));
    case 'after': return !!date.isAfter(d, date.parse(rule.value));
    case 'between': return !!date.isBetween(d, date.parse(rule.value[0]), date.parse(rule.value[1]), 'd');
    case 'inLastNDays': return !!date.isBetween(d, date.sub(date.today(), Number(rule.value) || 0, 'd'), date.today(), 'd');
    case 'thisWeek': return !!date.isBetween(d, date.startOf(date.today(), 'week'), date.endOf(date.today(), 'week'), 'd');
    case 'thisMonth': return !!date.isBetween(d, date.startOf(date.today(), 'month'), date.endOf(date.today(), 'month'), 'd');
    case 'thisYear': return !!date.isBetween(d, date.startOf(date.today(), 'year'), date.endOf(date.today(), 'year'), 'd');
    default: return true;
  }
}
function __qbEvalArrayLike(raw, rule, isMulti) {
  const list = toArr(rule.value).map(v => String(v).toLowerCase());
  if (!isMulti) { const s = String(raw).toLowerCase(); return rule.operator === 'in' ? list.includes(s) : rule.operator === 'notIn' ? !list.includes(s) : true; }
  const arr = toArr(raw).map(v => String(v).toLowerCase());
  switch (rule.operator) {
    case 'containsAny': return list.some(v => arr.includes(v));
    case 'containsAll': return list.every(v => arr.includes(v));
    case 'containsNone': return !list.some(v => arr.includes(v));
    default: return true;
  }
}
function __qbEvalFreeText(rule, fields, row) {
  if (rule.value == null || rule.value === '') return true;
  const cols = qbTextFields(fields);
  const hay = (cols.length ? cols.map(f => String(getPath(row, f.key) ?? '')) : Object.values(row || {}).map(v => String(v ?? ''))).join(' ').toLowerCase();
  return hay.includes(String(rule.value).toLowerCase());
}
function qbEvalRule(rule, fields, row) {
  if (rule.field === '_text') { const res = __qbEvalFreeText(rule, fields, row); return rule.not ? !res : res; }
  const f = qbField(fields, rule.field);
  if (!f || !rule.operator) return true;
  if (qbValueKind(f.type, rule.operator) !== 'none' && !qbRuleValid(rule, fields)) return true;
  const raw = getPath(row, rule.field);
  let res;
  switch (f.type) {
    case 'number': res = __qbEvalNumber(raw, rule); break;
    case 'date': res = __qbEvalDate(raw, rule); break;
    case 'boolean': res = rule.operator === 'isFalse' ? !raw : !!raw; break;
    case 'select': res = __qbEvalArrayLike(raw, rule, false); break;
    case 'array': res = __qbEvalArrayLike(raw, rule, true); break;
    default: res = __qbEvalText(raw, rule);
  }
  return rule.not ? !res : res;
}
function qbEvalNode(node, fields, row) {
  if (node.type === 'rule') return qbEvalRule(node, fields, row);
  if (!node.children.length) return true;
  const results = node.children.map(c => qbEvalNode(c, fields, row));
  const val = node.op === 'or' ? results.some(Boolean) : results.every(Boolean);
  return node.not ? !val : val;
}
function qbToPredicate(tree, fields) { return row => qbEvalNode(tree, fields, row); }
