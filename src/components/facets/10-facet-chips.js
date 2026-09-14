/* ============================================================================
 * <o-facet-chips for="#facets"> — renders the active selections of an <o-facets> as removable
 * chips (.o-chip / .o-chip-remove) plus a "Clear all" button. Reuses the group helpers defined
 * in 00-facets.js (same folder scope): facetsNormGroup, facetsIsEmpty.
 * ========================================================================== */
class OFacetChips extends OElement {
  static props = { for: { type: String, attr: 'for' }, texts: Object };

  setup() {
    this.classList.add('o-facet-chips');
    this._list = h('span', { class: 'o-facet-chips-list o-cluster' });
    this._clearBtn = h('button', { type: 'button', class: 'o-btn o-btn-xs o-btn-ghost o-facet-chips-clear' }, this.t('facets.clearAll'));
    this.append(this._list, this._clearBtn);
    on(this._clearBtn, 'click', () => this._target?.clear());
    this.hidden = true;
  }
  connected() { this._bind(); }
  disconnected() { this._unbind?.(); this._unbind = null; }
  update(changed) { if (changed.has('for') || changed.has('init')) this._bind(); if (changed.has('locale')) this._clearBtn.textContent = this.t('facets.clearAll'); }

  _bind() {
    this._unbind?.(); this._unbind = null; this._target = null;
    if (!this.for) { this._render(); return; }
    const el = $(this.for);
    if (!el) { console.warn(`[Orion] <o-facet-chips for="${this.for}"> did not match any element.`); this._render(); return; }
    this._target = el;
    this._unbind = on(el, 'o-change', () => this._render());
    this._render();
  }
  _chips() {
    const t = this._target; if (!t) return [];
    const groups = toArr(t.groups).map(facetsNormGroup), value = t.value || {}, chips = [];
    for (const g of groups) {
      const v = value[g.key];
      if (facetsIsEmpty(g, v)) continue;
      if (g.type === 'checkbox') {
        for (const raw of toArr(v)) { const opt = g.options?.find(o => String(o.value) === String(raw)); chips.push({ key: g.key, value: raw, label: opt ? opt.label : raw }); }
      } else if (g.type === 'radio') {
        const opt = g.options?.find(o => String(o.value) === String(v));
        chips.push({ key: g.key, value: null, label: opt ? opt.label : v });
      } else if (g.type === 'range') {
        chips.push({ key: g.key, value: null, label: `${g.label}: ${v.min ?? '…'} – ${v.max ?? '…'}` });
      } else if (g.type === 'date-range') {
        chips.push({ key: g.key, value: null, label: `${g.label}: ${v.from ? fmt.date(v.from) : '…'} – ${v.to ? fmt.date(v.to) : '…'}` });
      } else if (g.type === 'search') {
        chips.push({ key: g.key, value: null, label: `${g.label}: "${v}"` });
      }
    }
    return chips;
  }
  _render() {
    const chips = this._chips();
    this.hidden = !chips.length;
    const create = c => {
      const btn = h('button', { type: 'button', class: 'o-chip-remove', 'aria-label': this.t('facets.remove', { label: c.label }), onClick: () => this._target?.remove(c.key, c.value) });
      const el = h('span', { class: 'o-chip' }, h('span', null, String(c.label)), btn);
      el.__okey = c.key + '::' + (c.value ?? '');
      return el;
    };
    const update = (el, c) => { el.firstChild.textContent = String(c.label); };
    patchList(this._list, chips, c => c.key + '::' + (c.value ?? ''), create, update);
  }
}
define('o-facet-chips', OFacetChips);
O.FacetChips = OFacetChips;
