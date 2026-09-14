/* ============================================================================
 * <o-compare-tray> — sticky bottom bar listing the current Orion.compare selection, with a
 * "Compare" button that reveals a target <o-compare-table> (or any element with .items / .open()).
 *   <o-compare-tray max="4" target="#compare-table"></o-compare-tray>
 * Reuses the core `.o-sticky-bar` class for the pinned bottom-bar chrome.
 * ========================================================================== */
i18n.add('en', {
  compareTray: {
    count: '{n} of {max} selected', compare: 'Compare', clearAll: 'Clear all', regionLabel: 'Compare tray',
  },
});

class OCompareTray extends OElement {
  static props = {
    max: { type: Number, default: 4 },
    target: { type: String, attr: 'target' },
    texts: Object,
  };

  setup() {
    this.classList.add('o-compare-tray', 'o-sticky-bar');
    this.setAttribute('role', 'region');
    this._list = h('div', { class: 'o-compare-tray-list' });
    this._countEl = h('span', { class: 'o-compare-tray-count' });
    this._clearBtn = h('button', { type: 'button', class: 'o-btn o-btn-ghost o-btn-sm', onClick: () => O.compare.clear() }, this.t('compareTray.clearAll'));
    this._compareBtn = h('button', { type: 'button', class: 'o-btn o-btn-primary o-btn-sm', onClick: () => this._doCompare() }, this.t('compareTray.compare'));
    this._actions = h('div', { class: 'o-compare-tray-actions' }, this._countEl, this._clearBtn, this._compareBtn);
    this.append(this._list, this._actions);
    this.hidden = true;
  }
  connected() {
    this._unsub = O.compare.subscribe(({ items }) => this._render(items));
  }
  disconnected() { this._unsub?.(); this._unsub = null; }
  update(changed) {
    if (changed.has('max') || changed.has('init')) O.compare.setMax(this.max);
    if (changed.has('locale')) { this._clearBtn.textContent = this.t('compareTray.clearAll'); this._compareBtn.textContent = this.t('compareTray.compare'); this.setAttribute('aria-label', this.t('compareTray.regionLabel')); }
  }

  _render(items) {
    items = items || O.compare.list();
    this.hidden = !items.length;
    this.classList.toggle('is-full', items.length >= O.compare.max);
    this._countEl.textContent = this.t('compareTray.count', { n: items.length, max: O.compare.max });
    this._compareBtn.disabled = items.length < 2;
    const create = item => {
      const img = h('img', { class: 'o-compare-tray-thumb', alt: '', hidden: true });
      const label = h('span', { class: 'o-compare-tray-label' });
      const btn = h('button', { type: 'button', class: 'o-chip-remove', 'aria-label': this.t('compare.remove'), onClick: () => O.compare.remove(item.id) });
      const el = h('span', { class: 'o-chip o-compare-tray-item' }, img, label, btn);
      el.__img = img; el.__label = label;
      this._applyItem(el, item);
      return el;
    };
    patchList(this._list, items, i => i.id, create, (el, item) => this._applyItem(el, item));
  }
  _applyItem(el, item) {
    if (item.image) { el.__img.src = item.image; el.__img.hidden = false; } else el.__img.hidden = true;
    el.__label.textContent = String(item.title ?? item.name ?? item.id);
  }
  _doCompare() {
    const items = O.compare.list();
    if (!this.emit('compare', { items })) return;
    if (!this.target) return;
    const el = $(this.target);
    if (!el) { console.warn(`[Orion] <o-compare-tray target="${this.target}"> did not match any element.`); return; }
    if ('items' in el) el.items = items;
    if (isFn(el.open)) el.open();
    el.scrollIntoView?.({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
  }
}
define('o-compare-tray', OCompareTray);
O.CompareTray = OCompareTray;
