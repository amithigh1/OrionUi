/* <section data-o-help="billing"> — a contextual help hook. While "What's this?" mode is active
 * (Orion.help.whatsThis(true), or the toolbar button in <o-help-panel> pages) every such element is
 * outlined; clicking one opens Orion.help.open(key) and exits inspect mode. Outside inspect mode the
 * attribute is inert (no visual change), so it is safe to sprinkle across a whole app.
 */
behavior('data-o-help', (el, key) => {
  const paint = active => el.classList.toggle('o-help-target', !!active);
  paint(O.help.inspecting);
  const offInspect = bus.on('help:inspect', paint);
  const onClick = e => {
    if (!O.help.inspecting) return;
    e.preventDefault(); e.stopPropagation();
    O.help.whatsThis(false);
    O.help.open(key);
  };
  const offClick = on(el, 'click', onClick, { capture: true });
  return () => { offInspect(); offClick(); el.classList.remove('o-help-target'); };
});

/* data-o-action="help" [data-o-value="key"]  ·  data-o-action="help-whats-this" — delegated toolbar buttons */
action('help', trigger => O.help.open(trigger.getAttribute('data-o-value') || undefined));
action('help-whats-this', () => O.help.whatsThis());
