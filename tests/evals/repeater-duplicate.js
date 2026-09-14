(async () => {
  // Regression: the repeater's `duplicate` prop used to replace its duplicate() method, so the Duplicate button threw.
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const out = {};
  const rep = document.querySelector('o-repeater');
  out.found = !!rep;
  if (!rep) { out.ok = false; return out; }
  await customElements.whenDefined('o-repeater'); await sleep(50);
  out.methodIsFunction = typeof rep.duplicate === 'function';
  out.propDefaultTrue = rep.duplicable === true;
  const before = rep.count;
  const btn = rep.querySelector('[data-o-act="duplicate"]');
  out.buttonRendered = !!btn;
  let threw = null;
  try { btn && btn.click(); await sleep(100); } catch (e) { threw = String(e); }
  out.threw = threw;
  out.rowsAfterClick = rep.count;
  out.rowAdded = rep.count === before + 1;
  // attribute form still works: <o-repeater duplicate> / removing it hides the button
  rep.removeAttribute('duplicate'); rep.duplicable = false; await sleep(50);
  out.hiddenWhenDisabled = !rep.querySelector('[data-o-act="duplicate"]');
  rep.duplicable = true; await sleep(50);
  out.backWhenEnabled = !!rep.querySelector('[data-o-act="duplicate"]');
  out.ok = out.found && out.methodIsFunction && out.propDefaultTrue && out.buttonRendered && !threw && out.rowAdded && out.hiddenWhenDisabled && out.backWhenEnabled;
  return out;
})()
