/* legacy-carousel-swipe.js — salvaged from .tmp/eval-carousel.js (docs/components/carousel.html).
 * A touch-style pointer swipe (right-to-left) on <o-carousel> advances the active slide index.
 */
(async () => {
  const car = document.querySelector('#hero-car');
  car.pause();
  await new Promise(r => setTimeout(r, 50));
  const before = car.index;
  const rect = car.getBoundingClientRect();
  const y = rect.top + rect.height / 2;
  const startX = rect.left + rect.width * 0.85;
  const midX = rect.left + rect.width * 0.5;
  const endX = rect.left + rect.width * 0.1;
  const fire = (type, x) => car.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 7, pointerType: 'touch', button: 0, isPrimary: true }));
  fire('pointerdown', startX);
  await new Promise(r => setTimeout(r, 20));
  fire('pointermove', midX);
  await new Promise(r => setTimeout(r, 20));
  fire('pointermove', endX);
  await new Promise(r => setTimeout(r, 20));
  fire('pointerup', endX);
  await new Promise(r => setTimeout(r, 700));
  const after = car.index;
  const moved = after !== before;
  const ok = moved && car.count > 0;
  return { ok, before, after, moved, count: car.count };
})()
