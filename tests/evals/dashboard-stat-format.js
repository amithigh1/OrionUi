(async () => {
  const raf = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const out = {};
  const valueText = stat => stat.querySelector('.o-stat-value bdi').textContent;
  const byLabel = (root, label) => [...root.querySelectorAll('o-stat')].find(s => s.label === label);

  /* ================= #formatting: currency / percent / compact / bytes / duration / raw ================= */
  const fmtSection = document.getElementById('formatting');
  const currency = byLabel(fmtSection, 'Currency'), percent = byLabel(fmtSection, 'Percent'),
    compact = byLabel(fmtSection, 'Compact'), bytes = byLabel(fmtSection, 'Bytes'),
    duration = byLabel(fmtSection, 'Duration'), rawStat = byLabel(fmtSection, 'Raw');

  out.currencyText = valueText(currency);
  out.currencyHasSymbolAndGrouping = /[€$]/.test(out.currencyText) && /128[,. ]?450/.test(out.currencyText);
  out.percentText = valueText(percent);
  out.percentHasSign = out.percentText.includes('%') && out.percentText.includes('64');
  out.compactText = valueText(compact);
  out.compactIsShortened = /1\.3\s*M/i.test(out.compactText); // 1284000 -> "1.3M"
  out.bytesText = valueText(bytes);
  out.bytesHasUnit = /(MB|GB)/i.test(out.bytesText); // 93,460,000 bytes ~89.1 MiB / 93.46 MB depending on base
  out.durationText = valueText(duration);
  out.durationLooksLikeClock = /\d+/.test(out.durationText); // 734000ms -> "12:14" or similar, not the raw number
  out.durationNotRawMs = out.durationText !== '734000';
  out.rawText = valueText(rawStat);
  out.rawIsLiteral = out.rawText === 'build v2.4.1'; // prefix="build " + format="raw" => no number formatting at all

  /* ---- Orion.countUp.format is the exact same formatter, usable standalone ---- */
  out.standaloneFormatMatchesCompact = Orion.countUp.format(1284000, { compact: true }) === out.compactText;
  out.standaloneFormatCurrency = Orion.countUp.format(1234.5, { format: 'currency', currency: 'USD' });
  out.standaloneFormatHasDollar = out.standaloneFormatCurrency.includes('$');

  /* ================= #delta-sparkline: colour is by favorable/unfavorable, not just direction ================= */
  const deltaSection = document.getElementById('delta-sparkline');
  const signups = byLabel(deltaSection, 'Signups');      // delta +18.5, default delta-good="up"    -> up & GOOD
  const churn = byLabel(deltaSection, 'Churn');           // delta -0.3,  delta-good="down"           -> down & GOOD (churn falling is good)
  const errors = byLabel(deltaSection, 'Errors / day');   // delta +40,   delta-good="down"            -> up & BAD (errors rising is bad)

  const deltaCls = stat => stat.querySelector('.o-stat-delta').className;
  out.signupsClass = deltaCls(signups);
  out.signupsUpAndGood = out.signupsClass.includes('is-up') && out.signupsClass.includes('is-good');
  out.churnClass = deltaCls(churn);
  out.churnDownAndGood = out.churnClass.includes('is-down') && out.churnClass.includes('is-good');
  out.errorsClass = deltaCls(errors);
  out.errorsUpAndBad = out.errorsClass.includes('is-up') && out.errorsClass.includes('is-bad');

  const srText = stat => stat.querySelector('.o-stat-delta .o-sr-only').textContent;
  out.signupsSrSaysFavorable = /favorable/i.test(srText(signups)) && !/unfavorable/i.test(srText(signups));
  out.errorsSrSaysUnfavorable = /unfavorable/i.test(srText(errors));

  /* ---- flat delta (0) is always neutral regardless of delta-good ---- */
  const flat = document.createElement('o-stat');
  flat.label = 'Flat'; flat.value = 10; flat.delta = 0;
  document.body.appendChild(flat);
  await raf();
  out.flatDeltaIsNeutral = deltaCls(flat).includes('is-neutral');
  document.body.removeChild(flat);

  /* ---- dynamic update: changing format/value re-renders through the same formatter ---- */
  const overview = document.getElementById('overview');
  const revenue = byLabel(overview, 'Revenue');
  const before = valueText(revenue);
  revenue.value = 5000000;
  revenue.format = 'compact';
  await raf();
  out.dynamicUpdateChangedText = valueText(revenue) !== before;
  out.dynamicUpdateShowsCompactMillions = /5\s*M/i.test(valueText(revenue));

  out.ok = out.currencyHasSymbolAndGrouping && out.percentHasSign && out.compactIsShortened && out.bytesHasUnit
    && out.durationNotRawMs && out.rawIsLiteral && out.standaloneFormatMatchesCompact && out.standaloneFormatHasDollar
    && out.signupsUpAndGood && out.churnDownAndGood && out.errorsUpAndBad && out.signupsSrSaysFavorable
    && out.errorsSrSaysUnfavorable && out.flatDeltaIsNeutral && out.dynamicUpdateChangedText && out.dynamicUpdateShowsCompactMillions;
  return out;
})()
