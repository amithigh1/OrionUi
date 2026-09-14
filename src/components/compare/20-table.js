/* ============================================================================
 * <o-compare-table> — side-by-side attribute comparison for a small set of items.
 *   <o-compare-table items='[...]' attributes='[{"key":"price","numeric":true,"best":"low","unit":"USD"}]'
 *                     live highlight-diff only-diff></o-compare-table>
 * `live` mirrors Orion.compare (add/remove there updates this table automatically, and removing a
 * column here calls Orion.compare.remove()). Without `live`, `items` is just a plain data prop.
 * ========================================================================== */
i18n.add('en', {
  compareTable: {
    attribute: 'Attribute', remove: 'Remove {title} from comparison', best: 'Best value', yes: 'Yes',
    highlightDiff: 'Highlight differences', onlyDiff: 'Only show differences', empty: 'Add items to compare them side by side.',
  },
});

function ctLabel(key) { return cap(String(key).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ')); }
function ctIsNumericAttr(attr, items) {
  if (attr.numeric != null) return !!attr.numeric;
  const present = items.map(it => getPath(it, attr.key)).filter(v => v != null && v !== '');
  return present.length > 0 && present.every(v => isNum(+v));
}
function ctBestValue(attr, items, on) {
  if (!on || !ctIsNumericAttr(attr, items)) return null;
  const vals = items.map(it => { const v = getPath(it, attr.key); return v == null || v === '' ? null : +v; }).filter(isNum);
  if (vals.length < 2) return null;
  return attr.best === 'low' ? Math.min(...vals) : Math.max(...vals);
}

class OCompareTable extends OElement {
  static props = {
    items: { type: Array, default: () => [] },
    attributes: { type: Array, default: () => [] },
    titleKey: { type: String, default: 'title', attr: 'title-key' },
    imageKey: { type: String, default: 'image', attr: 'image-key' },
    highlightDiff: { type: Boolean, default: false, reflect: true, attr: 'highlight-diff' },
    onlyDiff: { type: Boolean, default: false, reflect: true, attr: 'only-diff' },
    removable: { type: Boolean, default: true },
    bestValue: { type: Boolean, default: true, attr: 'best-value' },
    live: { type: Boolean, default: false },
    toolbar: { type: Boolean, default: true },
    label: String,
    texts: Object,
  };

  setup() {
    this.classList.add('o-compare-table');
    this._diffInput = h('input', { type: 'checkbox', onChange: e => { this.highlightDiff = e.target.checked; } });
    this._onlyInput = h('input', { type: 'checkbox', onChange: e => { this.onlyDiff = e.target.checked; } });
    this._diffLabel = h('span', null, this.t('compareTable.highlightDiff'));
    this._onlyLabel = h('span', null, this.t('compareTable.onlyDiff'));
    this._toolbar = h('div', { class: 'o-compare-table-toolbar' },
      h('label', { class: 'o-switch' }, this._diffInput, this._diffLabel),
      h('label', { class: 'o-switch' }, this._onlyInput, this._onlyLabel));
    this._wrap = h('div', { class: 'o-table-wrap o-compare-table-wrap' });
    this._empty = h('div', { class: 'o-empty', hidden: true }, h('p', { class: 'o-empty-text' }, this.t('compareTable.empty')));
    this.append(this._toolbar, this._wrap, this._empty);
  }
  connected() { this._bindLive(); }
  disconnected() { this._unsub?.(); this._unsub = null; }
  /** Reveal (used by <o-compare-tray target="...">). No-op if already visible — this element has no hidden state of its own beyond `hidden`. */
  open() { this.hidden = false; }

  update(changed) {
    if (changed.has('live') || changed.has('init')) this._bindLive();
    if (changed.has('toolbar') || changed.has('init')) this._toolbar.hidden = !this.toolbar;
    if (changed.has('locale')) { this._diffLabel.textContent = this.t('compareTable.highlightDiff'); this._onlyLabel.textContent = this.t('compareTable.onlyDiff'); }
    if (changed.has('highlightDiff')) { this._diffInput.checked = !!this.highlightDiff; this.classList.toggle('show-diff', !!this.highlightDiff); }
    if (changed.has('onlyDiff')) this._onlyInput.checked = !!this.onlyDiff;
    if (['items', 'attributes', 'titleKey', 'imageKey', 'removable', 'onlyDiff', 'bestValue', 'init', 'locale'].some(k => changed.has(k))) this._build();
  }

  _bindLive() {
    this._unsub?.(); this._unsub = null;
    if (this.live) this._unsub = O.compare.subscribe(({ items }) => { this.items = items; });
  }
  _resolveAttributes() {
    if (toArr(this.attributes).length) return toArr(this.attributes).map(a => (isStr(a) ? { key: a } : a)).map(a => ({ label: ctLabel(a.key), ...a }));
    const skip = new Set(['id', this.titleKey, this.imageKey, 'addedAt']), seen = new Set(), keys = [];
    for (const it of this.items) for (const k of Object.keys(it || {})) { if (skip.has(k) || seen.has(k)) continue; seen.add(k); keys.push(k); }
    return keys.map(k => ({ key: k, label: ctLabel(k) }));
  }
  _removeItem(id) {
    const item = this.items.find(it => it.id === id);
    if (this.live) O.compare.remove(id);
    else { this.items = this.items.filter(it => it.id !== id); this._build(); }
    this.emit('remove', { id, item });
  }

  _build() {
    const items = toArr(this.items), attrs = this._resolveAttributes();
    this._empty.hidden = items.length > 0;
    if (!items.length) { this._wrap.replaceChildren(); return; }
    const corner = h('th', { class: 'o-compare-table-attr', scope: 'col' }, this.t('compareTable.attribute'));
    const headCells = items.map(item => {
      const title = String(getPath(item, this.titleKey) ?? item.id);
      const img = getPath(item, this.imageKey);
      const removeBtn = this.removable
        ? h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-icon o-btn-xs o-compare-table-remove', 'aria-label': this.t('compareTable.remove', { title }), onClick: () => this._removeItem(item.id) }, icon('x'))
        : null;
      return h('th', { class: 'o-compare-table-col', scope: 'col' },
        h('div', { class: 'o-compare-table-head' },
          img ? h('img', { class: 'o-compare-table-img', src: img, alt: '' }) : null,
          h('span', { class: 'o-compare-table-title' }, title),
          removeBtn));
    });
    const thead = h('thead', null, h('tr', null, corner, ...headCells));
    const rows = attrs.map(attr => {
      const vals = items.map(it => getPath(it, attr.key));
      const differs = !vals.every(v => equal(v, vals[0]));
      const best = ctBestValue(attr, items, this.bestValue);
      const cells = items.map((item, i) => {
        const v = vals[i], isBest = best != null && +v === best;
        const parts = [];
        if (isBest) parts.push(icon('check-circle', { class: 'o-compare-table-best-icon', label: this.t('compareTable.best') }));
        if (v == null || v === '') parts.push(h('span', { class: 'o-text-muted' }, '—'));
        else if (isFn(attr.format)) parts.push(String(attr.format(v, item)));
        else if (typeof v === 'boolean') parts.push(v ? h('span', null, icon('check'), h('span', { class: 'o-sr-only' }, this.t('compareTable.yes'))) : h('span', { class: 'o-text-muted' }, '—'));
        else if (isNum(v)) parts.push(fmt.number(v) + (attr.unit ? ' ' + attr.unit : ''));
        else parts.push(String(v));
        return h('td', { class: ['o-compare-table-cell', isBest && 'is-best'] }, ...parts);
      });
      const tr = h('tr', { 'data-key': attr.key, class: [differs && 'is-diff'] }, h('th', { class: 'o-compare-table-attr', scope: 'row' }, attr.label), ...cells);
      tr.hidden = this.onlyDiff && !differs;
      return tr;
    });
    this._wrap.replaceChildren(h('table', { class: 'o-table o-table-bordered o-compare-table-el' }, thead, h('tbody', null, ...rows)));
    this.classList.toggle('show-diff', !!this.highlightDiff);
  }
}
define('o-compare-table', OCompareTable);
O.CompareTable = OCompareTable;
