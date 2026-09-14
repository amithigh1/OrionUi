(() => {
  const before = Orion.anim.reducedMotion();
  document.documentElement.classList.add('o-motion-reduce');
  const forced = Orion.anim.reducedMotion();
  document.documentElement.classList.remove('o-motion-reduce');
  const after = Orion.anim.reducedMotion();
  return { before, forced, after, sameAsA11y: Orion.a11y.reducedMotion === Orion.anim.reducedMotion, ok: forced === true && after === before };
})()
