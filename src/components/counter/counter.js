/* Character / word counter and textarea autosize (behaviors; the native field stays the form field).
 *   <textarea class="o-textarea" data-o-counter maxlength="200"></textarea>
 *   <input data-o-counter data-o-counter-max="60" data-o-counter-mode="chars|words|remaining" data-o-counter-warn="10|90%">
 *   data-o-counter-target="#el"  render the counter into an existing element instead of after the field
 *   <textarea data-o-autosize="8" rows="2">   grows with its content from `rows` up to 8 rows (empty = no limit)
 *   Orion.counter.count(text, 'words') · Orion.counter.refresh(el) · Orion.autosize(el)   (after setting .value in code)
 *   Over a data-o-counter-max limit (no maxlength) the field gets a custom validity error.
 */
i18n.add('en', {
  counter: {
    chars: '{count} / {max}', words: { one: '{count} word', other: '{count} words' }, wordsMax: '{count} / {max} words',
    remaining: { one: '{count} character left', other: '{count} characters left' },
    wordsRemaining: { one: '{count} word left', other: '{count} words left' },
    near: { one: '{count} character remaining', other: '{count} characters remaining' },
    nearWords: { one: '{count} word remaining', other: '{count} words remaining' },
    limit: 'Limit reached', over: 'Too long: {count} over the limit', describe: 'Maximum {max}',
  },
});

const count = (text, mode = 'chars') => {
  const s = String(text ?? '');
  return mode === 'words' ? (s.trim() ? s.trim().split(/\s+/u).length : 0) : s.length;
};
const COUNTERS = new WeakMap();

behavior('data-o-counter', el => {
  const d = el.dataset, out = h('div', { class: 'o-counter', id: uid('counter') });
  const target = d.oCounterTarget ? $(d.oCounterTarget) : null;
  if (target) target.append(out); else (el.closest('.o-input-group, .o-input-wrap, .o-floating') || el).after(out);
  const prevDesc = el.getAttribute('aria-describedby');
  el.setAttribute('aria-describedby', cls(prevDesc, out.id));
  let level = 0, ownErr = false;

  const upd = () => {
    const mode = d.oCounterMode || 'chars', words = mode === 'words';
    const max = +(d.oCounterMax || (el.maxLength > 0 ? el.maxLength : 0)) || 0;
    const n = count(el.value, words ? 'words' : 'chars'), left = max - n;
    const w = d.oCounterWarn || '', warnAt = !max ? Infinity : w.endsWith('%') ? max * (1 - parseFloat(w) / 100) : w ? +w : Math.max(3, Math.round(max * 0.1));
    let text;
    if (mode === 'remaining' && max) text = t('counter.remaining', { count: left });
    else if (words) text = max ? t('counter.wordsMax', { count: fmt.number(n), max: fmt.number(max) }) : t('counter.words', { count: n });
    else text = max ? t('counter.chars', { count: fmt.number(n), max: fmt.number(max) }) : fmt.number(n);
    out.textContent = text;
    const lv = !max ? 0 : left < 0 ? 3 : left === 0 ? 2 : left <= warnAt ? 1 : 0;
    out.classList.toggle('is-warning', lv === 1);
    out.classList.toggle('is-limit', lv === 2);
    out.classList.toggle('is-over', lv === 3);
    if (lv !== level && lv > level) announce(lv === 1 ? t(words ? 'counter.nearWords' : 'counter.near', { count: left }) : lv === 2 ? t('counter.limit') : t('counter.over', { count: -left }));
    level = lv;
    const err = lv === 3 ? t('counter.over', { count: -left }) : '';
    if (err || ownErr) { el.setCustomValidity?.(err); ownErr = !!err; }
  };
  const offs = [on(el, 'input', upd), on(el, 'change', upd)];
  if (el.form) offs.push(on(el.form, 'reset', () => setTimeout(upd)));
  COUNTERS.set(el, upd);
  upd();
  return () => {
    offs.forEach(f => f()); out.remove(); COUNTERS.delete(el);
    if (prevDesc) el.setAttribute('aria-describedby', prevDesc); else el.removeAttribute('aria-describedby');
    if (ownErr) el.setCustomValidity('');
  };
});

/* ── autosize ─────────────────────────────────────────────────────────── */
const SIZERS = new WeakMap();
behavior('data-o-autosize', el => {
  if (el.localName !== 'textarea') return;
  let lastW = 0;
  const fit = () => {
    const cs = getComputedStyle(el);
    const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5;
    const extra = cs.boxSizing === 'border-box' ? parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth) : 0;
    const maxRows = parseInt(el.dataset.oAutosize, 10) || 0, minRows = el.rows || 1;
    const top = el.scrollTop;
    el.style.height = 'auto';
    el.style.minHeight = '0';
    const need = el.scrollHeight + (cs.boxSizing === 'border-box' ? parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth) : 0);
    const min = minRows * lh + extra, max = maxRows ? maxRows * lh + extra : Infinity;
    el.style.height = Math.ceil(clamp(need, min, max)) + 'px';
    el.style.minHeight = '';
    el.style.overflowY = need > max + 1 ? 'auto' : 'hidden';
    el.scrollTop = top;
  };
  const offs = [on(el, 'input', fit), on(el, 'focus', fit), observeResize(el, r => { if (Math.abs(r.width - lastW) > 0.5) { lastW = r.width; fit(); } })];
  if (el.form) offs.push(on(el.form, 'reset', () => setTimeout(fit)));
  el.classList.add('o-autosize');
  SIZERS.set(el, fit);
  fit();
  return () => { offs.forEach(f => f()); el.classList.remove('o-autosize'); el.style.height = el.style.overflowY = ''; SIZERS.delete(el); };
});

O.counter = { count, refresh: el => COUNTERS.get($(el))?.() };
O.autosize = el => SIZERS.get($(el))?.();
