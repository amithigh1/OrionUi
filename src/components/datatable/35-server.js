/* ── server-side processing: source(query) / url template, abort, infinite loading ── */
const DT_SERVER = {
  /** Fetch the current query from `source` or `url`. Stale responses are ignored and aborted. */
  _fetch() {
    if (!this._server) return Promise.resolve();
    if (!this.isConnected) { this._needsFetch = true; return Promise.resolve(); }
    this._needsFetch = false;
    const append = !!this._appendNext;
    this._appendNext = false;
    const q = this.getQuery(), id = ++this._reqId;
    try { this._abort?.abort(); } catch {}
    const ac = win.AbortController ? new AbortController() : null;
    this._abort = ac;
    this._error = null;
    this._setBusy(true);
    return (async () => {
      try {
        const raw = this.source ? await this.source(q, { signal: ac?.signal, table: this }) : await this._fetchUrl(q, ac?.signal);
        if (id !== this._reqId) return;
        const res = this._normalizeResponse(raw);
        this._data = append ? [...this._data, ...res.rows] : res.rows;
        this._total = res.total;
        this._facets = res.facets || null;
        this._aggs = res.aggregates || null;
        this._loaded = true;
        const m = new Map();
        for (const r of this._data) m.set(this.keyOf(r), r);
        for (const [k, r] of this._sel) if (!m.has(k)) m.set(k, r);
        this._byKey = m;
        this._run();
        this._setBusy(false);
        this._render();
        this.emit('load', { rows: res.rows, total: res.total, query: q });
        if (!append) announce(this.t('table.results', { count: res.total }));
      } catch (e) {
        if (id !== this._reqId || e?.name === 'AbortError') return;
        this._error = e || new Error('error');
        this._setBusy(false);
        this._render();
        this.emit('error', { error: this._error, query: q });
      } finally {
        if (id === this._reqId && this._busy) { this._setBusy(false); this._render(); }
      }
    })();
  },
  async _fetchUrl(q, signal) {
    const sort = q.sort.map(s => s.key + ':' + s.dir).join(',');
    const vals = { page: q.page, pageSize: q.pageSize, size: q.pageSize, limit: q.pageSize, offset: (q.page - 1) * q.pageSize, search: q.search, q: q.search, sort, sortKey: q.sort[0]?.key || '', dir: q.sort[0]?.dir || '', filters: JSON.stringify(q.filters) };
    let u = this.url;
    if (/\{\w+\}/.test(u)) u = u.replace(/\{(\w+)\}/g, (m, k) => encodeURIComponent(vals[k] ?? ''));
    else {
      const url = new URL(u, location.href), sp = url.searchParams;
      sp.set('page', q.page); sp.set('pageSize', q.pageSize);
      if (q.search) sp.set('search', q.search);
      if (sort) sp.set('sort', sort);
      for (const [k, v] of Object.entries(q.filters)) sp.set(`filter[${k}]`, isObj(v) || Array.isArray(v) ? JSON.stringify(v) : v);
      u = url.href;
    }
    const o = this.fetchOptions || {};
    const res = await fetch(u, { ...o, signal, headers: { Accept: 'application/json', ...(o.headers || {}) } });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`.trim());
    const json = await res.json();
    return this.mapResponse ? this.mapResponse(json, q) : json;
  },
  /** Accepts { rows, total } and common shapes ({ data, items, results, records, totalCount, meta.total }). */
  _normalizeResponse(res) {
    if (Array.isArray(res)) return { rows: res, total: res.length };
    res = res || {};
    const rows = toArr(res.rows || res.data || res.items || res.results || res.records);
    const total = res.total ?? res.totalCount ?? res.count ?? res.recordsFiltered ?? res.meta?.total ?? rows.length;
    return { rows, total: Math.max(0, +total || 0), facets: res.facets, aggregates: res.aggregates };
  },
  _setBusy(on) {
    this._busy = !!on;
    const show = this._busy || this.loading;
    this._bar.hidden = !(show && (this._loaded || this._data.length));
    this._table.setAttribute('aria-busy', show ? 'true' : 'false');
    this.classList.toggle('is-busy', show);
  },

  /* ── infinite loading (client: reveal more; server: fetch next page) ── */
  _watchInfinite() {
    this._stopInfinite?.();
    if (!(this.infinite || (this.virtual && this._server)) || !win.IntersectionObserver) return;
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) this._loadMore(); }, { root: this._ownScroll ? this._scroll : null, rootMargin: '240px' });
    io.observe(this._sentinel);
    this._stopInfinite = () => { io.disconnect(); this._stopInfinite = null; };
  },
  _hasMore() {
    if (this._server) return this._loaded && this._data.length < this._total;
    return this.infinite && this._limit < (this._items || []).length;
  },
  _loadMore() {
    if (this._busy || this._error || !this._hasMore()) return;
    if (this._server) {
      this._appendNext = true;
      this._p.page = Math.floor(this._data.length / Math.max(1, +this.pageSize || 10)) + 1;
      this._fetch();
    } else {
      this._limit += Math.max(1, +this.pageSize || 10);
      this._render();
    }
  },
  /** After rendering: keep loading while the sentinel is still on screen (IntersectionObserver only fires on change). */
  _checkSentinel() {
    if (!this.isConnected || !this._hasMore() || this._busy) return;
    const r = this._sentinel.getBoundingClientRect();
    const box = this._ownScroll ? this._scroll.getBoundingClientRect() : { top: 0, bottom: doc.documentElement.clientHeight };
    if (r.top < box.bottom + 240 && r.bottom > box.top - 240 && r.width + r.height >= 0) this._loadMore();
  },
};
