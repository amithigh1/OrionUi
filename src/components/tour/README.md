# Tour — product tours, onboarding checklist, hotspots

`Orion.tour()` (animated spotlight + step popover), `<o-checklist>` (onboarding progress widget) and the
`data-o-hotspot` behavior (pulsing "did you know" beacons). Zero dependencies; uses `Orion.popover` and
`<o-stepper>` when those packages are present, and falls back to core `place()`/`portal()`/`overlays` /
plain dots otherwise.

## `Orion.tour(config) -> { start, next, prev, end, goTo, isActive }`

```js
const tour = Orion.tour({
  id: 'dashboard-intro', persist: true, keyboard: true, overlayClose: false,
  steps: [
    { title: 'Welcome!', content: 'Let’s take a 30-second look around.' },              // target: none -> centered
    { target: '#stat-revenue', title: 'Your KPIs', content: 'Live numbers, updated every minute.', placement: 'bottom' },
    { target: '#new-report', title: 'Create a report', content: 'Click here to try it.',
      advanceOn: { event: 'click' } },                                                   // target stays clickable
    { target: '#help-btn', title: 'Need help?', content: 'Press F1 any time.', placement: 'left' },
  ],
  onFinish: () => Orion.toast?.success('Tour finished'),
  onSkip: () => {},
});
tour.start();          // start({ force: true }) ignores a persisted "already completed" state
```

* `target`: CSS selector, `Element`, or `() => Element`; omit for a centered step (e.g. a welcome screen).
  A selector target that isn't in the DOM yet is awaited with a `MutationObserver` (+ `targetTimeout`,
  default 8000ms) so tours can start before async content renders.
* The spotlight is an SVG mask with `pointer-events: none` — the highlighted element (and the rest of the
  page) stay fully clickable; `advanceOn: { selector?, event = 'click' }` auto-advances when the target
  (or a descendant matching `selector`) fires that event.
* The step dialog uses core `overlays` for Escape (`keyboard: false` disables it) and a focus trap scoped
  to the dialog — Tab cycles inside the popover, but the `advanceOn` target is still reachable by mouse/touch.
* `overlayClose: true` adds a click-outside-to-skip layer (a `clip-path` hole over the spotlight so the
  target stays clickable while everything else closes the tour).
* `persist: true` remembers completion (and the current step, if interrupted) in `localStorage` under
  `orion:tour:<id>`; `Orion.tour.get(id)` looks up a running tour created with that `id`.
* RTL: Left/Right arrow keys and popover placement follow `isRTL()`. Reduced motion: the spotlight snaps
  instead of animating.

## `<o-checklist tasks='[…]'>`

```html
<o-checklist heading="Getting started" floating dismissible
  tasks='[{"id":"profile","title":"Complete your profile","href":"/settings"},
          {"id":"tour","title":"Take the product tour","run":"startDashboardTour"}]'>
</o-checklist>
<script>
  window.startDashboardTour = () => Orion.tour.get('dashboard-intro')?.start({ force: true });
  document.querySelector('o-checklist').addEventListener('o-all-done', () => Orion.toast?.success("You're all set!"));
</script>
```

A task may have `href` (navigate), `run` (a global function name) or `onClick` (property, a function) —
clicking the row fires the cancelable `o-task` event and then runs the action. Completion is **not**
inferred automatically (a link doesn't tell you when the linked task is actually done); call
`el.complete(id)` yourself (for example from a tour's `onFinish`). Progress persists in `localStorage`
(`list-id` attribute, or an auto key hashed from the task ids).
Methods: `complete(id)` `uncomplete(id)` `toggle(id)` `isDone(id)` `progress()` `reset()` `show()` `hide()`.
Events: `o-task {task}` (cancelable), `o-complete {task}`, `o-all-done`, `o-dismiss`.

## Hotspots — `data-o-hotspot`

```html
<button id="new-report" class="o-btn o-btn-primary" data-o-hotspot="New: export straight to PDF" data-o-hotspot-placement="top">
  New report
</button>
```

A pulsing beacon is added to the element; opening it (click/Enter) shows the tip and marks it dismissed in
`localStorage` (`data-o-hotspot-id`, or a hash of the text) forever after — set once per feature you ship.

## Files

`10-tour.js` `Orion.tour` · `20-checklist.js` `<o-checklist>` · `30-hotspot.js` `data-o-hotspot` · `tour.css`.
