# Orion Admin — status and remaining work

_Snapshot: 12 Sep 2026. Numbers come from `node build/audit.mjs`, `node build/gen-types.mjs` and a fresh
`node build/build.mjs` — re-run them rather than trusting this file if it looks stale._

## Where things stand

| Area | State |
|---|---|
| Component folders | **132** in `src/components/` (118 custom elements, 271 `Orion.*` APIs, 47 `data-o-*` behaviors, 21 actions) |
| Build | Clean, minify included (`npm run build`, 13 Sep, all 132 packages + 10 locale packs): `orion.min.js` 4.72 MB / 1.39 MB gzip (all locales embedded), `orion.lite.min.js` 1.37 MB / 388 KB gzip (48 components, English only), `dist/locales/<xx>.min.js` ~85 KB / 28 KB each. `--locales=all\|none\|codes` controls embedding for custom builds. README and getting-started carry these numbers |
| **Integration pass (13 Sep)** | `node build/audit.mjs --strict` → **zero collisions** (one accepted CSS warning); `npm run build` clean; `npm run test:unit` pass; `tests/frameworks` React 18/19 + Vue 3 + Angular 21 **4/4**; `node build/check.mjs --all` → **215/215 pages clean in light, dark, RTL and mobile** against `dist/` |
| Collisions (`audit.mjs`) | **No** element / API / behavior / action collisions. 1 i18n namespace overlap left (`scanner`); the 14 cross-folder CSS warnings are scoped selectors, not duplicates (see P1) |
| Templates (`templates/`) | **18 pages + gallery, all 19 verified** in headless Chrome (light / dark / RTL / mobile, zero console errors). `products`, `profile`, `files`, `chat`, `users` and `examples/vanilla` have scripted interaction tests in `tests/evals/` and were screenshot-reviewed on desktop, phone and dark. `npm run test:evals` now runs **139 scripts** (templates, examples, every package's flows, 50 salvaged first-wave scripts, locale switching and the standalone language pack) — all passing against the final `dist/` on 13 Sep |
| Docs (`docs/`) | `node build/check.mjs --all` sweeps **202 pages** (component pages, examples, templates, tests). Light-mode sweep on 12 Sep after all core/docs-shell changes: **205/205 clean**. The P1 docs-gap list is closed |
| Types | `dist/orion.d.ts` — 132 element interfaces, none empty (was 19 empty before the generator fix; `dist/` rebuilt 12 Sep with every fix listed below); regenerate after every package change (`npm run types`, assembled into `dist/` by `npm run build`) |
| Tests | `tests/core.html` 17/17; `tests/frameworks/` React 18 + 19, Vue 3, Angular 21 — **4/4 green against the 12 Sep `dist/`** (`npm install && npm test` there; a new `.npmrc` sets `legacy-peer-deps`, which the dual-React aliases require) |
| Examples | `examples/vanilla` verified end-to-end; `react`, `vue` (Vite) and `angular` present |
| Locales | 10 packs in `src/i18n/` (ar, de, es, fr, hi, id, ja, ms, pt, zh), each covering **all 142 namespaces / 2,883 keys** — `npm run test:i18n` enforces key, placeholder and plural parity with the English source; `tests/evals/i18n-locales.js` switches locales in the browser |

### Fixed in the latest session (already on disk)
* `src/components/map/30-markers.js` — a getter inside an `Object.assign()` source literal ran at load time and
  **crashed the whole `map` package, which failed every page check**. Same latent bug in `realtime/50-poll.js`
  (`live().running` was frozen to a snapshot). Both moved to `Object.defineProperty`; `build/audit.mjs` now fails
  hard on the pattern; documented in ARCHITECTURE.md §5.
* `build/docs.mjs` — page titles/descriptions are now HTML-decoded (`&amp;` was double-escaping in the sidebar).
* `build/serve.mjs` — HTTP Range (206/416) so `<video>`/`<audio>` seek over the dev server.
* `build/check.mjs` — `--eval=@path/to/script.js` reads the interaction script from a file (no shell quoting).
* `build/audit.mjs` — the cross-folder CSS rule now only counts single-compound selectors (`.o-x`, `.o-x.is-y`);
  `.o-parent .o-child` is a package styling its own children and no longer reports a second owner (was 14 noisy hits,
  now 7 real ones).
* `examples/vanilla/index.html` + `templates/users.html` — the "Create" modal button now sets `close: false`; without it
  a bare `return` on validation failure closed the dialog before any error could show (documented as a pitfall in
  `modal/README.md`). Verified with `.tmp/evals/vanilla.js` and `.tmp/evals/users.js`.
* i18n namespaces: permissions → `permissions.*`, printpreview → `printPreview.*`; kanban's scoped `.o-c-*` copy removed;
  `reducedMotion()` honours `html.o-motion-reduce`.
* `build/build.mjs` — unknown names in `--only` / `--exclude` (or a stale preset entry) now fail the build with the list
  of real folder names instead of silently building the wrong file (`docs/getting-started.html` had `--exclude=maps,charts`).
* `package.json` — `orion-admin/lite` and `orion-admin/lite/min` subpath exports for the lite bundle.
* `tests/frameworks/.npmrc` — `legacy-peer-deps=true` so the documented `npm install && npm test` works with React 18
  and 19 installed side by side.
* **Legacy scripts salvaged (13 Sep)** — 93 first-wave scripts left in `.tmp/` were triaged: 50 rescued into
  `tests/evals/legacy-*.js` (with their target pages verified, several stale assertions corrected and one real hang
  fixed), 1 converted to `tests/legacy-rrule.test.cjs` (now in `npm run test:unit`), 43 debug probes/duplicates/broken
  scripts deleted. Two real bugs they exposed are fixed: `Orion.xlsx.write()` dropped per-sheet `hidden: true`
  (now emits `state="hidden"` and keeps the active tab on a visible sheet; asserted in `legacy-csv-xlsx-extra.js`) and
  `Orion.http.mock`'s `req.query` collapsed repeated keys to the last value (now arrays; asserted in `http-mock-forms.js`).
* `src/core/40-component.js` — `FormElement`'s `name` prop now reflects to the attribute. Form submission and
  `FormData` key a form-associated element off its `name` **content attribute**, so a name set as a property (React,
  Vue, Angular, plain JS) silently dropped every Orion form control from the form. Found by the capture agent's
  signature test; regression `tests/evals/core-form-name.js`.
* `src/core/40-component.js` — `define()` now also reports a prop that shadows a method **on the same class** (the
  accessor is never created and the attribute value replaces the function). Two agents had just fixed this by hand in
  orgchart and geocode (`search` prop vs `search()`); the guard immediately found a third, `repeater`'s `duplicate`
  prop vs `duplicate()` — every repeater's Duplicate button threw. Fixed there as `duplicable` (attribute still
  `duplicate`), regression in `tests/evals/repeater-duplicate.js`. The guard is silent for all other packages.
* `build/audit.mjs` — new rule: `icon()` / `raw()` / `` html`…` `` results (SafeHTML) passed to a **native** DOM
  insertion method (`replaceChildren`, `append`, …) render as literal text. The comm agent had just fixed four of these
  in chat; the rule found five more in finished packages (calendar error state, recorder pause/record buttons ×3, tree
  lazy-load error node) — all switched to `iconEl()`. Audit is clean now.
* `docs/assets/docs.css` — on phones the floating Copy button no longer overlaps long code lines (header strip).
* `docs/assets/docs.js` — demo fragments are now appended **child by child**. Two agents independently hit the same
  race: custom-element reactions for an appended fragment flush only when `append()` returns, while a `<script>` inside
  the fragment runs during insertion, so a demo script calling a method on the element above it ran before that
  element's `setup()`. One child per `append()` gives parsed-page order. Applied only after a scan of all 697 demos
  found none relying on the old order, then verified: 205/205 pages clean, 72/72 interaction scripts.
* `src/components/http/20-mock.js` — `Orion.http.mock([['GET /api/x', fn]])` (the tuple form the infinite-scroll docs
  demo uses) was recursed into element by element, so the bare string and the bare function each became a **catch-all
  `'*'` route with an empty body** — every request through `Orion.http` on that page resolved to an empty 200 and
  never reached the network. The tuple form is now accepted and anything else throws a `TypeError`
  (`tests/evals/http-mock-forms.js`).
* `src/components/infinite/10-behavior.js` — `data-o-infinite` fetched with a raw `fetch()`, bypassing `Orion.http`
  (mock server, auth headers, interceptors, retries); it now goes through `Orion.http` when that package is bundled.
  Found because the page was clean under the agent's partial bundle and 404'd under the full one — an argument for
  always re-running package scripts against the full bundle, which `tests/evals/run.mjs` now does.
* `docs/assets/docs.js` — on phones every "deep" docs page loaded scrolled thousands of pixels down: the sidebar's
  `scrollIntoView()` also scrolled the document while the nav was off-canvas. Now only the sidebar's own scroll box moves
  (verified `scrollY` 0 on `dashboard.html`, previously ~2200).
* `build/gen-types.mjs` — **19 of 122 element interfaces in the shipped `.d.ts` were empty** (`OUploadElement`,
  `OEditorElement`, `OCalendarElement`, `OMapElement`, `ODashboardElement`, …) because the source scanner did not skip
  comments, regex literals or nested template literals before counting quotes and braces: one apostrophe in a doc comment
  (`isn't`) or one `` `a ${b ? `c` : ''}` `` silently swallowed the rest of the class. Now: comments/regexes/templates are
  blanked first with proper nesting, escapes are skipped correctly, factory-built classes (`define('o-x', makeX())` →
  `return class extends …`) are followed, and an unreadable class body prints a warning. Result: **0 empty interfaces**,
  covered by `tests/gen-types.test.mjs` (`npm run test:unit`). `dist/` was rebuilt afterwards: `dist/orion.d.ts` now
  declares 124 element interfaces, none empty.

## What is left

### P0 — needed before anyone can "go live" with the templates
1. ~~Rewrite four templates against the real inventory~~ **Done.** `products`, `profile`, `files` and `chat` were rewritten
   against the verified inventory and pass interaction scripts + the four-mode check. Lessons worth keeping (they cost a
   full rewrite): **never guess an element, class or API name** — `grep` the built `orion.css` and the component README
   first. Names that do *not* exist and what to use instead: `<o-facets> <o-segmented> <o-empty> <o-switch> <o-progress>
   <o-timeline> <o-context-menu> <o-lightbox> <o-emoji-picker> <o-currency> <o-tab>` → `.o-segmented .o-empty .o-switch
   .o-progress .o-timeline` class markup, `Orion.contextMenu()`, `Orion.lightbox()`, `Orion.mentions.emoji.picker()`,
   `<o-number currency>`, `<o-tab-panel>`; `Orion.esc` → `Orion.util.esc`; relative time is `Orion.format.relative`
   (not `fromNow`); `Orion.dialog` → `Orion.modal`; `Orion.format.currency(v, currencyCode, opts)`; `<o-avatar name status>`
   (status: online/away/busy/dnd/offline); `<o-tags value='["a","b"]'>`; datatable events `o-row-click` / `o-row-dblclick` /
   `o-select`; mask tokens are `9` digit, `a` letter, `*` alphanumeric (+ `data-o-mask-case="upper"`); open dropdown menus are
   **portaled**, so query them from `document`; `<o-tree>` needs an explicit host height (its row list is a scroll viewport).
2. **Finish the packages whose build agents were killed mid-work** (files exist; each stopped at the "verify in the
   browser" stage). For each: README if missing, docs page if missing, `check.mjs` clean in all four modes, `--eval`
   interaction test, then `node build/audit.mjs --strict`.

   | Package folder(s) | Missing | Notes |
   |---|---|---|
   | ~~`map`, `geocode`, `locationpicker`~~ | **done 12 Sep** — 3 READMEs, docs for Google provider / `<o-address-input>` / `<o-location-picker>`, `examples/maps-delivery-checkout.html`, offline tile + geocode fixtures, 12 scripts in `tests/evals/map-*.js` (green against the full bundle) | 8 real bugs fixed, the package had never run in a browser: shared tile cache blanked a second map; tiles painted over markers; address search returned nothing (`search` prop shadowed `search()`); double `o-change`; location-picker crosshair mode hung in a microtask loop; Google provider without a key crashed; pinch never committed zoom; a live `<o-map>` inside a `<pre>` |
   | ~~`diagram`, `orgchart`, `graph`~~ | **done 12 Sep** — 3 READMEs, docs for `<o-workflow>` `<o-orgchart>` `<o-graph>` + `examples/org-directory.html`, 82 assertions in `tests/evals/diagram-*.js` (re-run green against the full bundle) | fixed: orgchart `search` prop shadowed `search()`; four `diagram.html` demos rendered blank (duplicate ids); graph edge labels were never drawn |
   | ~~`gantt`, `timelineview`~~ | **done 12 Sep** — timelineview README, `docs/components/timeline-view.html`, `examples/scheduling-project.html`, 8 browser scripts in `tests/evals/gantt-*.js` (re-run green against the full bundle) + `tests/gantt-dst.test.cjs` (DST week boundaries, runs under Node with a forced zone because headless Chrome on Windows ignores `TZ`) | fixed: timelineview `cssText` wiped each item's transform (all grouped items piled onto lane 1); `getGroups()` reported stale collapse state; gantt `exportPDF()` fallback never emitted `o-export` |
   | ~~`qrcode`, `barcode`, `scanner`~~ | **done 12 Sep** — 3 READMEs, `docs/components/{qr-code,barcode,scanner}.html`, `examples/event-checkin.html`, 23 self-generated fixtures, `tests/evals/codes-*.js` (83 assertions; every QR payload × ECC level and all 11 symbologies round-trip generate → decode; green against the full bundle) | fixed two real decoder bugs (binarisation threshold collapsing on dark blocks; alignment-pattern search warping the homography), `<o-scanner source>` test path added; `.o-scanner-*` CSS made shared for camera; the `scanner` i18n rename is handed to the capture agent |
   | ~~`camera`, `signature`, `speech`, `recorder`~~ | **done 13 Sep** — speech README + CSS + new `<o-tts>`, `source`/`stream` test paths on camera/doc-scanner/recorders, fake STT/TTS engine injection, `docs/components/{camera,document-scanner,signature,recorder,speech}.html`, `examples/capture-kyc.html`, `tests/evals/capture-*.js` (86 assertions, 5/5 green against the full bundle); camera's `.o-scanner-*` copies and `scanner.*` strings removed/renamed → **`node build/audit.mjs --strict` passes with zero collisions** | fixed: camera `o-scan` double-fired; recorders revoked a blob URL while `<o-audio>`/`<o-video>` (present only in the full bundle) were still loading it — URL is now detached first and revoked later; found the core `name`-reflection bug above |
   | ~~`ai`, `aitools`, `assistant`~~ | **done 13 Sep** — aitools built out (ghost-text complete, suggest toolbar, summarize/rewrite/translate, fillForm with confirm, analyze, search provider) + CSS, 3 READMEs, `docs/components/{ai,ai-tools,chatbot}.html`, `examples/ai-helpdesk.html`, `tests/evals/ai-*.js` (9/9 green against the full bundle); assistant's `.o-chat-*` copies renamed `.o-chatbot-*` (audit CSS list now only the accepted `.o-theme-dark`) | security: the OpenAI-compatible adapter had no `dangerouslyAllowBrowser` gate (added, plus a warning on the allowed path for both adapters); fixed: assistant auto-focus collapsed the page selection that "Explain selection" reads; `tasks.X()` never forwarded `task`/`options` to providers |
   | `chat`, `notifications`, `presence`, `activity` | README (chat, notifications); **`presence/` and `activity/` are empty**; notifications has no CSS; docs for `<o-chat>` `Orion.notifications` | `<o-activity-feed>` is used by `templates/dashboard.html` — confirm which folder defines it |
   | ~~`dashboard`, `stat`, `virtuallist`, `infinite`~~ | **done 12 Sep** — 4 READMEs, `docs/components/stat.html`, `examples/analytics-workspace.html`, `Orion.gridLayout`/`Orion.countUp` documented, 12 scripts in `tests/evals/dashboard-*.js`, all green against the full bundle (the two on `infinite-scroll.html` first exposed the `http.mock` catch-all bug and the raw-`fetch` bypass listed above) | fixed: `data-o-infinite-threshold="0"` was discarded; infinite status row not announced to screen readers |
   | ~~`emailpreview`, `commandpalette`, `globalsearch`~~ | **done 12 Sep** — 100 assertions across `tests/evals/verify-*.js`, four-mode clean, screenshots reviewed | fixed a real `[object Object]` bug in global-search recents and the recent-list scope isolation |
   | ~~`chat`, `notifications`, `presence`, `activity`~~ | **done 12 Sep** — `presence/` and `activity/` built from scratch, notifications got its CSS + bell + center, 4 READMEs, `docs/components/{chat,notifications,presence-activity}.html`, `examples/team-workspace.html`, `tests/evals/comm-*.js` (4/4 green against the full bundle); `templates/dashboard.html`'s `<o-activity-feed>` now renders its four seeded items | fixed in chat: icons rendered as literal `<svg>` text (SafeHTML into native `replaceChildren()`), leftover empty-state next to real rows, `auto-load` ignoring a late `source`, overlapping rows at narrow widths |
   | ~~`compare`, `facets`, `ocr`~~ | **built from empty 12 Sep** — `<o-facets>`/`<o-facet-chips>` (standalone or bound to a datatable), `Orion.compare` + `<o-compare-tray>`/`<o-compare-table>`, `Orion.ocr` (adapter contract, offline fixture engine, opt-in Tesseract adapter) + `<o-ocr>`; 3 READMEs, `docs/components/{faceted-filter,compare,ocr}.html`, `examples/facets-catalog.html`, 6 scripts (green against the full bundle) | OCR ships as an engine contract because the bundle carries no third-party code; the fixture engine keeps docs/tests offline |
3. ~~Integration pass~~ — **done 13 Sep** (see the table above): strict audit, full build, unit tests, framework suite,
   the four-mode sweep of all 215 pages, and `npm run test:evals` (**139/139** scripts, re-run after the locale packs
   and the last fixes landed) are all green against the final `dist/`.

### P1 — quality
* **i18n namespace overlaps**: ~~`auth`~~ (permissions now uses `permissions.*`), ~~`print`~~ (printpreview now uses
  `printPreview.*`) — done. Remaining: `scanner` (camera vs scanner) — the wave-2 codes/capture agents own both folders;
  rename camera's document-scanner strings to `docScanner.*`.
* **CSS classes defined from two folders** (6 audit warnings after tightening the rule to bare selectors):
  `.o-chat-bubble` / `.o-chat-actions` (assistant vs chat) and `.o-scanner-stage/-video/-overlay` (camera vs scanner) are
  real duplicates for the wave-2 comm and codes/capture agents to resolve (one owner each, the other package reuses it);
  `.o-theme-dark` (chart vs sidebar) is accepted — each sets its own custom properties under the theme class, no rule
  overlaps. The duplicate scoped `.o-c-*` block in `kanban/kanban.css` is removed (core ships the utilities, including
  `--o-c-hover`, which the copy lacked).
* **Hard-coded colours** (78 audit warnings): mostly intentional (white text on brand covers, colour-picker hue ramp,
  player black, print black/white). Review `auth.css` and `calendar.css` print rules → tokens.
* ~~Docs gaps for finished packages~~ — **done 12 Sep**: `Orion.twofa`, `Orion.booking`, `Orion.calendar`, `Orion.datatable`,
  `Orion.importer`, `Orion.kanban`, `Orion.tree`, `Orion.markdown`, `Orion.fill/formFields/formUtil`, `Orion.polls`
  (with an explicit note that `Orion.poll` is realtime's live refresh) and `data-o-track-view` now have live demos,
  each covered by `tests/evals/docs-gaps-*.js`. (`Orion.pdf` and `<o-help-panel>` already had complete pages; the earlier
  "no docs" list came from a coverage script that double-prefixed `data-o-` — the behaviours were documented all along.)
* ~~Proposed core change: `reducedMotion()` should honour the runtime `html.o-motion-reduce` flag~~ — done in
  `src/core/60-anim.js` (verified: forcing the class makes `Orion.anim.reducedMotion()` true; `tests/core.html` 17/17).
* Known functional limits to document, not fix now: survey ranking has no pointer drag (buttons/arrow keys only);
  survey progress % is an estimate under skip logic; recaptcha/hcaptcha/turnstile adapters are untested live.

### P2 — release polish
* ~~`README.md`: document `--preset` builds and `dist/orion.lite.js`, add measured sizes and a "go live" templates
  section~~ — done 12 Sep. Size composition for later optimisation work: of `orion.min.css` (787 KB) only ~90 KB (11%)
  is generated utilities; the rest is component CSS, so bundle-size wins come from `--preset`/`--exclude`, not from
  trimming the utility set. Heaviest JS packages: chart 211 KB, datatable 184, diagram 178, calendar 168, gantt 151,
  editor 146, upload 106 (unminified).
* `CHANGELOG.md` for 0.1.0 (write once the capture package lands). `FEATURES.md`: AI rows 263–269a rewritten to the
  surface that shipped (APIs/behaviours, not the unbuilt `<o-ai-*>` elements), OCR row → `components/ocr.html`, two
  stale links fixed (`graph.html`, `stat.html`); every docs path in the file now resolves to a real page (checked 13 Sep).
* ~~Locale packs~~ — **done 13 Sep**: all 10 packs translated to full parity (2,883 keys each), `npm run test:i18n`
  added. Strings that are deliberately identical across locales (routing keys such as `auth.*.switchTo`, code
  identifiers, loanwords) are allow-listed in the parity test with reasons. Untranslatable-as-written strings for
  component owners: `querybuilder.barPlaceholder` mixes query syntax with prose; `ocr.tesseractScriptMissing` interleaves
  code identifiers — both translated around the tokens.
* `git init` + first commit (only when asked).

## How to resume
```bash
node build/build.mjs --no-min --out=.tmp/tpl                # fast unminified build for checking
node build/check.mjs --bundle=.tmp/tpl/orion.js templates/products.html --dark --rtl --mobile
node tests/evals/run.mjs --bundle=.tmp/tpl/orion.js         # every interaction script in tests/evals/manifest.json (npm run test:evals = against dist/)
node build/audit.mjs                                        # collisions, accessor-in-Object.assign, CSS hygiene
node build/gen-types.mjs && node build/build.mjs            # full dist (= npm run build)
node build/serve.mjs                                        # http://127.0.0.1:8080/templates/index.html
```
The contract every package must follow is `ARCHITECTURE.md`; the per-feature map is `FEATURES.md`. When delegating a
package to an agent: one agent per folder, no sub-delegation, it must read the READMEs of anything it reuses, run the
four-mode check plus `--eval` interaction scripts, and its claims must be verified on disk afterwards.
