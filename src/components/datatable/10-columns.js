/* ── columns: normalization, formatting and cell markup by type ────────── */
const DT_EDITABLE_TYPES = new Set(['text', 'number', 'currency', 'percent', 'date', 'datetime', 'boolean', 'badge', 'link', 'progress']);
const DT_FILTER_BY_TYPE = { number: 'number-range', currency: 'number-range', percent: 'number-range', progress: 'number-range', date: 'date-range', datetime: 'date-range', boolean: 'boolean', badge: 'multiselect' };

/** Normalize one column definition (string keys are accepted: 'name'). */
function dtColumn(def, i, dt) {
  const c = isStr(def) ? { key: def } : { ...def };
  c.type = c.type || 'text';
  c.id = String(c.id ?? c.key ?? (c.type === 'actions' ? '__actions' : 'col' + i));
  const key = c.key;
  c.get = isFn(c.value) ? c.value : key == null ? () => undefined : (isStr(key) && !key.includes('.') ? row => row?.[key] : row => getPath(row, key));
  if (c.title == null) c.title = key == null ? '' : cap(String(key).split('.').pop().replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' '));
  c.align = c.align || (DT_TYPES_END.has(c.type) ? 'end' : c.type === 'boolean' ? 'center' : c.type === 'actions' ? 'end' : 'start');
  const data = c.type !== 'actions';
  c.sortable = data && key != null && (c.sortable ?? dt.sortable) !== false;
  if (!c.filter && data && key != null && (c.filterable || (dt.filterable && c.filterable !== false))) c.filter = DT_FILTER_BY_TYPE[c.type] || (c.filterOptions ? 'multiselect' : 'text');
  if (!data) c.filter = null;
  c.filterable = !!c.filter;
  c.resizable = c.resizable ?? dt.resizable;
  c.reorderable = c.reorderable ?? dt.reorderable;
  if (c.editable == null) c.editable = !!(dt.editable && DT_EDITABLE_TYPES.has(c.type) && key != null && !c.render);
  c.searchable = data && c.searchable !== false;
  c.exportable = data && c.exportable !== false;
  c.minWidth = +c.minWidth || 56;
  c.maxWidth = +c.maxWidth || 1600;
  c.width = c.width != null && c.width !== '' ? parseFloat(c.width) || null : null;
  c.frozen = c.frozen === true ? 'start' : c.frozen === 'start' || c.frozen === 'end' ? c.frozen : null;
  c._f = isFn(c.format) ? null : dtFormatter(c);
  return c;
}

/** Fast formatter with Intl objects created once per column (columns are re-normalized on locale change). */
function dtFormatter(col) {
  const f = col.format, o = isObj(f) ? f : {}, loc = i18n.locale;
  const mk = (C, opts) => { try { return new C(loc, opts); } catch { return new C('en', opts); } };
  const digits = isNum(f) ? { minimumFractionDigits: f, maximumFractionDigits: f } : null;
  const toDate = v => (v instanceof Date ? (Number.isNaN(+v) ? null : v) : date.parse(v));
  switch (col.type) {
    case 'number': { const F = mk(Intl.NumberFormat, digits || o); return v => F.format(+v); }
    case 'currency': { const { currency, ...rest } = o; const F = mk(Intl.NumberFormat, { style: 'currency', currency: col.currency || currency || O.config?.currency || 'USD', ...(digits || rest) }); return v => F.format(+v); }
    case 'percent': { const d = isNum(f) ? f : o.digits ?? 0; const F = mk(Intl.NumberFormat, { style: 'percent', minimumFractionDigits: d, maximumFractionDigits: d }); return v => F.format(+v / (col.scale || 1)); }
    case 'progress': { const F = mk(Intl.NumberFormat, { style: 'percent', maximumFractionDigits: 0 }); return v => F.format(+v / (col.max || 100)); }
    case 'date': if (!isStr(f)) { const F = mk(Intl.DateTimeFormat, isObj(f) ? f : { dateStyle: 'medium' }); return v => { const d = toDate(v); return d ? F.format(d) : ''; }; } break;
    case 'datetime': if (!isStr(f)) { const F = mk(Intl.DateTimeFormat, { dateStyle: o.date || 'medium', timeStyle: o.time || 'short' }); return v => { const d = toDate(v); return d ? F.format(d) : ''; }; } break;
  }
  return null;
}

/** Internal columns (checkbox, expander) */
const dtSpecial = (id, width) => ({ id, special: id.slice(2), key: null, type: 'special', title: '', width, minWidth: width, maxWidth: width, align: 'center', get: noop, sortable: false, filter: null, resizable: false, reorderable: false, searchable: false, exportable: false });

/** Default width estimate for a column (header text + type). */
function dtDefaultWidth(col, dt) {
  if (col.special) return col.width;
  if (col.type === 'actions') return dt._actionsWidth();
  const head = String(col.title || '').length * 7.4 + 30 + (col.sortable ? 18 : 0) + (col.filterable ? 26 : 0);
  return clamp(Math.round(Math.max(DT_DEFAULT_W[col.type] || 150, head)), col.minWidth, col.maxWidth);
}

/** Display text of a value (used for rendering, search, stacked labels and formatted export). */
function dtFormat(col, v, row) {
  if (isFn(col.format)) { try { return String(col.format(v, row) ?? ''); } catch (e) { console.error('[Orion] column format', e); return ''; } }
  if (v == null || v === '') return '';
  if (col._f) return DT_NUMERIC.has(col.type) && Number.isNaN(+v) ? String(v) : col._f(v);
  const f = col.format, o = isObj(f) ? f : {};
  switch (col.type) {
    case 'number': return fmt.number(v, isNum(f) ? f : o);
    case 'currency': { const { currency, ...rest } = o; return fmt.currency(v, col.currency || currency, isNum(f) ? { minimumFractionDigits: f, maximumFractionDigits: f } : rest); }
    case 'percent': return fmt.percent(+v / (col.scale || 1), isNum(f) ? f : o.digits ?? 0);
    case 'progress': return fmt.percent(+v / (col.max || 100));
    case 'date': return isStr(f) ? fmt.date(v, f) : fmt.date(v, isObj(f) ? f : 'medium');
    case 'datetime': return isStr(f) ? fmt.date(v, f) : fmt.datetime(v, o.date || 'medium', o.time || 'short');
    case 'boolean': return v ? (col.trueLabel || t('table.yes')) : (col.falseLabel || t('table.no'));
    case 'html': return dtText(v);
  }
  if (Array.isArray(v)) return v.map(x => (isObj(x) ? x.label ?? x.name ?? '' : x)).join(', ');
  if (v instanceof Date) return fmt.date(v);
  if (isObj(v)) return String(v.label ?? v.name ?? v.title ?? '');
  return String(v);
}

/** Raw (typed) export value; `formatted` exports the display text instead. */
function dtExportValue(col, row, formatted) {
  if (isFn(col.exportValue)) return col.exportValue(row);
  const v = col.get(row);
  if (formatted) return col.render && !col.format ? dtText(dtRenderUser(col, row, v)) : dtFormat(col, v, row);
  if (v == null) return '';
  if (DT_DATES.has(col.type)) { const d = date.parse(v); return d ? date.format(d, col.type === 'date' ? 'YYYY-MM-DD' : 'YYYY-MM-DD HH:mm') : String(v); }
  if (col.type === 'html') return dtText(v);
  if (Array.isArray(v) || isObj(v) || v instanceof Date) return dtFormat(col, v, row);
  return v;
}

const dtSafeUrl = u => { const s = String(u ?? '').replace(/[\x00-\x20\x7f-\x9f]/g, ''); return /^(javascript|vbscript|data):/i.test(s) ? '#' : String(u ?? ''); };
const dtInitials = n => (O.avatar?.initials ? O.avatar.initials(n) : String(n || '').trim().split(/\s+/).map(w => w[0] || '').slice(0, 2).join('').toUpperCase());

/** Output of a user render() callback: Node | trusted string (html:true or SafeHTML) | sanitized string */
function dtRenderUser(col, row, v, dt) {
  let r;
  try { r = col.render(row, v, { column: col, table: dt }); } catch (e) { console.error('[Orion] column render', e); return ''; }
  if (r == null || r === false) return '';
  if (r instanceof Node) return r;
  if (r instanceof SafeHTML) return r.s;
  return col.html ? String(r) : sanitize(String(r));
}

/** Cell inner markup (string) or a Node (from render callbacks). `words` = active search words for highlighting. */
function dtCellHTML(col, row, dt, words) {
  const v = col.get(row);
  if (col.render) return dtRenderUser(col, row, v, dt);
  if (col.type === 'actions') return dt._actionsHTML(row);
  const empty = '<span class="o-dt-empty">—</span>';
  switch (col.type) {
    case 'boolean':
      if (v == null || v === '') return empty;
      return `<span class="o-dt-bool${v ? ' is-true' : ''}">${icon(v ? 'check' : 'minus')}<span class="o-sr-only">${esc(dtFormat(col, v, row))}</span></span>`;
    case 'badge': {
      if (v == null || v === '') return empty;
      return toArr(v).map(x => {
        const label = isObj(x) ? x.label ?? x.name : x;
        const c = (isFn(col.colors) ? col.colors(x, row) : col.colors?.[label]) || col.color || 'secondary';
        return `<span class="o-badge o-badge-soft-${esc(c)} o-dt-badge">${dtHighlight(label, words)}</span>`;
      }).join(' ');
    }
    case 'progress': {
      if (v == null || v === '') return empty;
      const max = col.max || 100, pct = clamp((+v / max) * 100, 0, 100);
      const c = (isFn(col.color) ? col.color(v, row) : col.color) || 'primary';
      return `<div class="o-dt-progress o-c-${esc(c)}"><div class="o-progress o-progress-sm" role="progressbar" aria-label="${esc(col.title)}" aria-valuenow="${+v}" aria-valuemin="0" aria-valuemax="${max}"><div class="o-progress-bar" style="--o-value:${round(pct, 1)}%"></div></div><span class="o-dt-progress-val">${esc(dtFormat(col, v, row))}</span></div>`;
    }
    case 'avatar': {
      const name = dtFormat(col, v, row);
      const src = col.avatar ? (isFn(col.avatar) ? col.avatar(row) : getPath(row, col.avatar)) : null;
      const sub = col.subtitle ? (isFn(col.subtitle) ? col.subtitle(row) : getPath(row, col.subtitle)) : null;
      const av = customElements.get('o-avatar')
        ? `<o-avatar size="sm" name="${esc(name)}"${src ? ` src="${esc(src)}"` : ''}></o-avatar>`
        : `<span class="o-avatar o-avatar-sm" role="img" aria-label="${esc(name)}">${esc(dtInitials(name))}</span>`;
      return `<span class="o-user o-dt-user">${av}<span class="o-user-info"><span class="o-user-name">${dtHighlight(name, words)}</span>${sub != null && sub !== '' ? `<span class="o-user-sub">${dtHighlight(sub, words)}</span>` : ''}</span></span>`;
    }
    case 'link': {
      if (v == null || v === '') return empty;
      const href = isFn(col.href) ? col.href(row) : col.href ? dtTpl(col.href, row) : v;
      const tgt = col.target ? ` target="${esc(col.target)}"${col.target === '_blank' ? ' rel="noopener noreferrer"' : ''}` : '';
      return `<a class="o-dt-link" href="${esc(dtSafeUrl(href))}"${tgt}>${dtHighlight(dtFormat(col, v, row), words)}</a>`;
    }
    case 'html': return v == null ? '' : col.html ? String(v) : sanitize(String(v));
  }
  const text = dtFormat(col, v, row);
  return text === '' ? empty : dtHighlight(text, words);
}

/** Aggregate value for a set of rows: 'sum' | 'avg' | 'count' | 'min' | 'max' | fn(values, rows) */
function dtAggregate(col, rows) {
  const a = col.aggregate;
  if (!a) return null;
  const vals = [];
  for (const r of rows) { const v = col.get(r); if (v != null && v !== '') vals.push(v); }
  if (isFn(a)) return a(vals, rows);
  if (a === 'count') return vals.length;
  const nums = vals.map(v => dtSortKey(v, col.type)).filter(isNum);
  if (!nums.length) return null;
  if (a === 'sum') return nums.reduce((s, n) => s + n, 0);
  if (a === 'avg') return nums.reduce((s, n) => s + n, 0) / nums.length;
  if (a === 'min') return Math.min(...nums);
  if (a === 'max') return Math.max(...nums);
  return null;
}
/** Markup of an aggregate cell: label + formatted value. */
function dtAggHTML(col, value, withLabel = true) {
  if (value == null) return '';
  if (value instanceof Node) return value.outerHTML;
  const a = col.aggregate;
  let text;
  if (isFn(col.aggregateFormat)) text = col.aggregateFormat(value);
  else if (a === 'count') text = fmt.number(value);
  else if (DT_DATES.has(col.type)) text = fmt.date(value);
  else if (isNum(value)) text = dtFormat({ ...col, format: isFn(col.format) ? undefined : col.format, type: DT_NUMERIC.has(col.type) ? col.type : 'number' }, a === 'avg' && col.type === 'number' ? round(value, 2) : value, {});
  else text = String(value);
  const lbl = isStr(a) ? t('table.agg' + cap(a)) : '';
  return (withLabel && lbl ? `<span class="o-dt-agg-label">${esc(lbl)}</span> ` : '') + `<span class="o-dt-agg-val">${esc(text)}</span>`;
}
