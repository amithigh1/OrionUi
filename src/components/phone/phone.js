/* Phone number input with country selector.
 *   <o-phone name="mobile" country="MY" preferred="MY,SG,US" format="national|international|e164" required></o-phone>
 *   Props: value (E.164 "+60123456789") country (ISO2; default from locale region) preferred (Array|CSV) format recent(=true)
 *          placeholder locale (country names) size(sm|lg) name required disabled readonly texts
 *   Read-only getters: country, valid, national, e164 · Methods: open() close() clear() focus() setCountry(iso)
 *   Events: input, change, o-change { value, country, valid }, o-country { country }
 *   Keyboard: country button — Enter/Space/ArrowDown opens, type to search, arrows/Home/End/PageUp/PageDown, Enter picks, Esc closes.
 *   Typing "+44…" or "0044…" switches the country automatically.
 * Helpers: Orion.phone.parse(text, country) -> { country, national, e164, valid } · Orion.phone.format(value, 'national', country)
 *          Orion.phone.countries -> [{ iso, dial, name }] · Orion.phone.flag('MY') -> '🇲🇾'
 * Validation checks national-number lengths per country (an approximation, not a numbering-plan database).
 */
i18n.add('en', {
  phone: {
    country: 'Country', search: 'Search country or code', noResults: 'No countries found', suggested: 'Suggested',
    all: 'All countries', invalid: 'Enter a valid phone number', number: 'Phone number',
  },
});

/* ── data ─────────────────────────────────────────────────────────────── */
const COUNTRIES = [], BY_ISO = new Map(), BY_DIAL = new Map();
for (const row of COUNTRY_DATA) {
  const [iso, dial0, name, areas] = row.split('|');
  let dial = dial0, area = areas ? areas.split(' ') : [];
  if (dial.length === 4 && dial[0] === '1') { area = [dial.slice(1)]; dial = '1'; } // NANP territories: +1 + area code
  const ex = BY_ISO.get(iso);
  if (ex) { ex.areas.push(...area); continue; }
  const c = { iso, dial, name, areas: area };
  COUNTRIES.push(c); BY_ISO.set(iso, c);
  if (!BY_DIAL.has(dial)) BY_DIAL.set(dial, []);
  BY_DIAL.get(dial).push(c);
}
const flag = iso => String.fromCodePoint(...[...String(iso).toUpperCase()].map(ch => 0x1f1e6 + ch.charCodeAt(0) - 65));
let FLAGS = null;
/** Windows has no flag glyphs: fall back to an ISO badge. */
function flagsOk() {
  if (FLAGS != null) return FLAGS;
  try { const c = doc.createElement('canvas').getContext('2d'); c.font = '24px sans-serif'; FLAGS = c.measureText(flag('US')).width < c.measureText('\u{1F1FA}').width * 1.5; } catch { FLAGS = false; }
  return FLAGS;
}
const NAMES = new Map();
function nameOf(c, loc) {
  loc = loc || i18n.locale;
  let dn = NAMES.get(loc);
  if (dn === undefined) { try { dn = new Intl.DisplayNames([loc], { type: 'region', fallback: 'none' }); } catch { dn = null; } NAMES.set(loc, dn); }
  let n = null; try { n = dn?.of(c.iso); } catch {}
  return n || c.name;
}
const lens = c => { const l = PHONE_LENGTHS[c.iso]; return l || (c.dial === '1' ? [10, 10] : [4, Math.min(13, 15 - c.dial.length)]); };
/** Longest calling-code match for digits typed after "+", then the territory by area prefix. */
function detect(digits) {
  for (let n = Math.min(3, digits.length); n >= 1; n--) {
    const list = BY_DIAL.get(digits.slice(0, n));
    if (!list) continue;
    const rest = digits.slice(n);
    const c = list.find(x => x.areas.some(a => a !== '0' && rest.startsWith(a))) || list.find(x => !x.areas.length) || list[0];
    return { country: c, rest };
  }
  return null;
}
function patternFor(d, c) {
  let p = PHONE_FORMATS[c.iso] || (c.dial === '1' ? '(###) ###-####' : null);
  if (Array.isArray(p)) { const r = p.find(x => x.length === 1 || x[0].test(d)); p = r[r.length - 1]; }
  return p;
}
function fmtNational(d, c) {
  if (!d) return '';
  const p = patternFor(d, c);
  if (!p) { const n = d.length; return n <= 4 ? d : n <= 7 ? d.slice(0, 3) + ' ' + d.slice(3) : n === 8 ? d.slice(0, 4) + ' ' + d.slice(4) : d.slice(0, 3) + ' ' + d.slice(3, 6) + ' ' + d.slice(6); }
  let out = '', i = 0;
  for (const ch of p) { if (i >= d.length) break; out += ch === '#' ? d[i++] : ch; }
  return out + d.slice(i);
}
/** Split national digits into trunk prefix (kept for display, dropped from E.164) and the national significant number. */
function splitTrunk(d, c) {
  if (c.dial === '1') return d[0] === '1' ? ['1', d.slice(1)] : ['', d];
  const tr = TRUNK[c.iso];
  if (tr && tr !== '0') return d.startsWith(tr) && d.length > lens(c)[1] ? [tr, d.slice(tr.length)] : ['', d];
  if (!KEEP_ZERO.has(c.iso) && d[0] === '0') return ['0', d.slice(1)];
  return ['', d];
}
/** parse(text, countryIso) -> { country, national, trunk, e164, valid, intl } */
function parse(text, iso) {
  const s = String(text ?? '').trim();
  let c = BY_ISO.get(String(iso || '').toUpperCase()) || BY_ISO.get('US');
  let digits = s.replace(/\D/g, ''), intl = false;
  if (/^(\+|00)/.test(s)) {
    if (s.startsWith('00')) digits = digits.slice(2);
    const hit = detect(digits);
    intl = true;
    if (hit) { c = hit.country; digits = hit.rest; } else return { country: c, national: '', trunk: '', e164: '', valid: false, intl, partial: digits };
  }
  const [trunk, nat] = intl ? ['', digits] : splitTrunk(digits, c);
  const [mn, mx] = lens(c);
  const national = nat.slice(0, 17 - c.dial.length);
  return { country: c, national, trunk, intl, e164: national ? '+' + c.dial + national : '', valid: national.length >= mn && national.length <= mx };
}
function formatNumber(value, style = 'national', iso) {
  const r = isObj(value) ? value : parse(value, iso);
  if (!r.national) return '';
  if (style === 'e164') return r.e164;
  if (style === 'international') return '+' + r.country.dial + ' ' + fmtNational(r.national, r.country);
  return (r.trunk || '') + fmtNational(r.national, r.country);
}
const sample = c => { const d = '1234567890123'.slice(0, lens(c)[1]), p = patternFor(d, c); let i = 0; return p ? p.replace(/#/g, () => '1234567890123'[i++ % 13]) : fmtNational(d, c); };
const norm = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const telSet = isBrowser ? Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set : null;
function regionOf(loc) { try { return new Intl.Locale(loc).maximize().region; } catch { return null; } }

/* ── <o-phone> ────────────────────────────────────────────────────────── */
class OPhone extends FormElement {
  static props = {
    ...FormElement.props,
    value: { type: String, default: '' },
    country: { type: String },
    preferred: { type: Array, default: () => [] },
    format: { type: String, default: 'national' },
    recent: { type: Boolean, default: true },
    placeholder: String, locale: String, size: { type: String, reflect: true }, texts: Object,
  };
  setup() {
    this.classList.add('o-phone');
    this._c = this.defaultCountry();
    this.btn = h('button', { type: 'button', class: 'o-phone-country', 'aria-haspopup': 'listbox', 'aria-expanded': 'false' },
      h('span', { class: 'o-phone-flag', 'aria-hidden': 'true' }), h('span', { class: 'o-phone-dial', 'aria-hidden': 'true' }), raw(String(icon('chevron-down', { class: 'o-phone-caret' }))));
    this.input = h('input', { type: 'tel', class: 'o-phone-input', autocomplete: 'tel', inputmode: 'tel', spellcheck: 'false' });
    this.box = h('div', { class: 'o-control o-phone-control' }, this.btn, this.input);
    this.append(this.box);
    this.focusTarget = this.input;
    on(this.btn, 'click', () => (this._ov ? this.close() : this.open()));
    on(this.btn, 'keydown', e => {
      if (['ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); this.open(); }
      else if (e.key.length === 1 && /\S/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); this.open(e.key); }
    });
    on(this.input, 'input', e => { if (!e.isComposing) this.onType(); });
    on(this.input, 'compositionend', () => this.onType());
    on(this.input, 'focus', () => { this.v0 = this.value; });
    on(this.input, 'blur', () => this.commit());
    on(this.input, 'keydown', e => { if (e.key === 'Enter') this.commit(); });
    on(this, 'click', e => { if (e.target === this || e.target === this.box) this.input.focus(); });
  }
  connected() { queueMicrotask(() => { const own = this.getAttribute('aria-label'); const ids = [...(this.labels || [])].map(l => l.id || (l.id = uid('lbl'))); if (own) this.input.setAttribute('aria-label', own); else if (ids.length) this.input.setAttribute('aria-labelledby', ids.join(' ')); else this.input.setAttribute('aria-label', this.t('phone.number')); }); }
  disconnected() { this.close(); }
  defaultCountry() {
    const want = this.getAttribute('country') || this._p.country;
    const iso = (want || regionOf(this.locale || i18n.locale) || (isBrowser ? regionOf(navigator.language) : null) || 'US').toUpperCase();
    return BY_ISO.get(iso) || BY_ISO.get('US');
  }
  /* ── state ── */
  get countryInfo() { return this._c; }
  get valid() { return !!this._r?.valid; }
  get national() { return this._r?.national || ''; }
  get e164() { return this._r?.e164 || ''; }
  update(changed) {
    if (changed.has('country') && this.country && BY_ISO.get(String(this.country).toUpperCase()) && this.country.toUpperCase() !== this._c.iso) {
      this._c = BY_ISO.get(this.country.toUpperCase());
      if (!changed.has('value')) this.reparse(this._r?.national ? (this._r.trunk || '') + this._r.national : '');
    }
    if (changed.has('value') && this.value !== this._r?.e164) this.reparse(this.value);
    else if (changed.has('init')) this.reparse(this.value);
    if (changed.has('format') && !changed.has('init')) this.paint();
    const c = this._c, ok = flagsOk();
    const fl = this.btn.firstChild;
    fl.textContent = ok ? flag(c.iso) : c.iso; fl.classList.toggle('is-code', !ok);
    this.btn.children[1].textContent = '+' + c.dial;
    this.btn.setAttribute('aria-label', `${this.t('phone.country')}: ${nameOf(c, this.locale)} +${c.dial}`);
    this.btn.title = nameOf(c, this.locale);
    this.btn.disabled = this.isDisabled || !!this.readonly;
    this.input.disabled = this.isDisabled; this.input.readOnly = !!this.readonly;
    this.box.classList.toggle('is-disabled', this.isDisabled);
    this.input.placeholder = this.placeholder ?? ((this.format === 'international' ? '+' + c.dial + ' ' : '') + sample(c));
    if (changed.has('locale') && this.list) this.buildList();
    this.input.setAttribute('aria-invalid', String(!!this.value && !this.valid));
  }
  /** Internal country switch: keeps the `country` prop in sync without re-running the prop logic. */
  useCountry(c, notify) {
    if (c === this._c) return;
    this._c = c; this._p.country = c.iso;
    this.requestUpdate('countryInfo');
    if (notify) this.emit('country', { country: c.iso });
  }
  /** Parse any text (programmatic value) for the current country and repaint. */
  reparse(text) {
    const r = parse(text, this._c.iso);
    this.useCountry(r.country, false);
    this._r = r;
    this.paint();
    if (this.value !== r.e164) this.value = r.e164;
  }
  text() {
    const r = this._r, I = this.format !== 'national' || this._intl; // "+…" typing stays international until blur
    if (!r) return '';
    if (r.partial != null) return '+' + r.partial;                        // calling code not recognised yet
    if (!r.national) return r.intl ? (I ? '+' + r.country.dial : '') : r.trunk || '';
    return formatNumber(r, I ? (this.format === 'e164' ? 'e164' : 'international') : 'national');
  }
  paint() { const txt = this.text(); if (this.input.value !== txt) telSet.call(this.input, txt); }
  onType() {
    const inp = this.input, v = inp.value, caret = inp.selectionStart ?? v.length;
    const r = parse(v, this._c.iso);
    this._intl = r.intl;
    const I = this.format !== 'national' || r.intl;
    // digits before the caret, translated from the typed form to the displayed form
    let n = v.slice(0, caret).replace(/\D/g, '').length;
    if (r.intl && /^\s*00/.test(v)) n = Math.max(0, n - 2);
    if (r.intl && r.partial == null && !I) n = Math.max(0, n - r.country.dial.length);
    if (!r.intl && I && r.national) n = n - Math.min(r.trunk.length, n) + r.country.dial.length;
    this._r = r;
    this.useCountry(r.country, true);
    const txt = this.text();
    if (txt !== v) {
      telSet.call(inp, txt);
      let at = n <= 0 ? (txt.startsWith('+') ? 1 : Math.max(0, txt.search(/\d/))) : txt.length;
      if (n > 0) { let k = 0; for (let i = 0; i < txt.length; i++) if (txt[i] >= '0' && txt[i] <= '9' && ++k === n) { at = i + 1; break; } }
      if (doc.activeElement === inp) inp.setSelectionRange(at, at);
    }
    if (r.e164 !== this.value) this.setValue(r.e164, { inputOnly: true });
    inp.setAttribute('aria-invalid', 'false');
  }
  commit() {
    this._intl = false;
    this.paint();
    this.input.setAttribute('aria-invalid', String(!!this.value && !this.valid));
    if (this.v0 !== this.value) { this.v0 = this.value; this.fire(); }
  }
  fire() {
    this.dispatchEvent(new Event('change', { bubbles: true }));
    this.emit('change', { value: this.value, country: this._c.iso, valid: this.valid });
  }
  getValidity() { return this.value && !this.valid ? { flags: { patternMismatch: true }, message: this.t('phone.invalid') } : null; }
  formValue() { return this.value || null; }
  /** Switch country (keeps the typed national number). */
  setCountry(iso, user = true) {
    const c = BY_ISO.get(String(iso).toUpperCase());
    if (!c) return;
    const nat = this._r ? (this._r.trunk || '') + this._r.national : '';
    this._r = parse(nat, c.iso);
    this.useCountry(c, user);
    this.paint();
    if (user) {
      if (this.recent) { const list = [c.iso, ...toArr(ls.get('orion:phone:recent', [])).filter(x => x !== c.iso)].slice(0, 5); ls.set('orion:phone:recent', list); }
      if (this._r.e164 !== this.value) { this.setValue(this._r.e164, { inputOnly: true }); this.v0 = this.value; this.fire(); }
    } else this.value = this._r.e164;
  }
  clear() { this._r = parse('', this._c.iso); this.paint(); this.setValue(''); }
  /* ── country panel ── */
  buildList() {
    const loc = this.locale, pref = toArr(this.preferred).map(s => String(s).trim().toUpperCase());
    const rec = this.recent ? toArr(ls.get('orion:phone:recent', [])) : [];
    const top = [...new Set([...pref, ...rec])].map(i => BY_ISO.get(i)).filter(Boolean);
    const ok = flagsOk();
    const item = (c, grp) => h('li', { role: 'option', id: uid('cty'), class: 'o-phone-option', 'data-iso': c.iso, 'data-grp': grp, 'aria-selected': 'false', 'data-q': norm(`${nameOf(c, loc)} ${c.name} ${c.iso} +${c.dial} ${c.dial}${c.areas[0] && c.dial === '1' ? ' 1' + c.areas[0] : ''}`) },
      h('span', { class: cls('o-phone-flag', !ok && 'is-code'), 'aria-hidden': 'true' }, ok ? flag(c.iso) : c.iso),
      h('span', { class: 'o-phone-name' }, nameOf(c, loc)), h('span', { class: 'o-phone-code' }, '+' + c.dial + (c.dial === '1' && c.areas.length && c.iso !== 'CA' ? ' ' + c.areas[0] : '')));
    const all = [...COUNTRIES].sort((a, b) => nameOf(a, loc).localeCompare(nameOf(b, loc), loc || i18n.locale));
    const nodes = [];
    if (top.length) { nodes.push(h('li', { role: 'presentation', class: 'o-phone-group', 'data-grp': 'top' }, this.t('phone.suggested'))); top.forEach(c => nodes.push(item(c, 'top'))); nodes.push(h('li', { role: 'presentation', class: 'o-phone-group', 'data-grp': 'top' }, this.t('phone.all'))); }
    all.forEach(c => nodes.push(item(c, 'all')));
    this.empty.textContent = this.t('phone.noResults');
    this.list.replaceChildren(...nodes);
  }
  ensurePanel() {
    if (this.panel) return;
    this.search = h('input', { type: 'search', class: 'o-input o-input-sm o-phone-search', role: 'combobox', 'aria-autocomplete': 'list', 'aria-expanded': 'true', autocomplete: 'off', spellcheck: 'false' });
    this.list = h('ul', { class: 'o-phone-list o-scroll', role: 'listbox', id: uid('phone-list') });
    this.empty = h('div', { class: 'o-phone-empty', role: 'status', hidden: true });
    this.search.setAttribute('aria-controls', this.list.id);
    this.panel = h('div', { class: 'o-floating o-phone-panel', hidden: true }, h('div', { class: 'o-phone-search-wrap' }, raw(String(icon('search'))), this.search), this.list, this.empty);
    this.nav = new ListNav(this.list, { items: '[role=option]:not([hidden])', virtual: this.search, onSelect: el => this.pick(el.dataset.iso) });
    on(this.search, 'input', () => this.filter());
    on(this.search, 'keydown', e => { if (e.key === 'Tab') this.close(); else this.nav.handle(e); });
    on(this.list, 'click', '[role=option]', (e, el) => this.pick(el.dataset.iso));
    on(this.list, 'pointermove', '[role=option]', (e, el) => { if (this.nav.active !== el) this.nav.setItem(el, { scroll: false }); });
  }
  filter() {
    const q = norm(this.search.value.trim());
    let first = null, n = 0;
    this.list.querySelectorAll('.is-active').forEach(x => x.classList.remove('is-active'));
    for (const li of this.list.children) {
      if (li.dataset.grp === 'top') { li.hidden = !!q; continue; }
      const hit = !q || li.dataset.q.split(' ').some(w => w.startsWith(q.replace(/^\+/, '')) || w.startsWith(q)) || li.dataset.q.includes(q);
      li.hidden = !hit;
      if (hit) { n++; if (!first) first = li; }
    }
    this.empty.hidden = n > 0;
    if (q) announce(n ? t('common.items', { count: n }) : this.t('phone.noResults'));
    if (q && first) this.nav.setItem(first); else if (!q) this.markCurrent();
    else this.nav.reset();
  }
  markCurrent() {
    const cur = this.list.querySelector(`[data-grp="all"][data-iso="${this._c.iso}"]`);
    this.list.querySelectorAll('.is-active').forEach(x => x.classList.remove('is-active'));
    this.list.querySelectorAll('[aria-selected="true"]').forEach(x => x.setAttribute('aria-selected', 'false'));
    this.list.querySelectorAll(`[data-iso="${this._c.iso}"]`).forEach(x => x.setAttribute('aria-selected', 'true'));
    if (cur) { this.nav.setItem(cur, { scroll: false }); cur.scrollIntoView({ block: 'center' }); }
  }
  open(initial) {
    if (this._ov || this.isDisabled || this.readonly) return;
    if (!this.emit('before-open')) return;
    this.ensurePanel();
    this.buildList();
    const panel = this.panel;
    portal(panel, this);
    panel.hidden = false;
    this.search.value = initial || '';
    this.search.placeholder = this.t('phone.search');
    this.search.setAttribute('aria-label', this.t('phone.search'));
    this.list.setAttribute('aria-label', this.t('phone.country'));
    this._unplace = autoPlace(panel, this.box, { placement: 'bottom-start', offset: 4, flip: true, size: true });
    this._ov = overlays.open({
      el: panel, owner: this,
      onClose: reason => {
        this._ov = null; this._unplace?.(); panel.hidden = true;
        this.classList.remove('is-open'); this.btn.setAttribute('aria-expanded', 'false');
        this.emit('close', { reason });
      },
    });
    this.classList.add('is-open'); this.btn.setAttribute('aria-expanded', 'true');
    this.search.focus({ preventScroll: true });
    if (initial) this.filter(); else { this.empty.hidden = true; this.markCurrent(); }
    animate(panel, 'zoomIn', { duration: 120 });
    this.emit('open');
  }
  close() { this._ov?.close('api'); }
  pick(iso) {
    this.close();
    this.setCountry(iso, true);
    this.input.focus();
  }
}
define('o-phone', OPhone);

O.phone = {
  parse: (text, iso) => { const r = parse(text, iso); return { country: r.country.iso, dial: r.country.dial, national: r.national, e164: r.e164, valid: r.valid }; },
  format: (v, style, iso) => formatNumber(v, style, iso),
  validate: (v, iso) => parse(v, iso).valid,
  countries: COUNTRIES.map(c => ({ iso: c.iso, dial: c.dial, name: c.name, areas: c.areas })),
  country: iso => BY_ISO.get(String(iso).toUpperCase()) || null,
  name: (iso, loc) => { const c = BY_ISO.get(String(iso).toUpperCase()); return c ? nameOf(c, loc) : ''; },
  flag,
};
O.Phone = OPhone;
