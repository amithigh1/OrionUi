/* ── timeline rendering: header tiers, calendar background, bars, links ── */
let __gCtx = null;
Object.assign(OGantt.prototype, {
  /** Text width in px (canvas measure, cached per font). */
  _measure(text) {
    if (!text) return 0;
    if (!this._mcache || this._mcache.v !== this._layoutV) {
      const cs = getComputedStyle(this._bars);
      this._mcache = { v: this._layoutV, font: `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`, map: new Map() };
    }
    const m = this._mcache;
    let w = m.map.get(text);
    if (w == null) {
      if (!__gCtx) __gCtx = doc.createElement('canvas').getContext('2d');
      __gCtx.font = m.font;
      w = __gCtx.measureText(text).width;
      if (m.map.size > 4000) m.map.clear();
      m.map.set(text, w);
    }
    return w;
  },

  /* ── header ── */
  _renderScale(w) {
    const [top, bot] = gTiers(this._dw), ws = date.weekStart();
    const d0 = Math.floor(this._dayAt(w.x0)), d1 = Math.ceil(this._dayAt(w.x1)), today = gToday();
    const tier = (unit, isTop) => {
      let s = '';
      for (const [a, b] of gCells(unit, d0, d1, ws)) {
        const x = this._x(a), wd = (b - a) * this._dw;
        let c = 'o-gantt-tcell';
        if (unit === 'day') {
          if (this._cal.isWeekend(a)) c += ' is-weekend';
          if (this._cal.hol.has(a)) c += ' is-holiday';
          if (a === today) c += ' is-today';
        } else if (today >= a && today < b && !isTop) c += ' is-current';
        const hol = unit === 'day' ? this._cal.holiday(a) : null;
        s += `<div class="${c}" style="inset-inline-start:${x}px;width:${wd}px"${hol ? ` title="${esc(hol || this.t('gantt.holiday'))}"` : ''}><span>${esc(gCellLabel(a, unit, wd, isTop, this))}</span></div>`;
      }
      return s;
    };
    this._tierTop.innerHTML = tier(top, true);
    this._tierBot.innerHTML = tier(bot, false);
  },

  /* ── calendar background: non-working days, holidays, grid lines ── */
  _renderBg(w) {
    const dw = this._dw, cal = this._cal, [top, bot] = gTiers(dw), ws = date.weekStart();
    const d0 = Math.floor(this._dayAt(w.x0)), d1 = Math.ceil(this._dayAt(w.x1));
    let s = '';
    if (dw >= 3.5 && !cal.all) {
      for (let n = d0; n < d1; n++) {
        if (cal.isWorking(n)) continue;
        const hol = cal.hol.has(n);
        let m = n + 1;
        if (!hol) while (m < d1 && !cal.isWorking(m) && !cal.hol.has(m)) m++;
        s += `<div class="o-gantt-off${hol ? ' is-holiday' : ''}" style="inset-inline-start:${this._x(n)}px;width:${(m - n) * dw}px"${hol ? ` title="${esc(cal.holiday(n) || this.t('gantt.holiday'))}"` : ''}></div>`;
        n = m - 1;
      }
    }
    const major = new Set(gCells(top, d0, d1, ws).map(c => c[0]));
    for (const [a] of gCells(bot, d0, d1, ws)) s += `<div class="o-gantt-vline${major.has(a) ? ' is-major' : ''}" style="inset-inline-start:${this._x(a)}px"></div>`;
    this._bg.innerHTML = s;
  },

  /* ── bars ── */
  _geom(k, i) {
    const r = this._rec(k), p = this._previewPos(k) || this._posOf(k), rh = this._rh, sum = this._isSum(k);
    const base = this.baselines && this._hasBase;
    const y = i * rh;
    if (r.ms) {
      const size = Math.round(rh * 0.5), cx = this._x(p.s);
      return { ms: true, x: cx - size / 2, w: size, y, top: Math.round((rh - size) / 2) - (base ? 3 : 0), h: size, cx, half: size / 2, p };
    }
    const hh = sum ? Math.max(8, Math.round(rh * 0.26)) : Math.round(rh * (base ? 0.46 : 0.56));
    const x = this._x(p.s), wd = Math.max(sum ? 4 : 3, (p.e - p.s) * this._dw);
    return { x, w: wd, y, top: Math.round((rh - hh) / 2) - (base && !sum ? 3 : 0), h: hh, sum, p };
  },
  _anchor(k, i) {
    const g = this._geom(k, i), y = g.y + g.top + g.h / 2;
    return g.ms ? { xs: g.cx - g.half, xe: g.cx + g.half, y, ms: true, cx: g.cx, half: g.half } : { xs: g.x, xe: g.x + g.w, y };
  },
  _renderBars(w) {
    this._hasBase = this._recs.some(r => r.bs != null);
    const need = new Set();
    for (let i = w.r0; i <= w.r1; i++) need.add(this._rows[i]);
    if (this._drag?.k != null && this._rowIndex.has(this._drag.k)) need.add(this._drag.k);
    for (const [k, el] of this._barEls) if (!need.has(k)) { this._barEls.delete(k); el.remove(); this._barFree.push(el); }
    for (const k of need) {
      const i = this._rowIndex.get(k);
      if (i == null) continue;
      const g = this._geom(k, i);
      if (g.x > w.x1 + 400 || (g.x + g.w) < w.x0 - 600) { const el = this._barEls.get(k); if (el) { this._barEls.delete(k); el.remove(); this._barFree.push(el); } continue; }
      let el = this._barEls.get(k);
      if (!el) { el = this._barFree.pop() || this._createBar(); el.__sig = null; this._barEls.set(k, el); }
      this._updateBar(el, k, i, g);
      if (el.parentNode !== this._bars) this._bars.append(el);
    }
    if (this._barFree.length > 80) this._barFree.length = 80;
  },
  _createBar() {
    return h('div', { class: 'o-gantt-trow' },
      h('div', { class: 'o-gantt-bar' },
        h('div', { class: 'o-gantt-fill' }), h('span', { class: 'o-gantt-label' }),
        h('span', { class: 'o-gantt-handle is-start', 'data-h': 'start' }), h('span', { class: 'o-gantt-handle is-end', 'data-h': 'end' }),
        h('span', { class: 'o-gantt-pgrip', 'data-h': 'progress' }),
        h('span', { class: 'o-gantt-dot is-start', 'data-dot': 'start' }), h('span', { class: 'o-gantt-dot is-end', 'data-dot': 'end' })),
      h('span', { class: 'o-gantt-after' }, h('b'), h('span')), h('div', { class: 'o-gantt-baseline' }));
  },
  _updateBar(el, k, i, g) {
    const r = this._rec(k), sum = this._isSum(k), crit = !!this._cp?.critical.has(k), sel = k === this._sel;
    const p = g.p, prev = !!this._previewPos(k);
    const sig = el.__sig;
    if (sig && sig.r === r && sig.s === p.s && sig.e === p.e && sig.pr === p.progress && sig.i === i && sig.sel === sel && sig.crit === crit && sig.v === this._layoutV && sig.sum === sum && !prev && !sig.prev) return;
    el.__sig = { r, s: p.s, e: p.e, pr: p.progress, i, sel, crit, v: this._layoutV, sum, prev };
    el.style.transform = `translateY(${g.y}px)`;
    const [bar, after, base] = el.children;
    bar.dataset.k = k;
    bar.className = cls('o-gantt-bar', sum ? 'is-summary' : r.ms ? 'is-milestone' : 'is-task', crit && 'is-critical', sel && 'is-selected', prev && 'is-preview',
      !sum && !r.ms && p.progress >= 100 && 'is-done', this.readonly && 'is-locked');
    const color = gColor(r.color);
    bar.style.cssText = `inset-inline-start:${g.x}px;width:${g.w}px;top:${g.top}px;height:${g.h}px;${color ? `--o-gantt-bar:${color};` : ''}`;
    const fill = bar.firstChild, label = fill.nextSibling;
    fill.style.width = r.ms ? '0' : (p.progress || 0) + '%';
    bar.querySelector('.o-gantt-pgrip').style.insetInlineStart = (p.progress || 0) + '%';
    const names = r.assignees.map(gAssigneeName).filter(Boolean);
    const who = names.length ? names[0] + (names.length > 1 ? ' +' + (names.length - 1) : '') : '';
    const inside = !r.ms && !sum && g.w >= this._measure(r.name) + 16;
    label.textContent = inside ? r.name : '';
    after.firstChild.textContent = inside ? '' : r.name;
    after.lastChild.textContent = who;
    after.className = cls('o-gantt-after', sum && 'is-summary');
    after.style.insetInlineStart = (r.ms ? g.cx + g.half + 6 : g.x + g.w + 8) + 'px';
    after.style.top = (g.top + g.h / 2) + 'px';
    if (this.baselines && r.bs != null) {
      base.hidden = false;
      const bx = this._x(r.bs), bw = r.ms ? 0 : Math.max(2, (r.be - r.bs) * this._dw);
      const late = !r.ms && p.e > r.be, early = !r.ms && p.e < r.be;
      base.className = cls('o-gantt-baseline', r.ms && 'is-milestone', late && 'is-late', early && 'is-early');
      base.style.cssText = r.ms ? `inset-inline-start:${bx - 5}px;top:${g.top + g.h + 3}px` : `inset-inline-start:${bx}px;width:${bw}px;top:${g.top + g.h + 3}px`;
    } else base.hidden = true;
  },
  _previewPos(k) {
    const P = this._preview;
    if (!P) return null;
    const r = this._rec(k), cal = this._cal;
    if (P.mode === 'move' && P.keys.has(k)) {
      if (this._isSum(k)) { const q = this._posOf(k); return { s: q.s + P.delta, e: q.e + P.delta, progress: q.progress }; }
      const s = P.delta ? gSnapStart(r, r.s + P.delta, Math.sign(P.delta), cal) : r.s;
      return { s, e: r.ms ? s : cal.endFor(s, r.dur), progress: r.progress };
    }
    if (k !== P.k) return null;
    if (P.mode === 'progress') return { s: r.s, e: r.e, progress: P.progress };
    if (P.mode === 'start' || P.mode === 'end') return P.pos;
    return null;
  },

  /* ── dependency arrows ── */
  _renderLinks(w) {
    const rh = this._rh, cp = this._cp, rows = this._rowIndex;
    const y0 = w.r0 * rh, y1 = (w.r1 + 1) * rh;
    const svgEl = this._svg;
    svgEl.style.insetInlineStart = w.x0 + 'px';
    svgEl.style.top = y0 + 'px';
    svgEl.setAttribute('width', String(Math.max(1, w.x1 - w.x0)));
    svgEl.setAttribute('height', String(Math.max(1, y1 - y0)));
    svgEl.setAttribute('viewBox', `${w.x0} ${y0} ${Math.max(1, w.x1 - w.x0)} ${Math.max(1, y1 - y0)}`);
    let s = '';
    this._links.forEach((L, idx) => {
      const ia = rows.get(L.a), ib = rows.get(L.b);
      if (ia == null || ib == null || Math.max(ia, ib) < w.r0 || Math.min(ia, ib) > w.r1) return;
      const A = this._anchor(L.a, ia), B = this._anchor(L.b, ib);
      const R = gLinkRoute(L.type, A, B, rh), x1 = R.pts[0][0], x2 = R.tip[0];
      if (Math.min(x1, x2) - 40 > w.x1 || Math.max(x1, x2) + 40 < w.x0) return;
      const d = gPathD(R.pts, 5, 5);
      const crit = L.direct && cp?.links.has(L.key);
      const rel = this._sel != null && (L.p === this._sel || L.t === this._sel);
      const c = cls('o-gantt-link', crit && 'is-critical', this._selLink === L.key && 'is-selected', rel && 'is-related', !L.direct && 'is-indirect');
      s += `<g class="${c}" data-i="${idx}"><path class="o-gantt-link-hit" d="${d}"/><path class="o-gantt-link-line" d="${d}"/><path class="o-gantt-link-head" d="${gArrowD(R.tip[0], R.tip[1], R.dir)}"/></g>`;
    });
    this._linksG.innerHTML = s;
  },

  /* ── today, bands ── */
  _renderToday() {
    const on = this.todayLine && this._tree;
    const x = on ? this._x(gDayF(new Date())) : -1;
    const show = on && x >= 0 && x <= this._totalW;
    this._today.hidden = this._scaleToday.hidden = !show;
    if (!show) return;
    this._today.style.insetInlineStart = x + 'px';
    this._scaleToday.style.insetInlineStart = x + 'px';
    this._scaleToday.textContent = this.t('gantt.today');
  },
  _renderSel() {
    const i = this._sel != null ? this._rowIndex.get(this._sel) : null;
    this._selBand.hidden = i == null;
    if (i != null) this._selBand.style.transform = `translateY(${i * this._rh}px)`;
  },
  _hover(k) {
    if (k === this._hoverK) return;
    this._hoverK = k;
    const i = k != null ? this._rowIndex.get(k) : null;
    this._hoverBand.hidden = i == null;
    if (i != null) this._hoverBand.style.transform = `translateY(${i * this._rh}px)`;
    this._gbody.querySelector('.o-gantt-row.is-hover')?.classList.remove('is-hover');
    if (k != null) this._rowEls.get(k)?.classList.add('is-hover');
  },
});
