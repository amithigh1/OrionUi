/* ============================================================================
 * Orion charts — Chart instance, <o-chart> element and Orion.chart() factory.
 *
 *   const chart = Orion.chart('#el', { type: 'line', labels: [...], series: [...] });
 *   <o-chart type="column" config='{"labels":["A","B"],"series":[{"name":"x","data":[1,2]}]}'></o-chart>
 *
 * Renderers register per type (see 20-cartesian.js …) with:
 *   { prepare(ch) -> model, render(ch, model, frame) -> view, legend(ch, model), table(ch, model),
 *     summary(ch, model), autoHeight?(ch, model, width) }
 * A view answers hit(x, y, target) / tip(a) / anchor(a) / mark(a) / nav(a, key) / point(a).
 * ========================================================================== */

const CH_ALIASES = {
  doughnut: 'donut', 'radial-bar': 'radialBar', radialbar: 'radialBar', 'polar-area': 'polar', polarArea: 'polar',
  'bubble-map': 'bubbleMap', bubblemap: 'bubbleMap', box: 'boxplot', 'box-plot': 'boxplot', stock: 'candlestick',
  combo: 'mixed', map: 'geo', 'calendar-heatmap': 'calendar', 'progress-radial': 'progress', ring: 'progress',
  hbar: 'bar', columns: 'column', lines: 'line', areas: 'area',
};
const CH_DUR = { enter: 680, update: 420, stream: 320 };
const CH_ICON = {
  table: '<svg class="o-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 10v10"/></svg>',
};

function chDefaults() {
  return {
    type: 'line', title: '', subtitle: '', description: '', labels: null, series: null, data: null,
    xAxis: {}, yAxis: {}, legend: {}, tooltip: {}, dataLabels: 'auto', annotations: [],
    stacked: false, horizontal: false, curve: 'linear', markers: 'auto', height: null, zoom: null,
    animate: true, colors: null, toolbar: {}, fold: true, maxPoints: 0, texts: null, empty: null,
    pie: {}, radar: {}, gauge: {}, progress: {}, radialBar: {}, heatmap: {}, calendar: {}, treemap: {}, funnel: {}, geo: {},
  };
}
function chNormalize(c) {
  c.type = CH_ALIASES[c.type] || c.type || 'line';
  if (c.legend === false) c.legend = { show: false }; else if (c.legend === true) c.legend = { show: true };
  if (c.tooltip === false) c.tooltip = { show: false }; else if (c.tooltip === true) c.tooltip = {};
  if (c.zoom === true) c.zoom = { x: true };
  if (c.toolbar === false) c.toolbar = { show: false }; else if (c.toolbar === true) c.toolbar = { download: true };
  if (isStr(c.xAxis)) c.xAxis = { type: c.xAxis };
  if (isStr(c.yAxis) || isFn(c.yAxis)) c.yAxis = { format: c.yAxis };
  c.xAxis = c.xAxis || {}; c.yAxis = c.yAxis || {};
  if (c.stacked === 'true') c.stacked = true;
  if (!Array.isArray(c.annotations)) c.annotations = c.annotations ? [c.annotations] : [];
  return c;
}

class Chart extends Emitter {
  constructor(host, config = {}) {
    super();
    this.host = host;
    this.id = uid('ch');
    this.state = { hidden: new Set(), hl: null, emph: null, zoom: null, active: null, tableOpen: false };
    this._raw = {};
    this._colors = new Map();
    this._offs = [];
    this.W = 0; this.H = 0;
    this.model = null; this.view = null;
    this._build();
    this._apply(config, 'enter');
  }

  /* ── DOM skeleton ─────────────────────────────────────────────────── */
  _build() {
    const host = this.host;
    host.classList.add('o-chart');
    const E = this.els = {};
    E.head = h('div', { class: 'o-chart-head' });
    E.titles = h('div', { class: 'o-chart-titles' });
    E.legend = h('div', { class: 'o-chart-legend', hidden: true });
    E.toolbar = h('div', { class: 'o-chart-toolbar', role: 'toolbar', 'aria-label': this.t('chart.chart') });
    E.body = h('div', { class: 'o-chart-body' });
    E.plot = h('div', { class: 'o-chart-plot', tabindex: '0', role: 'img' });
    E.hint = h('span', { class: 'o-sr-only', id: this.id + '-hint' });
    E.plot.setAttribute('aria-describedby', E.hint.id);
    this.svg = chEl('svg', { class: 'o-chart-svg', 'aria-hidden': 'true', focusable: 'false', xmlns: CH_NS });
    E.empty = h('div', { class: 'o-chart-empty', hidden: true });
    E.plot.append(this.svg, E.empty);
    E.table = h('div', { class: 'o-chart-table', id: this.id + '-table', hidden: true });
    E.probe = h('span', { class: 'o-chart-probe', 'aria-hidden': 'true' });
    E.body.append(E.plot);
    host.replaceChildren(E.head, E.body, E.table, E.hint, E.probe);
    chLegendWire(this);
    this._wire();
  }
  _layoutChrome() {
    const c = this.cfg, E = this.els, tb = c.toolbar || {};
    E.titles.replaceChildren();
    if (c.title) E.titles.appendChild(h('div', { class: 'o-chart-title', text: c.title }));
    if (c.subtitle) E.titles.appendChild(h('div', { class: 'o-chart-subtitle', text: c.subtitle }));
    // toolbar
    E.toolbar.replaceChildren();
    const btn = (label, iconHTML, fn, cls) => {
      const b = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-icon o-btn-sm ' + (cls || ''), title: label, 'aria-label': label, html: String(iconHTML) });
      b.addEventListener('click', fn);
      E.toolbar.appendChild(b);
      return b;
    };
    E.zoomOut = E.zoomIn = null;
    if (this.R?.zoomButtons) {
      E.zoomIn = btn(this.t('chart.zoomIn'), icon('zoom-in'), () => this.view?.zoomBy?.(1.6));
      E.zoomOut = btn(this.t('chart.zoomOut'), icon('zoom-out'), () => this.view?.zoomBy?.(1 / 1.6));
    }
    E.reset = btn(this.t('chart.resetZoom'), icon('refresh'), () => this.resetZoom(), 'o-chart-reset');
    E.reset.hidden = true;
    E.tableBtn = null;
    const tbOn = tb.show === true || (tb.show !== false && this.R?.toolbar !== false);
    if (tbOn && tb.table !== false) {
      E.tableBtn = btn(this.t('chart.viewTable'), CH_ICON.table, () => this.toggleTable());
      E.tableBtn.setAttribute('aria-controls', E.table.id);
    }
    if (tbOn && tb.download) btn(this.t('chart.download'), icon('download'), e => this._downloadMenu(e.currentTarget));
    E.toolbar.hidden = !E.toolbar.querySelector('button:not([hidden])') && !E.reset;
    // legend placement
    const pos = (c.legend && c.legend.position) || 'top';
    E.legend.className = 'o-chart-legend is-' + pos;
    E.body.className = 'o-chart-body is-legend-' + pos;
    if (pos === 'top' && !c.title && !c.subtitle) { E.head.replaceChildren(E.legend, E.toolbar); }
    else {
      E.head.replaceChildren(E.titles, E.toolbar);
      if (pos === 'bottom' || pos === 'end') E.body.replaceChildren(E.plot, E.legend);
      else E.body.replaceChildren(E.legend, E.plot);
    }
    if (pos === 'top' && !c.title && !c.subtitle) E.body.replaceChildren(E.plot);
    const fill = c.height === 'fill' || (isStr(c.height) && /%$/.test(c.height));
    this.host.classList.toggle('is-fill', fill);
    this.E_updateHead();
  }
  E_updateHead() {
    const E = this.els;
    const hasTools = [...E.toolbar.children].some(b => !b.hidden);
    const hasLegendInHead = E.legend.parentNode === E.head && !E.legend.hidden;
    E.toolbar.hidden = !hasTools;
    E.head.hidden = !hasTools && !hasLegendInHead && !E.titles.childNodes.length;
  }

  /* ── lifecycle ───────────────────────────────────────────────────── */
  attach() {
    if (this._attached || this._destroyed) return;
    this._attached = true;
    let lastW = 0, lastH = 0;
    this._offs.push(observeResize(this.els.plot, r => {
      const w = Math.round(r.width), hh = Math.round(r.height);
      if (w === lastW && hh === lastH) return;
      lastW = w; lastH = hh;
      if (w > 0 && (w !== this.W || (this.host.classList.contains('is-fill') && hh !== this.H))) this.render(this._dirty || (this.W ? 'resize' : 'enter'));
    }));
    this._offs.push(bus.on('theme', () => { this._colors.clear(); if (this.model) this.render('static'); }));
    this._offs.push(bus.on('locale', () => { this._layoutChrome(); if (this.model) this.render('static'); }));
    if (this._dirty) this.render(this._dirty);
  }
  detach() {
    this._attached = false;
    this._offs.forEach(f => { try { f(); } catch {} });
    this._offs = [];
    cancelAnimationFrame(this._raf); this._raf = 0;
    this._menu?.close('api');
    chTipDestroy(this);
    this.state.active = null;
  }
  destroy() {
    this.detach();
    this._destroyed = true;
    this.off();
    if (this._owned) this.host.remove(); else this.host.replaceChildren();
    this.host.classList.remove('o-chart');
  }

  /* ── config & data API ───────────────────────────────────────────── */
  get config() { return this.cfg; }
  _apply(cfg, mode) {
    if (cfg !== null && cfg !== undefined) this._raw = isObj(cfg) ? { ...cfg } : {};
    this.cfg = chNormalize(merge(chDefaults(), this._raw));
    const R = CH_TYPES[this.cfg.type] || CH_TYPES.line;
    if (this.R !== R) {
      if (this.R) mode = mode === 'static' ? 'static' : 'enter';
      this.R = R; this.scene = null; this.svg.replaceChildren(); this.model = null; this.state.zoom = null; this.state.geo = null; this.state.active = null;
    }
    this.host.dataset.type = this.cfg.type;
    this._layoutChrome();
    this.render(mode);
    return this;
  }
  /** update(configPatch | seriesArray, { animate }) */
  update(arg, { animate = true } = {}) {
    if (Array.isArray(arg)) return this.setData(arg, { animate });
    if (isObj(arg)) this._raw = merge({ ...this._raw }, arg);
    return this._apply(null, animate ? 'update' : 'static');
  }
  /** setData(series) — replace the series (array of series objects, or numbers for one series). */
  setData(series, { animate = true, labels } = {}) {
    this._raw = { ...this._raw, series: series && series.length && !isObj(series[0]) && !Array.isArray(series[0]) ? [{ ...(this._raw.series?.[0] || {}), data: series }] : series };
    if (labels) this._raw.labels = labels;
    return this._apply(null, animate ? 'update' : 'static');
  }
  setOptions(opts, { animate = true } = {}) { return this.update(opts, { animate }); }
  getData() { return clone({ labels: this._raw.labels, series: this._raw.series, data: this._raw.data }); }
  /**
   * append(values, { max, label }) — streaming. values: number (one series) | [perSeries...] | { label, x, values }
   * per-series entries may be numbers, {x, y} or [x, y]. Oldest points drop past `max` (or cfg.maxPoints).
   */
  append(values, opts = {}) {
    const raw = this._raw;
    const max = opts.max ?? raw.maxPoints ?? 0;
    let label = opts.label, list = values;
    if (isObj(values) && Array.isArray(values.values)) { label = values.label ?? values.x ?? label; list = values.values; }
    let src = raw.series;
    if (!src || !src.length) src = raw.data != null ? [{ data: raw.data }] : [{ data: [] }];
    if (!isObj(src[0])) src = [{ data: src }];
    src = src.map(s => (isObj(s) ? { ...s, data: [...(s.data || [])] } : { data: [...toArr(s)] }));
    // one series: `list` is the point itself; several series: one entry per series
    const per = src.length === 1 ? [Array.isArray(list) && list.length === 1 ? list[0] : list] : toArr(list);
    per.forEach((v, i) => { if (src[i] && v !== undefined) src[i].data.push(v); });
    let labels = raw.labels ? [...raw.labels] : null;
    if (labels) {
      const last = labels[labels.length - 1];
      labels.push(label ?? (last instanceof Date || chIsDateLike(last) ? new Date() : labels.length + 1));
    }
    if (max > 0) {
      for (const s of src) if (s.data.length > max) s.data.splice(0, s.data.length - max);
      if (labels && labels.length > max) labels.splice(0, labels.length - max);
    }
    this._raw = { ...raw, series: src, data: null, labels };
    return this._apply(null, opts.animate === false ? 'static' : 'stream');
  }
  highlight(key = null) { this.state.hl = key == null || key === false ? null : +key; this._applyEmph(); return this; }
  _emph(key) { this.state.emph = key; this._applyEmph(); }
  _applyEmph() {
    const k = this.state.emph ?? this.state.hl;
    this.host.classList.toggle('has-hl', k != null);
    this.svg.querySelectorAll('[data-key]').forEach(el => el.classList.toggle('is-hl', k != null && +el.dataset.key === k));
    this.els.legend.querySelectorAll('.o-chart-legend-item').forEach(b => b.classList.toggle('is-hl', k != null && +b.dataset.key === k));
  }
  toggleSeries(key, force, { user = false } = {}) {
    key = +key;
    const hidden = this.state.hidden;
    const visible = force === undefined ? hidden.has(key) : !!force;
    if (!visible) {
      const items = this.R.legend?.(this, this.model) || [];
      const vis = Array.isArray(items) ? items.filter(it => !hidden.has(it.key) && it.key !== key) : [1];
      if (!vis.length) return this; // keep at least one series visible
      hidden.add(key);
    } else hidden.delete(key);
    const item = Array.isArray(this._legendItems) ? this._legendItems.find(i => i.key === key) : null;
    this._fire('legend-toggle', { series: key, name: item?.name, visible, user });
    this.render('update');
    return this;
  }
  isVisible(key) { return !this.state.hidden.has(+key); }
  zoom(min, max) {
    this.state.zoom = min == null ? null : { min: Math.min(min, max), max: Math.max(min, max) };
    this._fire('zoom', this.state.zoom ? { ...this.state.zoom } : { min: null, max: null });
    this.render('update');
    return this;
  }
  resetZoom() { if (this.view?.resetZoom) this.view.resetZoom(); else this.zoom(null); return this; }
  resize() { this.W = 0; this.render('static'); return this; }
  toggleTable(force) {
    this.state.tableOpen = force === undefined ? !this.state.tableOpen : !!force;
    chTableRender(this, this.state.tableOpen);
    return this;
  }

  /* ── helpers for renderers ───────────────────────────────────────── */
  t(key, params) {
    const own = this.cfg?.texts;
    if (own) { const short = key.split('.').pop(); const v = own[key] ?? own[short]; if (v != null) return isFn(v) ? v(params || {}) : String(v).replace(/\{(\w+)\}/g, (m, p) => params?.[p] ?? m); }
    return t(key, params);
  }
  get locale() { return this.cfg?.locale || undefined; }
  font(weight = 400, size) { return `${weight} ${size || this.fontSize}px ${this.fontFamily}`; }
  /** Resolve a CSS color expression (var(--o-chart-2)) to rgb for luminance decisions. */
  resolveColor(expr) {
    let v = this._colors.get(expr);
    if (v) return v;
    this.els.probe.style.color = expr;
    v = getComputedStyle(this.els.probe).color;
    this._colors.set(expr, v);
    return v;
  }
  /** Scene: renderer-owned layers, rebuilt when the renderer family changes. */
  layers(names) {
    if (!this.scene || this.scene.names !== names.join()) {
      this.svg.replaceChildren();
      const defs = chEl('defs', null, this.svg);
      const clip = chEl('clipPath', { id: this.id + '-clip' }, defs);
      const clipRect = chEl('rect', null, clip);
      const L = { defs, clipRect, names: names.join(), list: {} };
      for (const n of names) L.list[n] = new ChLayer(this.svg, 'o-ch-layer o-ch-layer-' + n);
      this.scene = L;
    }
    return this.scene.list;
  }
  clip(x, y, w, hh) {
    chAttr(this.scene.clipRect, { x: r1(x) - 1, y: r1(y) - 2, width: Math.max(0, r1(w) + 2), height: Math.max(0, r1(hh) + 4) });
    return `url(#${this.id}-clip)`;
  }
  fmtValue(v, axis = 'y') {
    const a = (axis === 'x' ? this.cfg.xAxis : this.cfg.yAxis) || {};
    const key = axis + JSON.stringify([a.format, a.currency, a.decimals, a.prefix, a.suffix, this.cfg.locale, isFn(a.format) ? a.format.toString() : 0]);
    if (this._fk !== key) { this._fk = key; this._ff = chFormatter(a.format, { currency: a.currency, decimals: a.decimals, prefix: a.prefix, suffix: a.suffix, locale: this.cfg.locale }); }
    if (isFn(this.cfg.tooltip?.format) && axis === 'y') return String(this.cfg.tooltip.format(v));
    return this._ff(v);
  }

  /* ── rendering ───────────────────────────────────────────────────── */
  render(mode = 'static') {
    if (this._destroyed) return;
    const plot = this.els.plot;
    const c = this.cfg;
    if (!this.host.isConnected) { this._dirty = mode === 'resize' ? (this._dirty || 'enter') : mode; return; }
    const width = plot.clientWidth;
    if (!width) { this._dirty = mode === 'resize' ? (this._dirty || 'enter') : mode; return; }
    this._dirty = null;
    const cs = getComputedStyle(this.svg);
    this.fontSize = parseFloat(cs.fontSize) || 12;
    this.fontFamily = cs.fontFamily || 'system-ui, sans-serif';
    this.W = width;
    let model;
    try { model = this.R.prepare(this); } catch (e) { console.error('[Orion] chart prepare failed:', e); model = { empty: true }; }
    const prev = this.model && !this.model.empty ? this.model : null;
    this.model = model;
    // height
    const fill = this.host.classList.contains('is-fill');
    let hgt;
    if (fill) hgt = plot.clientHeight || 300;
    else if (c.height != null && c.height !== 'auto') hgt = isNum(+c.height) ? +c.height : c.height;
    else hgt = (!model.empty && this.R.autoHeight?.(this, model, width)) || this.R.defaultHeight || 300;
    if (!fill) plot.style.height = isNum(hgt) ? hgt + 'px' : String(hgt);
    this.W = width;
    this.H = fill ? hgt : plot.clientHeight || +hgt || 300;
    chAttr(this.svg, { width: this.W, height: this.H, viewBox: `0 0 ${this.W} ${this.H}` });
    // chrome that depends on the model
    this._legendItems = model.empty ? null : this.R.legend?.(this, model);
    const lg = c.legend || {};
    if (lg.show === false || !this._legendItems) chLegendRender(this, null);
    else if (this._legendItems.scale) chScaleLegend(this, this._legendItems.scale);
    else chLegendRender(this, lg.show === true || this._legendItems.length >= 2 ? this._legendItems : null);
    this.els.legend.removeAttribute(this.els.legend.classList.contains('is-scale') ? 'role' : 'aria-hidden');
    this.E_updateHead();
    this._tableCache = null;
    const summary = model.empty ? this.t('chart.noData') : (this.R.summary?.(this, model) || '');
    plot.setAttribute('aria-label', [c.title, c.description, summary].filter(Boolean).join('. '));
    this.els.hint.textContent = model.empty ? '' : this.t('chart.keyboard');
    this.els.empty.hidden = !model.empty;
    this.svg.style.visibility = model.empty ? 'hidden' : '';
    if (model.empty) { this.els.empty.textContent = c.empty || this.t('chart.noData'); this.view = null; this.svg.replaceChildren(); this.scene = null; chTipHide(this); }
    chTableRender(this, this.state.tableOpen);
    this.els.reset.hidden = !(this.state.zoom || this.view?.zoomed?.());
    this.E_updateHead();
    if (model.empty) return;
    this._run(mode, prev);
  }
  _run(mode, prev) {
    cancelAnimationFrame(this._raf); this._raf = 0;
    const c = this.cfg;
    if ((mode === 'update' || mode === 'stream') && !prev) mode = 'enter';
    const off = mode === 'static' || mode === 'resize' || c.animate === false || reducedMotion();
    const dur = off ? 0 : (CH_DUR[mode] ?? 0) * (isNum(c.animate) ? c.animate / CH_DUR.enter : 1);
    const run = (t, raw) => {
      try { this.view = this.R.render(this, this.model, { t, raw, mode: dur ? mode : 'static', prev }) || {}; }
      catch (e) { console.error('[Orion] chart render failed:', e); this.view = {}; }
    };
    if (!dur) { run(1, 1); this._afterFrame(); return; }
    if (this.state.active) { this.state.active = null; chTipHide(this); }
    const t0 = performance.now();
    run(0, 0);
    const step = now => {
      const raw = Math.min(1, (now - t0) / dur);
      run(easeOut(raw), raw);
      if (raw < 1) this._raf = requestAnimationFrame(step);
      else { this._raf = 0; this._afterFrame(); }
    };
    this._raf = requestAnimationFrame(step);
  }
  _afterFrame() {
    this._applyEmph();
    this.els.reset.hidden = !(this.state.zoom || this.view?.zoomed?.());
    this.E_updateHead();
    if (this.state.active) this._setActive(this.state.active, { refresh: true });
    this._fire('render', { type: this.cfg.type });
  }
  _tableData() {
    if (!this.model || this.model.empty) return null;
    if (!this._tableCache) { try { this._tableCache = this.R.table?.(this, this.model) || null; } catch (e) { console.error(e); this._tableCache = null; } }
    return this._tableCache;
  }

  /* ── interaction ─────────────────────────────────────────────────── */
  _fire(name, detail) { emit(this.host, 'o-' + name, detail); super.emit(name, detail); }
  _local(e) { const r = this.svg.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  _wire() {
    const plot = this.els.plot;
    let drag = null;
    const hover = rafThrottle(e => {
      if (!this.view || drag || this._raf) return;
      const p = this._local(e);
      const a = this.view.hit?.(p.x, p.y, e.target) || null;
      this._setActive(a, { pointer: p });
    });
    on(plot, 'pointermove', e => {
      if (drag) { const p = this._local(e); this.view?.dragMove?.(drag, p, e); return; }
      hover(e);
    });
    on(plot, 'pointerleave', () => { hover.cancel(); if (!drag && doc.activeElement !== plot) this._setActive(null); });
    on(plot, 'pointerdown', e => {
      if (e.button !== 0 || !this.view?.dragStart) return;
      const p = this._local(e);
      const d = this.view.dragStart(p, e);
      if (!d) return;
      drag = d; drag.moved = false;
      try { plot.setPointerCapture(e.pointerId); } catch {}
      this._setActive(null);
    });
    const endDrag = e => {
      if (!drag) return;
      const d = drag; drag = null;
      try { plot.releasePointerCapture(e.pointerId); } catch {}
      this.view?.dragEnd?.(d, this._local(e), e);
      this._suppressClick = d.moved;
    };
    on(plot, 'pointerup pointercancel', endDrag);
    on(plot, 'click', e => {
      if (this._suppressClick) { this._suppressClick = false; return; }
      if (!this.view) return;
      const p = this._local(e);
      const a = this.view.hit?.(p.x, p.y, e.target) || this.state.active;
      if (a) this._click(a);
    });
    on(plot, 'dblclick', e => {
      if (this.view?.dblclick) { e.preventDefault(); this.view.dblclick(this._local(e), e); }
      else if (this.state.zoom || this.view?.zoomed?.()) { e.preventDefault(); this.resetZoom(); }
    });
    on(plot, 'wheel', e => this.view?.wheel?.(this._local(e), e), { passive: false });
    on(plot, 'keydown', e => this._key(e));
    on(plot, 'focus', () => { if (plot.matches(':focus-visible') && !this.state.active && this.view?.first) this._setActive(this.view.first(), { keyboard: true }); });
    on(plot, 'blur', () => this._setActive(null));
  }
  _click(a) {
    const pt = this.view.point?.(a);
    if (pt) this._fire('point-click', pt);
  }
  _key(e) {
    const v = this.view;
    if (!v) return;
    if (v.key && v.key(e)) { e.preventDefault(); return; }
    const k = e.key;
    if (k === 'Escape') { if (this.state.active) { e.preventDefault(); e.stopPropagation(); this._setActive(null); } return; }
    if ((k === 'Enter' || k === ' ') && this.state.active) { e.preventDefault(); this._click(this.state.active); return; }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(k) || !v.nav) return;
    const next = this.state.active ? v.nav(this.state.active, k) : v.first?.();
    if (next) { e.preventDefault(); this._setActive(next, { keyboard: true }); }
  }
  _setActive(a, src = {}) {
    const prev = this.state.active;
    const same = a && prev && a.s === prev.s && a.i === prev.i && !src.refresh;
    this.state.active = a || null;
    const v = this.view;
    if (!v) return;
    if (!same || src.pointer || src.refresh) v.mark?.(a || null, src.pointer);
    if (!a) { chTipHide(this); return; }
    const tip = v.tip?.(a);
    const an = v.anchor?.(a, src.pointer) || { x: 0, y: 0 };
    const r = this.svg.getBoundingClientRect();
    chTipShow(this, tip, r.left + an.x, r.top + an.y, an.place || 'top');
    if (!same) {
      const pt = v.point?.(a);
      if (pt) {
        if (src.keyboard) announce(this.t('chart.point', { series: pt.name ?? '', label: pt.label ?? '', value: pt.text ?? pt.value ?? '' }).replace(/^,\s*/, ''));
        this._fire('point-hover', pt);
      }
    }
  }

  /* ── export ──────────────────────────────────────────────────────── */
  /** exportSVG({ legend = true, background = true }) -> standalone SVG string (colors inlined). */
  exportSVG({ legend = true, background = true } = {}) {
    const src = this.svg, W = this.W, H = this.H;
    if (!W) return '';
    const out = src.cloneNode(true);
    out.querySelectorAll('.o-ch-layer-hover').forEach(g => g.remove());
    const S = [...src.querySelectorAll('*')], C = [...out.querySelectorAll('*')];
    const sMap = new Map(S.map((el, i) => [el, i]));
    const props = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'fill-opacity', 'stroke-opacity', 'font-family', 'font-size', 'font-weight', 'text-anchor', 'dominant-baseline', 'visibility', 'display', 'stop-color', 'stop-opacity', 'paint-order'];
    C.forEach((el, i) => {
      const orig = S[i];
      if (!orig || !sMap.has(orig)) return;
      if (/^(defs|clipPath|linearGradient)$/.test(el.localName)) return;
      const cs = getComputedStyle(orig);
      el.setAttribute('style', props.map(p => { const v = cs.getPropertyValue(p); return v ? `${p}:${v}` : ''; }).filter(Boolean).join(';'));
      el.removeAttribute('class');
    });
    const top = legend && this._legendItems && Array.isArray(this._legendItems) && this._legendItems.length > 1 ? 30 : 0;
    const wrap = chEl('g', { transform: top ? `translate(0,${top})` : null });
    while (out.firstChild) wrap.appendChild(out.firstChild);
    const bg = this.resolveColor('var(--o-chart-surface)');
    if (background) chEl('rect', { x: 0, y: 0, width: W, height: H + top, fill: bg }, out);
    if (top) {
      const g = chEl('g', { 'font-family': this.fontFamily, 'font-size': 12 }, out);
      let x = 8;
      const ink = this.resolveColor('var(--o-text)');
      for (const it of this._legendItems) {
        if (it.hidden) continue;
        const fill = this.resolveColor(it.color);
        if (it.shape === 'line') chEl('rect', { x, y: 14, width: 14, height: 2, rx: 1, fill }, g);
        else chEl('rect', { x, y: 9, width: 12, height: 12, rx: 3, fill }, g);
        const tx = chEl('text', { x: x + 18, y: 19, fill: ink }, g); tx.textContent = it.name;
        x += 30 + chMeasure(it.name, this.font(400, 12));
      }
    }
    out.appendChild(wrap);
    chAttr(out, { width: W, height: H + top, viewBox: `0 0 ${W} ${H + top}`, xmlns: CH_NS, 'aria-hidden': null, class: null, style: null });
    if (this.cfg.title) { const ti = chEl('title'); ti.textContent = this.cfg.title; out.insertBefore(ti, out.firstChild); }
    return new XMLSerializer().serializeToString(out);
  }
  /** exportPNG({ scale = 2 }) -> Promise<Blob> */
  exportPNG({ scale = 2, background = true } = {}) {
    const svgStr = this.exportSVG({ background });
    return new Promise((resolve, reject) => {
      if (!svgStr) { reject(new Error('Chart is not rendered')); return; }
      const img = new Image();
      img.onload = () => {
        const cv = doc.createElement('canvas');
        cv.width = Math.ceil(img.width * scale); cv.height = Math.ceil(img.height * scale);
        const ctx = cv.getContext('2d');
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0);
        cv.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png');
      };
      img.onerror = () => reject(new Error('SVG rasterisation failed'));
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr);
    });
  }
  exportCSV() { return chCSV(this._tableData()); }
  async download(format = 'png', filename) {
    const base = filename || kebab(String(this.cfg.title || 'chart').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-')) || 'chart';
    if (format === 'svg') download(this.exportSVG(), base + '.svg', 'image/svg+xml');
    else if (format === 'csv') download('﻿' + this.exportCSV(), base + '.csv', 'text/csv;charset=utf-8');
    else download(await this.exportPNG(), base + '.png', 'image/png');
  }
  _downloadMenu(btn) {
    if (this._menu) { this._menu.close('api'); return; }
    const menu = h('div', { class: 'o-floating o-chart-menu', role: 'menu' });
    for (const f of ['png', 'svg', 'csv']) {
      const it = h('button', { type: 'button', role: 'menuitem', class: 'o-chart-menu-item', text: this.t('chart.downloadAs', { format: f.toUpperCase() }) });
      it.addEventListener('click', () => { this._menu?.close('api'); this.download(f); });
      menu.appendChild(it);
    }
    portal(menu, this.host);
    const unplace = autoPlace(menu, btn, { placement: 'bottom-end', offset: 4 });
    const nav = new ListNav(menu, { items: '[role=menuitem]' });
    menu.addEventListener('keydown', e => nav.handle(e));
    btn.setAttribute('aria-expanded', 'true');
    this._menu = overlays.open({ el: menu, owner: btn, onClose: () => { unplace(); menu.remove(); this._menu = null; btn.setAttribute('aria-expanded', 'false'); } });
    nav.first();
  }
}

/* ── <o-chart> ─────────────────────────────────────────────────────── */
class OChart extends OElement {
  static props = {
    type: { type: String },
    config: { type: Object, attr: 'config' },
    options: { type: Object },
    data: { type: Any },
    series: { type: Array },
    labels: { type: Array },
    height: { type: String },
    texts: { type: Object },
  };
  get chart() {
    if (!this._chart) this._chart = new Chart(this, this._cfg());
    return this._chart;
  }
  _cfg() {
    const c = merge({}, this.config || {}, this.options || {});
    if (this.type) c.type = this.type;
    if (this.series) c.series = this.series;
    if (this.labels) c.labels = this.labels;
    if (this.data != null) c.data = this.data;
    if (this.height) c.height = isNum(+this.height) ? +this.height : this.height;
    if (this.texts) c.texts = this.texts;
    return c;
  }
  setup() { this.chart; }
  connected() { this.chart.attach(); }
  disconnected() { this._chart?.detach(); }
  /** Lifecycle (Set of changed props) or the public update(config|data, opts) API. */
  update(arg, opts) {
    if (!(arg instanceof Set)) return this.chart.update(arg, opts);
    if (arg.has('init')) return;
    if (arg.has('config')) { this.chart._apply(this._cfg(), 'update'); return; }
    const patch = {};
    for (const k of arg) if (k in OChart.props && k !== 'config') patch[k === 'options' ? '__opts' : k] = this[k];
    if ('__opts' in patch) { Object.assign(patch, patch.__opts || {}); delete patch.__opts; }
    if ('height' in patch && patch.height != null) patch.height = isNum(+patch.height) ? +patch.height : patch.height;
    this.chart.update(patch);
  }
  setData(s, o) { return this.chart.setData(s, o); }
  append(v, o) { return this.chart.append(v, o); }
  setOptions(o, x) { return this.chart.setOptions(o, x); }
  highlight(i) { return this.chart.highlight(i); }
  toggleSeries(i, f) { return this.chart.toggleSeries(i, f); }
  toggleTable(f) { return this.chart.toggleTable(f); }
  zoom(a, b) { return this.chart.zoom(a, b); }
  resetZoom() { return this.chart.resetZoom(); }
  exportSVG(o) { return this.chart.exportSVG(o); }
  exportPNG(o) { return this.chart.exportPNG(o); }
  exportCSV() { return this.chart.exportCSV(); }
  download(f, n) { return this.chart.download(f, n); }
  resize() { return this.chart.resize(); }
  getData() { return this.chart.getData(); }
  destroy() { this._chart?.destroy(); this._chart = null; }
}
define('o-chart', OChart);

/** Orion.chart(el | selector, config) -> Chart */
function chartFactory(target, config = {}) {
  const el = $(target);
  if (!el) throw new Error('Orion.chart: element not found');
  if (el.localName === 'o-chart') { el.config = config; el.flush?.(); return el.chart; }
  const existing = el.querySelector(':scope > o-chart');
  if (existing && existing.__orionOwned) { existing.chart.update(config, { animate: true }); return existing.chart; }
  const oc = doc.createElement('o-chart');
  oc.__orionOwned = true;
  oc.config = { ...config };
  el.appendChild(oc);
  const c = oc.chart;
  c._owned = true;
  c.el = oc;
  return c;
}
chartFactory.register = chRegister;
chartFactory.types = () => Object.keys(CH_TYPES);
chartFactory.Chart = Chart;
O.chart = chartFactory;
O.Chart = Chart;
O.OChart = OChart;
