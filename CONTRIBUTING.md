# Contributing to Orion Admin

Thanks for helping! Orion Admin is a zero-dependency, single-file admin UI library. Please read
[ARCHITECTURE.md](ARCHITECTURE.md) first: it is the contract every component follows.

## Development setup

```bash
git clone <your fork>
cd orion-admin
npm install            # only installs esbuild (optional, used for minification)
npm run build          # -> dist/
npm run watch          # rebuild on change
npm run serve          # http://127.0.0.1:8080/docs/index.html
npm test               # loads every docs/templates page in headless Chrome and fails on console errors
npm run test:evals     # scripted user flows (tests/evals/manifest.json) — add one for every page you build
npm run test:unit      # Node-side unit tests (tests/*.test.mjs|cjs): build-tool scanners, date/DST logic against dist/
npm run test:i18n      # locale packs vs the English strings in src/: keys, {placeholders}, plural forms (tests/i18n-parity.test.mjs)
npm run audit          # collisions between packages, accessors in Object.assign(), hard-coded colours, physical CSS
```

Requirements: Node 18+ and Chrome or Edge (for `npm test`; set `CHROME_PATH` if it is not auto-detected).

## Project layout

| Path | Contents |
|---|---|
| `src/core/` | Shared core (component base classes, DOM, i18n, dates, positioning, overlays, theme, icons). |
| `src/css/` | Foundation CSS (tokens, reboot, typography, layout, buttons, forms, content, feedback, print). |
| `src/components/<name>/` | One folder per component: `*.js`, `*.css`, `README.md` (API). |
| `src/i18n/` | Locale packs. |
| `src/sw/` | Service-worker mode (the bundle doubles as a PWA service worker). |
| `build/` | Zero-dependency bundler, CSS utility generator, docs nav generator, static server, headless checker. |
| `docs/` | Documentation site (plain HTML). Every component has live demos. |
| `templates/` | Ready-to-use admin page templates. |
| `types/` | TypeScript declarations. |
| `tests/` | In-browser test pages (`tests/core.html`). |

## Adding a component

1. Create `src/components/<name>/<name>.js` + `.css` following ARCHITECTURE.md (props, events `o-*`, a11y, RTL, dark mode, i18n).
2. Add a docs page `docs/components/<name>.html` (copy `docs/components/buttons.html`) with live demos and an API table.
   Demo templates are inserted child by child, so a `<script>` in a demo runs after the elements *above* it have
   upgraded and run `setup()` (parsed-page order) — but not before the ones below it. Prefer setting properties
   (`el.rows = …`) over calling methods synchronously on a freshly inserted element.
   `<pre class="docs-code-block">` is *static* code: the shell re-renders it on load (highlighting, Copy button) and the
   original element — including its `id` — is replaced. For live output written from a demo script use
   `<pre class="docs-log" id="…">` instead.
3. Document the API in `src/components/<name>/README.md`. Types: element interfaces are generated from `static props`
   by `npm run types` (`types/components/zz-elements.d.ts`); hand-written service typings go in
   `types/components/<name>.d.ts`, and `dist/orion.d.ts` is assembled from all of them at build time.
4. Reuse, don't guess: before using another package's element, class or API, confirm it exists —
   `grep -rho "define('o-[a-z0-9-]*'" src/components | sort -u`, `grep -o "\.o-[a-z0-9-]*" .tmp/<name>/orion.css | sort -u`,
   and that package's `README.md` for props and events.
5. Test:
   ```bash
   node build/build.mjs --only=<name> --out=.tmp/<name> --no-min
   node build/check.mjs docs/components/<name>.html --bundle=.tmp/<name>/orion.js --shots=.tmp/<name>/shots
   node build/check.mjs docs/components/<name>.html --bundle=.tmp/<name>/orion.js --dark --rtl --mobile
   node build/check.mjs docs/components/<name>.html --bundle=.tmp/<name>/orion.js --eval=@.tmp/evals/<name>.js
   node build/audit.mjs      # name collisions, accessors in Object.assign(), hard-coded colours, physical CSS properties
   ```
   Open the screenshots and check light, dark, RTL and mobile. The `--eval` script is an async IIFE that drives the
   real user flows (open, type, keyboard, validate) and returns an object with an `ok` boolean (`ok: false` fails the
   run); floating panels are portaled to `<body>`, so query them from `document`. Keep the script in `tests/evals/`
   and list it in `tests/evals/manifest.json` so `npm run test:evals` runs it with the others.

## Translations

Copy `src/i18n/ms.js` to `src/i18n/<locale>.js`, translate the values (keep the keys) and open a pull request.
Component strings are registered in English inside each component (`i18n.add('en', { <component>: {...} })`).

## Code style

2-space indentation, single quotes and semicolons. No dependencies. Use design tokens rather than hard-coded colors, and
logical CSS properties for RTL. Keep code readable over clever. Every public API must be documented.

## Commit messages

Use conventional prefixes: `feat(select): …`, `fix(datatable): …`, `docs: …`, `chore(build): …`.
