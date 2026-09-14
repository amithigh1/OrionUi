(async () => {
  // dist/locales/<xx>.js must add a locale to a bundle that does not embed it (the lite bundle, or --locales=none).
  // Run against the lite bundle (the manifest entry passes --bundle=dist/orion.lite.js) to prove the standalone path;
  // against the full bundle it degenerates to "re-adding an existing pack is harmless".
  const out = {};
  const before = Orion.i18n.locales ? Orion.i18n.locales() : null;
  const src = await (await fetch('/dist/locales/ms.js')).text();
  out.fetched = src.length > 10000 && src.includes("O.i18n.add('ms'");
  new Function(src)();                             // same as <script src="dist/locales/ms.js">
  const en = Orion.t('common.cancel');
  out.enCancel = en;
  await Orion.i18n.set('ms', { persist: false });
  out.msCancel = Orion.t('common.cancel');
  out.translated = out.msCancel !== en && out.msCancel.length > 0;
  out.componentString = Orion.t('select.noResults');
  out.componentTranslated = out.componentString !== 'No results' && !/^select\./.test(out.componentString);
  await Orion.i18n.set('en', { persist: false });
  out.reverted = Orion.t('common.cancel') === en;
  out.ok = out.fetched && out.translated && out.componentTranslated && out.reverted;
  return out;
})()
