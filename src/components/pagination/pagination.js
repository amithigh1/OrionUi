/* <o-pagination> — accessible pager with page sizes, jump box and four variants.
 *   <o-pagination total="245" page="1" page-size="10" page-sizes="10,25,50,100" show-total show-jump></o-pagination>
 *   variant: default | outline | simple | compact     events: o-change { page, pageSize }, o-before-change (cancelable)
 */
i18n.add('en', {
  pagination: {
    label: 'Pagination', prev: 'Previous page', next: 'Next page', first: 'First page', last: 'Last page',
    page: 'Page {page}', pageOf: 'Page {page} of {pages}', range: '{start}–{end} of {total}', none: 'No results',
    perPage: 'per page', rowsPerPage: 'Rows per page', jump: 'Go to', jumpLabel: 'Go to page', current: 'Current page, page {page}',
  },
});

/** pageItems(page, pages, siblings, boundaries) -> [1, 'gap', 4, 5, 6, 'gap', 20] (stable length) */
function pageItems(page, pages, siblings = 1, boundaries = 1) {
  const range = (a, b) => (b < a ? [] : Array.from({ length: b - a + 1 }, (_, i) => a + i));
  const b = Math.max(0, boundaries), s = Math.max(0, siblings);
  if (pages <= b * 2 + s * 2 + 3) return range(1, pages);
  const start = range(1, Math.min(b, pages)), end = range(Math.max(pages - b + 1, b + 1), pages);
  const sStart = Math.max(Math.min(page - s, pages - b - s * 2 - 1), b + 2);
  const sEnd = Math.min(Math.max(page + s, b + s * 2 + 2), end.length ? end[0] - 2 : pages - 1);
  return [
    ...start,
    sStart > b + 2 ? 'gap' : (b + 1 < pages - b ? b + 1 : null),
    ...range(sStart, sEnd),
    sEnd < pages - b - 1 ? 'gap-end' : (pages - b > b ? pages - b : null),
    ...end,
  ].filter(x => x != null);
}

class OPagination extends OElement {
  static props = {
    total: { type: Number, default: 0 },
    page: { type: Number, default: 1 },
    pageSize: { type: Number, default: 10 },
    pageSizes: { type: Array, default: () => [] },
    siblings: { type: Number, default: 1 },
    boundaries: { type: Number, default: 1 },
    showTotal: Boolean,
    showJump: Boolean,
    edges: Boolean,
    variant: { type: String, default: 'default', reflect: true },
    size: { type: String, default: '' },
    align: { type: String, default: '' },
    disabled: { type: Boolean, reflect: true },
    label: String,
    texts: Object,
  };

  /** Number of pages (at least 1). */
  get pages() { return Math.max(1, Math.ceil((+this.total || 0) / Math.max(1, +this.pageSize || 10))); }

  setup() {
    this.classList.add('o-pager');
    this._info = h('div', { class: 'o-pager-total' });
    this._sizeSel = h('select', { class: 'o-select o-input-sm', 'aria-label': this.t('pagination.rowsPerPage') });
    this._sizeText = h('span');
    this._sizeWrap = h('label', { class: 'o-pager-size' }, this._sizeSel, this._sizeText);
    this._list = h('ul', { class: 'o-pagination' });
    this._nav = h('nav', { class: 'o-pager-nav' }, this._list);
    this._jumpInput = h('input', { class: 'o-input o-input-sm', type: 'number', min: 1, inputmode: 'numeric' });
    this._jumpText = h('span');
    this._jump = h('label', { class: 'o-pager-jump' }, this._jumpText, this._jumpInput);
    this.replaceChildren(this._info, this._sizeWrap, this._nav, this._jump);

    on(this._list, 'click', '[data-page]', (e, b) => { if (b.tagName === 'BUTTON') this.go(b.dataset.page); });
    on(this._list, 'keydown', e => this._key(e));
    on(this._list, 'change', '.o-pager-current', (e, inp) => this.go(inp.value));
    on(this._list, 'keydown', '.o-pager-current', (e, inp) => { if (e.key === 'Enter') { e.preventDefault(); this.go(inp.value); } });
    on(this._sizeSel, 'change', () => this.setPageSize(+this._sizeSel.value, true));
    const jump = () => { const v = this._jumpInput.value; if (v !== '') { this.go(v); this._jumpInput.value = ''; } };
    on(this._jumpInput, 'keydown', e => { if (e.key === 'Enter') { e.preventDefault(); jump(); } });
    on(this._jumpInput, 'change', jump);
  }

  connected() {
    this.addCleanup(observeResize(this, r => { const n = r.width > 0 && r.width < 420; if (n !== this._narrow) { this._narrow = n; this.render(); } }));
  }

  update() { this.render(); }

  render() {
    const pages = this.pages, page = clamp(Math.round(+this.page || 1), 1, pages), total = +this.total || 0;
    if (page !== this.page) this._p.page = page;
    const v = this.variant || 'default', dis = !!this.disabled;
    const hadFocus = this._list.contains(doc.activeElement) ? doc.activeElement.dataset.page : null;
    this.classList.toggle('is-disabled', dis);
    this.toggleAttribute('aria-disabled', dis);
    this._nav.setAttribute('aria-label', this.label || this.t('pagination.label'));
    this._list.className = cls('o-pagination', v === 'outline' && 'o-pagination-outline', this.size === 'sm' && 'o-pagination-sm');

    // total ("1–10 of 245")
    this._info.hidden = !this.showTotal;
    if (this.showTotal) {
      const start = total ? (page - 1) * this.pageSize + 1 : 0, end = Math.min(total, page * this.pageSize);
      this._info.textContent = total ? this.t('pagination.range', { start: fmt.number(start), end: fmt.number(end), total: fmt.number(total) }) : this.t('pagination.none');
    }
    // page size select
    const sizes = toArr(this.pageSizes).map(Number).filter(n => n > 0);
    this._sizeWrap.hidden = !sizes.length;
    if (sizes.length) {
      if (!sizes.includes(+this.pageSize)) sizes.push(+this.pageSize), sizes.sort((a, b) => a - b);
      const key = sizes.join(',') + '|' + i18n.locale;
      if (this._sizeKey !== key) { this._sizeKey = key; this._sizeSel.innerHTML = sizes.map(n => `<option value="${n}">${esc(fmt.number(n))}</option>`).join(''); }
      this._sizeSel.value = String(this.pageSize);
      this._sizeSel.disabled = dis;
      this._sizeSel.setAttribute('aria-label', this.t('pagination.rowsPerPage'));
      this._sizeText.textContent = this.t('pagination.perPage');
    }
    this.classList.toggle('has-meta', !!(this.showTotal || sizes.length));
    this.style.justifyContent = { start: 'flex-start', center: 'center', end: 'flex-end', between: 'space-between' }[this.align] || '';
    // jump box
    this._jump.hidden = !this.showJump || v === 'compact';
    this._jumpText.textContent = this.t('pagination.jump');
    this._jumpInput.max = pages;
    this._jumpInput.disabled = dis;
    this._jumpInput.setAttribute('aria-label', this.t('pagination.jumpLabel'));

    // the page buttons
    const btn = (p, label, content, { disabled = false, current = false, cl = '' } = {}) => `<li><button type="button" class="o-page-link${current ? ' is-active' : ''}${cl}" data-page="${p}" aria-label="${esc(label)}"${current ? ' aria-current="page"' : ''}${disabled || dis ? ' disabled' : ''}>${content}</button></li>`;
    const first = page <= 1, last = page >= pages;
    let out = '';
    if (this.edges && v !== 'simple') out += btn('first', this.t('pagination.first'), icon('chevrons-left'), { disabled: first, cl: ' o-pager-edge' });
    out += btn('prev', this.t('pagination.prev'), icon('chevron-left'), { disabled: first, cl: ' o-pager-prev' });
    if (v === 'simple') out += `<li class="o-pager-page" aria-live="polite">${esc(this.t('pagination.pageOf', { page: fmt.number(page), pages: fmt.number(pages) }))}</li>`;
    else if (v === 'compact') out += `<li class="o-pager-page"><input class="o-input o-input-sm o-pager-current" type="number" min="1" max="${pages}" value="${page}" aria-label="${esc(this.t('pagination.jumpLabel'))}"${dis ? ' disabled' : ''}><span>/ ${esc(fmt.number(pages))}</span></li>`;
    else {
      const sib = this._narrow ? 0 : Math.max(0, +this.siblings || 0);
      for (const it of pageItems(page, pages, sib, Math.max(0, this.boundaries ?? 1))) {
        if (isStr(it)) out += '<li><span class="o-page-ellipsis" aria-hidden="true">…</span></li>';
        else out += btn(it, it === page ? this.t('pagination.current', { page: fmt.number(it) }) : this.t('pagination.page', { page: fmt.number(it) }), esc(fmt.number(it)), { current: it === page });
      }
    }
    out += btn('next', this.t('pagination.next'), icon('chevron-right'), { disabled: last, cl: ' o-pager-next' });
    if (this.edges && v !== 'simple') out += btn('last', this.t('pagination.last'), icon('chevrons-right'), { disabled: last, cl: ' o-pager-edge' });
    this._list.innerHTML = out;
    if (hadFocus) {
      const b = this._list.querySelector(`button[data-page="${hadFocus}"]:not(:disabled)`) || this._list.querySelector('button[aria-current]') || this._list.querySelector('button:not(:disabled)');
      b?.focus({ preventScroll: true });
    }
  }

  /** go(page | 'prev' | 'next' | 'first' | 'last') — user navigation (fires o-change) */
  go(p) {
    if (this.disabled) return false;
    const pages = this.pages, cur = +this.page || 1;
    let n = p === 'prev' ? cur - 1 : p === 'next' ? cur + 1 : p === 'first' ? 1 : p === 'last' ? pages : Math.round(+p);
    n = clamp(n || 1, 1, pages);
    if (n === cur) { this.render(); return false; }
    if (!this.emit('before-change', { page: n, pageSize: this.pageSize })) return false;
    this.page = n; this.flush();
    this.emit('change', { page: n, pageSize: this.pageSize });
    return true;
  }
  next() { return this.go('next'); }
  prev() { return this.go('prev'); }
  /** setPageSize(n) — keeps the first visible item on screen */
  setPageSize(n, user = false) {
    n = Math.max(1, +n || 10);
    if (n === this.pageSize) return;
    const firstItem = ((+this.page || 1) - 1) * this.pageSize;
    this.pageSize = n; this.page = Math.floor(firstItem / n) + 1; this.flush();
    if (user) this.emit('change', { page: this.page, pageSize: n });
  }

  _key(e) {
    if (e.target.classList.contains('o-pager-current')) return;
    const btns = $$('button:not(:disabled)', this._list), i = btns.indexOf(doc.activeElement);
    let k = e.key;
    if (isRTL(this) && (k === 'ArrowLeft' || k === 'ArrowRight')) k = k === 'ArrowLeft' ? 'ArrowRight' : 'ArrowLeft';
    const focus = j => btns[clamp(j, 0, btns.length - 1)]?.focus();
    if (k === 'ArrowRight') { e.preventDefault(); focus(i + 1); }
    else if (k === 'ArrowLeft') { e.preventDefault(); focus(i - 1); }
    else if (k === 'Home') { e.preventDefault(); focus(0); }
    else if (k === 'End') { e.preventDefault(); focus(btns.length - 1); }
    else if (k === 'PageDown') { e.preventDefault(); this.go('next'); }
    else if (k === 'PageUp') { e.preventDefault(); this.go('prev'); }
  }
}
define('o-pagination', OPagination);
O.Pagination = OPagination;
O.pagination = { items: pageItems };
