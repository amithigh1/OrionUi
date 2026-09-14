/* ── export: PNG (canvas), PDF (Orion PDF module or print), JSON ──────── */
let __gPx = null;
Object.assign(OGantt.prototype, {
  /** Resolve any CSS color (vars, color-mix) in this element's context to [r, g, b, a]. */
  _rgb(cssColor) {
    const cache = this._rgbCache || (this._rgbCache = new Map());
    if (cache.has(cssColor)) return cache.get(cssColor);
    const probe = h('span', { style: 'position:absolute;width:0;height:0;overflow:hidden' });
    this.append(probe);
    probe.style.color = cssColor;
    const c = getComputedStyle(probe).color;
    probe.remove();
    if (!__gPx) { const cv = doc.createElement('canvas'); cv.width = cv.height = 1; __gPx = cv.getContext('2d', { willReadFrequently: true }); }
    __gPx.clearRect(0, 0, 1, 1);
    __gPx.fillStyle = '#000'; __gPx.fillStyle = c;
    __gPx.fillRect(0, 0, 1, 1);
    const d = __gPx.getImageData(0, 0, 1, 1).data, out = [d[0], d[1], d[2], d[3] / 255];
    cache.set(cssColor, out);
    return out;
  },
  /**
   * Draw the chart on a canvas.
   *   opts: { scale = 2, grid = true, columns: ['name', …], range: 'all' | 'visible', rows: 'all' | 'visible' }
   */
  toCanvas(opts = {}) {
    this._rgbCache = new Map();
    const rgb = c => this._rgb(c), css = a => `rgba(${a[0]},${a[1]},${a[2]},${a[3]})`;
    const mix = (a, b, t) => [0, 1, 2].map(i => Math.round(a[i] * t + b[i] * (1 - t))).concat(1);
    const C = {
      surface: rgb('var(--o-surface)'), s2: rgb('var(--o-surface-2)'), border: rgb('var(--o-border)'), text: rgb('var(--o-text)'),
      muted: rgb('var(--o-text-muted)'), weekend: rgb('var(--o-gantt-weekend)'), holiday: rgb('var(--o-gantt-holiday)'), today: rgb('var(--o-gantt-today)'),
      task: rgb('var(--o-gantt-task)'), ms: rgb('var(--o-gantt-milestone)'), sum: rgb('var(--o-gantt-summary)'), crit: rgb('var(--o-gantt-critical)'),
    };
    const rh = this._rh, headH = G_TIER_H * 2, rtl = isRTL(this);
    const visible = opts.range === 'visible';
    const sx = visible ? this._scrollX() : 0, vw = visible ? this._chartW : this._totalW;
    const rowKeys = opts.rows === 'visible' || visible
      ? this._rows.slice(Math.floor(this._chartEl.scrollTop / rh), Math.ceil((this._chartEl.scrollTop + this._chartH) / rh))
      : this._rows;
    const want = opts.grid === false ? [] : toArr(opts.columns || (this._colsTotal > 620 ? ['name'] : this._cols.map(c => c.key)));
    const cols = this._cols.filter(c => want.includes(c.key));
    const gw = cols.reduce((s, c) => s + c.width, 0);
    const W = Math.ceil(gw + vw), H = headH + rowKeys.length * rh;
    let scale = +opts.scale || 2;
    scale = Math.max(0.1, Math.min(scale, 16000 / W, 16000 / H, Math.sqrt(2.4e8 / (W * H))));
    const cv = doc.createElement('canvas');
    cv.width = Math.round(W * scale); cv.height = Math.round(H * scale);
    const ctx = cv.getContext('2d');
    ctx.scale(scale, scale);
    const font = getComputedStyle(this).fontFamily;
    const setFont = (px, w = 400) => { ctx.font = `${w} ${px}px ${font}`; };
    ctx.direction = rtl ? 'rtl' : 'ltr';
    // x mapping: chart logical x -> canvas x ; grid logical x -> canvas x
    const X = x => (rtl ? vw - (x - sx) : gw + (x - sx));
    const GX = x => (rtl ? W - x : x);
    const rect = (x, y, w, hh, color) => { ctx.fillStyle = css(color); ctx.fillRect(rtl ? X(x) - w : X(x), y, w, hh); };
    ctx.fillStyle = css(C.surface); ctx.fillRect(0, 0, W, H);
    const d0 = Math.floor(this._dayAt(sx)), d1 = Math.ceil(this._dayAt(sx + vw)), [top, bot] = gTiers(this._dw), ws = date.weekStart(), dw = this._dw;
    // background: non-working days
    if (dw >= 3.5 && !this._cal.all) for (let n = d0; n < d1; n++) if (!this._cal.isWorking(n)) rect(this._x(n), headH, dw, H - headH, this._cal.hol.has(n) ? C.holiday : C.weekend);
    // header
    ctx.fillStyle = css(C.s2); ctx.fillRect(rtl ? 0 : gw, 0, vw, headH);
    const tier = (unit, y, isTop) => {
      setFont(11, isTop ? 600 : 400);
      for (const [a, b] of gCells(unit, d0, d1, ws)) {
        const x = this._x(a), wd = (b - a) * dw;
        ctx.fillStyle = css(C.border); ctx.fillRect(X(x) - (rtl ? 1 : 0), y, 1, G_TIER_H);
        ctx.fillRect(X(x) - (rtl ? 1 : 0), headH, 1, H - headH);
        ctx.fillStyle = css(isTop ? C.text : C.muted);
        ctx.textBaseline = 'middle';
        const label = gCellLabel(a, unit, wd, isTop, this);
        const vis0 = Math.max(x, sx), lx = isTop ? vis0 + 6 : x + wd / 2;
        ctx.textAlign = isTop ? (rtl ? 'right' : 'left') : 'center';
        ctx.save(); ctx.beginPath(); ctx.rect(rtl ? X(x) - wd : X(x), y, wd, G_TIER_H); ctx.clip();
        ctx.fillText(label, X(lx), y + G_TIER_H / 2 + 0.5);
        ctx.restore();
      }
    };
    tier(top, 0, true); tier(bot, G_TIER_H, false);
    ctx.fillStyle = css(C.border);
    ctx.fillRect(rtl ? 0 : gw, G_TIER_H, vw, 1); ctx.fillRect(0, headH - 1, W, 1);
    // rows
    const rowY = new Map();
    rowKeys.forEach((k, i) => rowY.set(k, headH + i * rh));
    ctx.fillStyle = css(mix(C.border, C.surface, 0.7));
    rowKeys.forEach((k, i) => ctx.fillRect(0, headH + (i + 1) * rh - 1, W, 1));
    // grid columns
    if (cols.length) {
      ctx.fillStyle = css(C.s2); ctx.fillRect(GX(rtl ? gw : 0), 0, gw, headH);
      let cx = 0;
      setFont(11, 600);
      for (const c of cols) {
        ctx.fillStyle = css(C.muted); ctx.textAlign = rtl ? 'right' : 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(String(c.label).toUpperCase(), GX(cx + 10), headH - 14);
        ctx.fillStyle = css(C.border); ctx.fillRect(GX(cx + c.width) - (rtl ? 0 : 1), 0, 1, H);
        cx += c.width;
      }
      rowKeys.forEach(k => {
        const y = rowY.get(k), r = this._rec(k), p = this._posOf(k);
        let x = 0;
        for (const c of cols) {
          ctx.save(); ctx.beginPath(); ctx.rect(GX(rtl ? x + c.width : x), y, c.width - 1, rh); ctx.clip();
          const lvl = c.tree ? this._tree.level.get(k) * 18 + (this._isSum(k) ? 0 : 0) : 0;
          const txt = c.key === 'progress' && !r.ms ? fmt.percent((p.progress || 0) / 100) : this._cellValue(k, c);
          setFont(12, c.tree && this._isSum(k) ? 600 : 400);
          ctx.fillStyle = css(C.text); ctx.textBaseline = 'middle';
          ctx.textAlign = c.align === 'end' ? (rtl ? 'left' : 'right') : (rtl ? 'right' : 'left');
          ctx.fillText(txt, GX(c.align === 'end' ? x + c.width - 10 : x + 10 + lvl), y + rh / 2);
          ctx.restore();
          x += c.width;
        }
      });
    }
    // links
    ctx.save();
    ctx.beginPath(); ctx.rect(rtl ? 0 : gw, headH, vw, H - headH); ctx.clip();
    for (const L of this._links) {
      if (!rowY.has(L.a) || !rowY.has(L.b)) continue;
      const ia = this._rowIndex.get(L.a), ib = this._rowIndex.get(L.b);
      const A = this._anchor(L.a, ia), B = this._anchor(L.b, ib);
      A.y = rowY.get(L.a) + (A.y - ia * rh); B.y = rowY.get(L.b) + (B.y - ib * rh);
      const R = gLinkRoute(L.type, A, B, rh), pts = R.pts;
      const crit = L.direct && this._cp?.links.has(L.key);
      ctx.strokeStyle = css(crit ? C.crit : C.muted); ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = crit ? 2 : 1.4;
      const last = pts[pts.length - 1], prev = pts[pts.length - 2], len = Math.hypot(last[0] - prev[0], last[1] - prev[1]) || 1;
      ctx.beginPath();
      pts.forEach(([x, y], i) => {
        if (i === pts.length - 1) { x -= (x - prev[0]) / len * 5; y -= (y - prev[1]) / len * 5; }
        if (i) ctx.lineTo(X(x), y); else ctx.moveTo(X(x), y);
      });
      ctx.stroke();
      const dir = R.dir === 'left' || R.dir === 'right' ? ((R.dir === 'right') !== rtl ? 'right' : 'left') : R.dir;
      ctx.fill(new Path2D(gArrowD(X(R.tip[0]), R.tip[1], dir, 5)));
    }
    // bars
    for (const k of rowKeys) {
      const i = this._rowIndex.get(k), g = this._geom(k, i), r = this._rec(k), p = g.p, y = rowY.get(k) + g.top;
      const crit = this._cp?.critical.has(k), sum = this._isSum(k);
      const colorCss = gColor(r.color);
      const base = crit ? C.crit : colorCss ? rgb(colorCss) : r.ms ? C.ms : sum ? C.sum : C.task;
      if (this.baselines && r.bs != null) {
        ctx.fillStyle = css(mix(C.muted, C.surface, 0.45));
        if (r.ms) { const bx = X(this._x(r.bs)); ctx.fillRect(bx - 3, y + g.h + 3, 6, 5); }
        else { const bx = this._x(r.bs), bw = Math.max(2, (r.be - r.bs) * dw); ctx.fillRect(rtl ? X(bx) - bw : X(bx), y + g.h + 3, bw, 5); }
      }
      if (r.ms) {
        const cx = X(g.cx), cy = y + g.h / 2, s = g.h / 2;
        ctx.fillStyle = css(base);
        ctx.beginPath(); ctx.moveTo(cx, cy - s); ctx.lineTo(cx + s, cy); ctx.lineTo(cx, cy + s); ctx.lineTo(cx - s, cy); ctx.closePath(); ctx.fill();
      } else {
        const bx = rtl ? X(g.x) - g.w : X(g.x);
        const round = (x, yy, w, hh, rr) => { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, yy, w, hh, rr); else ctx.rect(x, yy, w, hh); };
        if (sum) {
          ctx.fillStyle = css(mix(base, C.surface, 0.45)); round(bx, y, g.w, g.h, 2); ctx.fill();
          ctx.fillStyle = css(base);
          const pw = g.w * (p.progress || 0) / 100; ctx.fillRect(rtl ? bx + g.w - pw : bx, y, pw, g.h);
          ctx.beginPath(); ctx.moveTo(bx, y + g.h); ctx.lineTo(bx + 6, y + g.h); ctx.lineTo(bx, y + g.h + 6); ctx.fill();
          ctx.beginPath(); ctx.moveTo(bx + g.w, y + g.h); ctx.lineTo(bx + g.w - 6, y + g.h); ctx.lineTo(bx + g.w, y + g.h + 6); ctx.fill();
        } else {
          ctx.fillStyle = css(mix(base, C.surface, 0.24)); round(bx, y, g.w, g.h, 5); ctx.fill();
          const pw = g.w * (p.progress || 0) / 100;
          if (pw > 0) { ctx.save(); round(bx, y, g.w, g.h, 5); ctx.clip(); ctx.fillStyle = css(mix(base, C.surface, 0.72)); ctx.fillRect(rtl ? bx + g.w - pw : bx, y, pw, g.h); ctx.restore(); }
          ctx.strokeStyle = css(crit ? C.crit : mix(base, C.surface, 0.55)); ctx.lineWidth = crit ? 1.5 : 1;
          round(bx + 0.5, y + 0.5, g.w - 1, g.h - 1, 5); ctx.stroke();
        }
      }
      // labels
      setFont(11, sum ? 600 : 500);
      ctx.textBaseline = 'middle';
      const names = r.assignees.map(gAssigneeName).filter(Boolean);
      const inside = !r.ms && !sum && g.w >= this._measure(r.name) + 16;
      const cy = y + g.h / 2;
      if (inside) {
        ctx.save(); ctx.beginPath(); ctx.rect(rtl ? X(g.x) - g.w : X(g.x), y, g.w, g.h); ctx.clip();
        ctx.fillStyle = css(C.text); ctx.textAlign = rtl ? 'right' : 'left'; ctx.fillText(r.name, X(g.x + 8), cy + 0.5); ctx.restore();
      }
      const after = (inside ? '' : r.name) + (names.length ? (inside ? '' : ' · ') + names[0] + (names.length > 1 ? ' +' + (names.length - 1) : '') : '');
      if (after) { ctx.fillStyle = css(inside ? C.muted : C.text); ctx.textAlign = rtl ? 'right' : 'left'; ctx.fillText(after, X(r.ms ? g.cx + g.half + 6 : g.x + g.w + 8), cy + 0.5); }
    }
    ctx.restore();
    // today
    if (this.todayLine) {
      const tx = this._x(gDayF(new Date()));
      if (tx >= sx && tx <= sx + vw) { ctx.fillStyle = css(C.today); ctx.fillRect(X(tx) - 1, 0, 2, H); }
    }
    ctx.fillStyle = css(C.border);
    if (cols.length) ctx.fillRect(rtl ? W - gw : gw - 1, 0, 1, H);
    return cv;
  },
  /** exportPNG({ scale, grid, columns, range, filename, download = true }) -> Promise<Blob> */
  async exportPNG(opts = {}) {
    const cv = this.toCanvas(opts);
    const blob = await new Promise(res => cv.toBlob(res, 'image/png'));
    if (blob && opts.download !== false) download(blob, (opts.filename || 'gantt') + '.png');
    this.emit('export', { format: 'png', blob }, { cancelable: false });
    return blob;
  },
  /**
   * exportPDF({ filename, orientation = 'landscape', …toCanvas opts }) -> Promise
   * Uses the Orion PDF module when it is loaded, otherwise opens the browser print dialog (Save as PDF).
   */
  async exportPDF(opts = {}) {
    const cv = this.toCanvas({ scale: 2, ...opts });
    const url = cv.toDataURL('image/png'), name = (opts.filename || 'gantt') + '.pdf';
    const P = O.PDF || O.pdf;
    const land = (opts.orientation || 'landscape') === 'landscape';
    try {
      if (P && isFn(P.fromImage)) { const out = await P.fromImage(url, { filename: name, orientation: land ? 'landscape' : 'portrait', width: cv.width, height: cv.height }); this.emit('export', { format: 'pdf', result: out }, { cancelable: false }); return out; }
      if (isFn(P)) {
        const pdf = new P({ orientation: land ? 'landscape' : 'portrait', unit: 'pt' });
        if (isFn(pdf.addImage) && isFn(pdf.save)) {
          const pw = pdf.width || pdf.internal?.pageSize?.getWidth?.() || (land ? 842 : 595), ph = pdf.height || pdf.internal?.pageSize?.getHeight?.() || (land ? 595 : 842);
          const s = Math.min((pw - 48) / cv.width, (ph - 48) / cv.height);
          pdf.addImage(url, 'PNG', 24, 24, cv.width * s, cv.height * s);
          await pdf.save(name);
          this.emit('export', { format: 'pdf' }, { cancelable: false });
          return pdf;
        }
      }
    } catch (e) { console.warn('[Orion] o-gantt: PDF module failed, falling back to print', e); }
    const result = await this._printImage(url, land);
    this.emit('export', { format: 'pdf', result }, { cancelable: false });
    return result;
  },
  _printImage(url, land) {
    const frame = h('iframe', { style: 'position:fixed;width:0;height:0;border:0;inset-inline-start:-9999px', 'aria-hidden': 'true', title: 'print' });
    doc.body.append(frame);
    const d = frame.contentDocument;
    d.open();
    d.write(`<!doctype html><html><head><title>${esc(this.label || this.t('gantt.label'))}</title><style>@page{size:${land ? 'landscape' : 'portrait'};margin:10mm}html,body{margin:0}img{display:block;max-width:100%;max-height:100vh;margin:auto}</style></head><body><img alt=""></body></html>`);
    d.close();
    const img = d.querySelector('img');
    return new Promise(resolve => {
      img.onload = () => {
        announce(this.t('gantt.pdfFallback'));
        try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch {}
        setTimeout(() => { frame.remove(); resolve(null); }, 1500);
      };
      img.src = url;
    });
  },
  /** exportJSON({ download = true, filename, space = 2 }) -> JSON string of getTasks() */
  exportJSON(opts = {}) {
    const json = JSON.stringify(this.getTasks(), null, opts.space ?? 2);
    if (opts.download !== false) download(json, (opts.filename || 'gantt') + '.json', 'application/json');
    this.emit('export', { format: 'json' }, { cancelable: false });
    return json;
  },
});
