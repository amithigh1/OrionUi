/* ── <table class="o-table" data-o-table> — sorting, search and pagination for static markup ──
 *   data-o-table-page-size="10"   data-o-table-search="false"   data-o-table-paginate="false"
 *   <th data-sort="false"> not sortable · <td data-sort="2024-01-31"> explicit sort value · <th data-type="number|date|text">
 */
const DT_NUMLIKE = /^[-+]?[\d\s.,  %$€£¥₹]+$/;
behavior('data-o-table', table => {
  if (table.tagName !== 'TABLE' || table.closest('o-datatable')) return;
  const tbody = table.tBodies[0];
  if (!tbody) return;
  const ds = table.dataset, size = () => Math.max(1, +(ds.oTablePageSize || 10));
  const paginate = ds.oTablePaginate !== 'false', searchable = ds.oTableSearch !== 'false';
  const anchor = table.parentElement?.classList.contains('o-table-wrap') ? table.parentElement : table;
  const headRow = table.tHead?.rows[table.tHead.rows.length - 1];
  const ths = headRow ? [...headRow.cells] : [];
  let sort = null, q = '', page = 1, cache = null, busy = false;
  const offs = [];

  const input = h('input', { class: 'o-input o-input-sm', type: 'search', placeholder: t('table.search'), 'aria-label': t('table.searchLabel') });
  const bar = h('div', { class: 'o-dt-plain-bar' }, h('div', { class: 'o-input-wrap o-dt-search' }, iconEl('search'), input));
  const info = h('div', { class: 'o-dt-info', 'aria-live': 'polite' });
  const pagerBox = h('div', { class: 'o-dt-pager' });
  const foot = h('div', { class: 'o-dt-plain-foot' }, info, pagerBox);
  if (searchable) anchor.before(bar);
  anchor.after(foot);

  const typeOf = i => ths[i]?.dataset.type || null;
  const keyOf = (td, type) => {
    const raw = td ? (td.dataset.sort ?? td.dataset.value ?? td.textContent.trim()) : '';
    if (raw === '') return null;
    if (type === 'text') return raw;
    const n = DT_NUMLIKE.test(raw.replace(/^(RM|USD|EUR|MYR)\s?/i, '')) ? fmt.parseNumber(raw) : null;
    if (type === 'number' || (n != null && type !== 'date')) return n ?? raw;
    if (type === 'date' || /^\d{4}-\d{2}-\d{2}/.test(raw)) { const d = date.parse(raw); if (d) return +d; }
    return raw;
  };
  const load = () => { cache = [...tbody.rows].map((tr, i) => ({ tr, i, text: tr.textContent.toLowerCase(), keys: [...tr.cells].map((td, j) => keyOf(td, typeOf(j))) })); };
  const mo = new MutationObserver(() => { if (!busy) { cache = null; apply(); } });
  mo.observe(tbody, { childList: true, subtree: true, characterData: true });
  offs.push(() => mo.disconnect());

  function apply() {
    if (!cache) load();
    busy = true;
    const words = dtWords(q), coll = dtCollator();
    let list = cache.filter(r => words.every(w => r.text.includes(w)));
    if (sort) list = [...list].sort((a, b) => { const x = a.keys[sort.i], y = b.keys[sort.i]; if (x === y) return a.i - b.i; if (x == null) return 1; if (y == null) return -1; const c = dtCmp(x, y, coll); return (sort.dir === 'desc' ? -c : c) || a.i - b.i; });
    else list = [...list].sort((a, b) => a.i - b.i);
    const pages = Math.max(1, Math.ceil(list.length / size()));
    page = clamp(page, 1, pages);
    const from = paginate ? (page - 1) * size() : 0, to = paginate ? from + size() : list.length;
    const shown = new Set(list.slice(from, to)), inList = new Set(list);
    for (const r of cache) r.tr.hidden = !shown.has(r);
    for (const r of list) tbody.appendChild(r.tr);
    for (const r of cache) if (!inList.has(r)) tbody.appendChild(r.tr);
    busy = false;
    mo.takeRecords();
    info.textContent = list.length ? (paginate ? t('table.showing', { start: fmt.number(from + 1), end: fmt.number(Math.min(to, list.length)), total: fmt.number(list.length) }) : t('table.results', { count: list.length })) : t('table.noResults');
    pagerBox.hidden = !paginate || list.length <= size();
    if (paginate) {
      if (customElements.get('o-pagination')) {
        let p = pagerBox.firstElementChild;
        if (!p) { p = h('o-pagination', { siblings: 1 }); on(p, 'o-change', e => { page = e.detail.page; apply(); }); pagerBox.append(p); }
        p.total = list.length; p.pageSize = size(); p.page = page;
      } else pagerBox.innerHTML = `<span class="o-dt-muted">${esc(t('pagination.pageOf', { page, pages }))}</span>`;
    }
    ths.forEach((th, i) => {
      if (!th.__sortable) return;
      const s = sort?.i === i ? sort.dir : null;
      th.setAttribute('aria-sort', s ? (s === 'desc' ? 'descending' : 'ascending') : 'none');
      th.querySelector('.o-dt-sort').innerHTML = String(icon(s ? (s === 'desc' ? 'arrow-down' : 'arrow-up') : 'chevrons-up-down'));
      th.classList.toggle('is-sorted', !!s);
    });
  }

  ths.forEach((th, i) => {
    if (th.dataset.sort === 'false' || th.hasAttribute('data-o-no-sort') || !th.textContent.trim()) return;
    th.__sortable = true;
    th.classList.add('o-dt-plain-th');
    th.tabIndex = 0;
    th.append(h('span', { class: 'o-dt-sort', 'aria-hidden': 'true' }));
    const cycle = () => { sort = sort?.i !== i ? { i, dir: 'asc' } : sort.dir === 'asc' ? { i, dir: 'desc' } : null; page = 1; apply(); };
    offs.push(on(th, 'click', cycle), on(th, 'keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cycle(); } }));
  });
  const deb = debounce(() => { q = input.value; page = 1; apply(); }, 120);
  offs.push(on(input, 'input', deb), on(input, 'keydown', e => { if (e.key === 'Escape' && input.value) { e.preventDefault(); input.value = ''; deb.flush(); } }));
  table.classList.add('o-dt-plain');
  apply();

  return () => {
    offs.forEach(f => f()); deb.cancel();
    bar.remove(); foot.remove();
    table.classList.remove('o-dt-plain');
    ths.forEach(th => { if (th.__sortable) { th.__sortable = false; th.classList.remove('o-dt-plain-th', 'is-sorted'); th.removeAttribute('tabindex'); th.removeAttribute('aria-sort'); th.querySelector('.o-dt-sort')?.remove(); } });
    if (cache) cache.sort((a, b) => a.i - b.i).forEach(r => { r.tr.hidden = false; tbody.appendChild(r.tr); });
  };
});
