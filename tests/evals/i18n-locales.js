/* i18n-locales.js — docs/components/select.html, driving Orion.i18n.set() across all 11 shipped locales.
 * Orion.i18n.locale is a getter only (see src/core/20-i18n.js) — Orion.i18n.set(locale, {persist}) is the
 * real, documented way to switch language, so this proves that API end-to-end rather than poking a property.
 * Checks, per locale: no console errors during the switch; Orion.t('common.cancel') differs from the English
 * baseline; a freshly-created <o-select> (empty options list) and <o-datatable> (empty rows) both live
 * re-render their "No options"/"No data" text with no manual refresh, proving the bus('locale') -> OElement
 * requestUpdate() wiring described in src/core/40-component.js actually reaches real components; Arabic sets
 * <html dir="rtl">, every other locale (re)confirms "ltr"; and Orion.t('common.items', {count}) picks the
 * right plural category via Intl.PluralRules (checked both by simple {count} substitution and, for Arabic,
 * by the one/two dual-form wording genuinely differing, not just the digit).
 *   node build/check.mjs docs/components/select.html "--eval=@tests/evals/i18n-locales.js" --bundle=dist/orion.js
 */
(async () => {
  const sleep = ms => new Promise(res => setTimeout(res, ms));
  const O = window.Orion;
  const r = {};

  const LOCALES = ['ar', 'de', 'es', 'fr', 'hi', 'id', 'ja', 'ms', 'pt', 'zh'];
  // Intl.PluralRules for these locales only ever selects "other" for cardinal numbers, so their common.items
  // dict legitimately carries a single {other} form — count=1 vs count=5 differ only in the digit, not the
  // surrounding word, and that is correct (not a bug) for these four languages specifically. Hindi's own
  // common.items (pre-existing, not part of this locale pack) uses the same invariant noun "आइटम" for one
  // and other, which is also correct Hindi grammar, not a missing translation.
  const NO_WORD_VARIATION = new Set(['id', 'ja', 'ms', 'zh', 'hi']);
  const stripDigits = s => String(s).replace(/[0-9]+/g, '#');

  const errors = [];
  const origError = console.error.bind(console);
  console.error = (...args) => { errors.push(args.map(String).join(' ')); origError(...args); };

  /* ── Orion.i18n.locale is documented as getter-only; assigning to it must not change anything — set() is
   *    the real API (verified against src/core/20-i18n.js, not assumed). ─────────────────────────────────── */
  const localeBefore = O.i18n.locale;
  try { O.i18n.locale = 'zz-not-a-real-locale'; } catch { /* a strict-mode throw also proves it's not settable */ }
  r.localeIsGetterOnly = O.i18n.locale === localeBefore;
  r.isRTLApiCorrect = O.i18n.isRTL('ar') === true && O.i18n.isRTL('en') === false;

  /* ── fresh elements, independent of anything already on the select.html page ────────────────────────── */
  const sel = document.createElement('o-select');
  sel.id = 'eval-i18n-select';
  document.body.append(sel);
  const dt = document.createElement('o-datatable');
  dt.id = 'eval-i18n-table';
  dt.setAttribute('columns', '[{"key":"name","label":"Name"}]');
  document.body.append(dt);
  await sleep(80);

  sel.open(); // empty option list + no search query => renders select.noOptions ("No options available")
  await sleep(60);
  // this.panel is a stable instance property portaled elsewhere in the DOM while open (see
  // src/components/select/10-listbox.js's openPanel/portal) — read through the reference, not sel's own subtree.
  const selectEmptyText = () => sel.panel?.querySelector('.o-select-msg.is-empty')?.textContent || '';
  const tableEmptyText = () => dt.querySelector('.o-empty-title')?.textContent || '';

  const enCancel = O.t('common.cancel');
  const enSelectEmpty = selectEmptyText();
  const enTableEmpty = tableEmptyText();
  r.baselineCaptured = !!enCancel && !!enSelectEmpty && !!enTableEmpty;

  const enItems1 = O.t('common.items', { count: 1 });
  const enItems2 = O.t('common.items', { count: 2 });
  r.enPluralWordDiffers = stripDigits(enItems1) !== stripDigits(enItems2); // "1 item" vs "2 items"

  const perLocale = {};
  for (const loc of LOCALES) {
    errors.length = 0;
    O.i18n.set(loc, { persist: false });
    await sleep(80);

    const cancelNow = O.t('common.cancel');
    const items1 = O.t('common.items', { count: 1 });
    const items5 = O.t('common.items', { count: 5 });

    perLocale[loc] = {
      cancelDiffers: cancelNow !== enCancel && cancelNow !== 'common.cancel',
      selectRerendered: selectEmptyText() !== '' && selectEmptyText() !== enSelectEmpty,
      tableRerendered: tableEmptyText() !== '' && tableEmptyText() !== enTableEmpty,
      dirOk: loc === 'ar' ? document.documentElement.dir === 'rtl' : document.documentElement.dir === 'ltr',
      langAttrOk: document.documentElement.lang === loc,
      // count=5 always lands in a numeral-showing category (CLDR "other", or Arabic's "few"); count=1 alone
      // may legitimately drop the digit (e.g. Arabic "one" -> "عنصر واحد", the word itself says "one"), so
      // only require items1 to be a real, non-empty translation, not that it echoes the literal digit "1".
      countsSubstituted: items1.length > 0 && items1 !== 'common.items' && items5.includes('5'),
      pluralWordDiffers: NO_WORD_VARIATION.has(loc) ? true : stripDigits(items1) !== stripDigits(items5),
      noConsoleErrors: errors.length === 0,
      sample: { cancel: cancelNow, items1, items5, selectEmpty: selectEmptyText(), tableEmpty: tableEmptyText() },
    };
  }

  /* ── Arabic dual-form check: count=1 ("one") vs count=2 ("two") must produce genuinely different wording,
   *    not merely a different digit — proves real Intl.PluralRules category selection is wired through t(). */
  O.i18n.set('ar', { persist: false });
  await sleep(60);
  const arOne = O.t('common.items', { count: 1 });
  const arTwo = O.t('common.items', { count: 2 });
  r.arDualFormDiffers = arOne !== arTwo && stripDigits(arOne) !== stripDigits(arTwo);

  /* ── revert to English and confirm it is a genuine live round-trip, not a one-way flag ────────────────── */
  errors.length = 0;
  O.i18n.set('en', { persist: false });
  await sleep(80);
  r.revertedCancel = O.t('common.cancel') === enCancel;
  r.revertedDir = document.documentElement.dir === 'ltr';
  r.revertedSelect = selectEmptyText() === enSelectEmpty;
  r.revertedTable = tableEmptyText() === enTableEmpty;
  r.revertNoConsoleErrors = errors.length === 0;

  console.error = origError;
  sel.close?.();
  sel.remove();
  dt.remove();

  r.perLocale = perLocale;
  const allLocalesOk = LOCALES.every(loc => {
    const p = perLocale[loc];
    return p.cancelDiffers && p.selectRerendered && p.tableRerendered && p.dirOk && p.langAttrOk
      && p.countsSubstituted && p.pluralWordDiffers && p.noConsoleErrors;
  });

  r.ok = r.localeIsGetterOnly && r.isRTLApiCorrect && r.baselineCaptured && r.enPluralWordDiffers && allLocalesOk
    && r.arDualFormDiffers && r.revertedCancel && r.revertedDir && r.revertedSelect && r.revertedTable && r.revertNoConsoleErrors;
  return r;
})()
