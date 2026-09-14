/* legacy-lightbox-zoom.js — salvaged from .tmp/eval-lightbox3.js (docs/components/gallery.html).
 * Orion.lightbox() zoomIn()/reset()/close(): the active slide gains is-zoomed + a scale() transform above
 * 1, and reset() removes both. Kept over .tmp/eval-lightbox.js, .tmp/eval-lightbox2.js and
 * .tmp/eval-lightbox-shot.js (dropped — earlier iterations with fewer or no comparable assertions).
 */
(async () => {
  const items = [
    { src: '../fixtures/media/photo-mountains.jpg', width: 1600, height: 1067 },
    { src: '../fixtures/media/photo-ocean.jpg', width: 1600, height: 1067 },
  ];
  const lb = Orion.lightbox(items, { thumbnails: false });
  await new Promise(r => setTimeout(r, 500));
  const beforeZoom = lb.zoom;
  const beforeZoomedClass = !!document.querySelector('.o-lightbox-slide.is-zoomed');
  lb.zoomIn(); lb.zoomIn();
  await new Promise(r => setTimeout(r, 400));
  const afterZoom = lb.zoom;
  const zoomedSlide = document.querySelector('.o-lightbox-slide.is-zoomed');
  const afterTransform = zoomedSlide ? zoomedSlide.querySelector('.o-lightbox-img').style.transform : null;
  lb.reset();
  await new Promise(r => setTimeout(r, 350));
  const resetZoom = lb.zoom;
  const resetZoomedClass = !!document.querySelector('.o-lightbox-slide.is-zoomed');
  lb.close();

  const zoomedIn = afterZoom > beforeZoom + 0.05;
  const hasScaleAboveOne = /scale\(1\.[1-9]/.test(afterTransform || '');
  const resetWorked = !resetZoomedClass;
  const ok = !beforeZoomedClass && zoomedIn && !!zoomedSlide && hasScaleAboveOne && resetWorked && Math.abs(resetZoom - beforeZoom) < 0.05;
  return { ok, beforeZoom, afterZoom, beforeZoomedClass, zoomedIn, afterTransform, hasScaleAboveOne, resetZoom, resetZoomedClass, resetWorked };
})()
