/* ============================================================================
 * Orion charts — tooltip (.o-floating), legend (toggle / emphasis), scale legend,
 * table view (accessibility twin) and CSV/table data helpers.
 * All user-provided labels are inserted with textContent.
 * ========================================================================== */

/* ── tooltip ────────────────────────────────────────────────────────── */
/**
 * tip = { title, rows: [{ color, shape: 'line'|'rect'|'dot'|'none', value, name, strong }], foot }
 * Values lead (strong, tabular), series names follow (muted); line keys, not boxes.
 */
function chTipFill(el, tip) {
  el.replaceChildren();
  if (tip.title != null && tip.title !== '') el.appendChild(h('div', { class: 'o-chart-tip-title', text: tip.title }));
  if (tip.rows && tip.rows.length) {
    const grid = h('div', { class: 'o-chart-tip-rows' });
    for (const r of tip.rows) {
      const key = h('span', { class: 'o-chart-key is-' + (r.shape || 'line') });
      if (r.color) key.style.setProperty('--c', r.color);
      if (r.shape === 'none') key.style.visibility = 'hidden';
      grid.append(key, h('span', { class: 'o-chart-tip-val' + (r.strong === false ? ' is-plain' : ''), text: r.value ?? '' }), h('span', { class: 'o-chart-tip-name', text: r.name ?? '' }));
    }
    el.appendChild(grid);
  }
  if (tip.foot) el.appendChild(h('div', { class: 'o-chart-tip-foot', text: tip.foot }));
}
function chTipShow(ch, tip, clientX, clientY, placement = 'top') {
  if (!tip || ch.cfg.tooltip === false || ch.cfg.tooltip?.show === false) return chTipHide(ch);
  let el = ch._tip;
  if (!el) {
    el = ch._tip = h('div', { class: 'o-floating o-chart-tip', 'aria-hidden': 'true', role: 'presentation' });
  }
  if (!el.isConnected) { portal(el, ch.host); }
  else inheritContext(el, ch.host);
  el.style.zIndex = String(Z.tooltip);
  chTipFill(el, tip);
  el.hidden = false;
  place(el, { x: clientX, y: clientY, width: 0, height: 0 }, { placement, offset: placement === 'top' ? 10 : 14, flip: true, shift: true, padding: 8, fallback: placement === 'right' ? ['left', 'top', 'bottom'] : ['bottom'] });
}
function chTipHide(ch) { if (ch._tip) ch._tip.hidden = true; }
function chTipDestroy(ch) { if (ch._tip) { ch._tip.remove(); ch._tip = null; } }

/* ── legend ─────────────────────────────────────────────────────────── */
/**
 * items: [{ key, name, color, shape: 'rect'|'line'|'dot', hidden, dashed }]
 * Buttons toggle the series (aria-pressed); hover/focus emphasises it.
 */
function chLegendRender(ch, items) {
  const box = ch.els.legend;
  box.classList.remove('is-scale');
  if (!items || !items.length) { box.replaceChildren(); box.hidden = true; return; }
  box.hidden = false;
  box.setAttribute('role', 'group');
  box.setAttribute('aria-label', ch.t('chart.legend'));
  patchList(box, items, it => 'k' + it.key, it => {
    const btn = h('button', { type: 'button', class: 'o-chart-legend-item', dataset: { key: it.key } },
      h('span', { class: 'o-chart-key' }), h('span', { class: 'o-chart-legend-label' }));
    return btn;
  }, () => {});
  items.forEach((it, i) => {
    const btn = box.children[i];
    const key = btn.firstChild, label = btn.lastChild;
    key.className = 'o-chart-key is-' + (it.shape || 'rect') + (it.dashed ? ' is-dashed' : '');
    key.style.setProperty('--c', it.color);
    chSetText(label, it.name);
    btn.setAttribute('aria-pressed', String(!it.hidden));
    btn.title = it.name;
    btn.disabled = it.static === true;
  });
}
/** Wire legend events once (delegated). */
function chLegendWire(ch) {
  const box = ch.els.legend;
  on(box, 'click', '.o-chart-legend-item', (e, btn) => ch.toggleSeries(+btn.dataset.key, undefined, { user: true }));
  on(box, 'pointerover focusin', '.o-chart-legend-item', (e, btn) => { if (btn.getAttribute('aria-pressed') === 'true') ch._emph(+btn.dataset.key); });
  on(box, 'pointerout focusout', '.o-chart-legend-item', () => ch._emph(null));
}

/**
 * Sequential / diverging scale legend: classes ['o-ch-q1', ...] with end labels.
 * spec: { classes: [...], min, max, lead, trail, zero: 'o-ch-q0' (missing) }
 */
function chScaleLegend(ch, spec) {
  const box = ch.els.legend;
  box.hidden = false;
  box.classList.add('is-scale');
  box.removeAttribute('role');
  box.setAttribute('aria-hidden', 'true');
  const wrap = h('div', { class: 'o-chart-scale' });
  if (spec.lead != null) wrap.appendChild(h('span', { class: 'o-chart-scale-label', text: spec.lead }));
  const sw = h('span', { class: 'o-chart-scale-steps' });
  for (const c of spec.classes) sw.appendChild(h('span', { class: 'o-chart-scale-step ' + c }));
  wrap.appendChild(sw);
  if (spec.trail != null) wrap.appendChild(h('span', { class: 'o-chart-scale-label', text: spec.trail }));
  if (spec.missing) wrap.append(h('span', { class: 'o-chart-scale-step o-ch-q0 is-missing' }), h('span', { class: 'o-chart-scale-label', text: spec.missing }));
  box.replaceChildren(wrap);
}

/* ── table view ─────────────────────────────────────────────────────── */
const CH_TABLE_SR_MAX = 400;
/**
 * data = { caption, head: [..], rows: [[..]], raw: [[..]] (unformatted for CSV), numeric: [bool per column] }
 */
function chTableRender(ch, force) {
  const wrap = ch.els.table;
  const open = ch.state.tableOpen;
  const data = ch._tableData();
  const n = data ? data.rows.length : 0;
  wrap.hidden = false;
  wrap.classList.toggle('o-sr-only', !open);
  ch.els.tableBtn?.setAttribute('aria-pressed', String(open));
  ch.els.tableBtn?.setAttribute('aria-expanded', String(open));
  if (ch.els.tableBtn) { ch.els.tableBtn.title = ch.t(open ? 'chart.hideTable' : 'chart.viewTable'); ch.els.tableBtn.setAttribute('aria-label', ch.els.tableBtn.title); }
  if (!data || (!open && n > CH_TABLE_SR_MAX && !force)) { wrap.replaceChildren(); if (!open) wrap.hidden = !data; return; }
  const table = h('table', { class: 'o-table o-table-sm o-table-sticky' });
  table.appendChild(h('caption', { class: 'o-sr-only', text: data.caption || ch.t('chart.table') }));
  const thead = h('thead'), tr = h('tr');
  data.head.forEach((c, j) => tr.appendChild(h('th', { scope: 'col', class: data.numeric?.[j] ? 'o-num' : null, text: c })));
  thead.appendChild(tr);
  const tbody = h('tbody');
  const frag0 = doc.createDocumentFragment();
  for (const row of data.rows) {
    const r = h('tr');
    row.forEach((c, j) => r.appendChild(h(j === 0 ? 'th' : 'td', { scope: j === 0 ? 'row' : null, class: data.numeric?.[j] ? 'o-num' : null, text: c ?? '' })));
    frag0.appendChild(r);
  }
  tbody.appendChild(frag0);
  table.append(thead, tbody);
  const scroller = h('div', { class: 'o-table-wrap o-chart-table-scroll' }, table);
  wrap.replaceChildren(scroller);
}
/** CSV text (RFC 4180 quoting) from the table data (raw values when available). */
function chCSV(data) {
  if (!data) return '';
  const q = v => { const s = v == null ? '' : v instanceof Date ? date.toLocalISO(v) : String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const rows = [data.head, ...(data.raw || data.rows)];
  return rows.map(r => r.map(q).join(',')).join('\r\n');
}
