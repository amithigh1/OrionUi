<div align="center">

# Orion Admin

**One file. Every admin component you need.**

[![Live Documentation](https://img.shields.io/badge/Live%20Demo-GitHub%20Pages-22c55e?style=for-the-badge&logo=github)](https://amithigh1.github.io/OrionUi/)
[![npm package](https://img.shields.io/npm/v/@amithigh1/orion-admin?style=for-the-badge&logo=npm)](https://www.npmjs.com/package/@amithigh1/orion-admin)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](LICENSE)

A zero-dependency, open-source admin UI library that ships as a **single JavaScript file**:
layout, forms, pickers, data tables, charts, calendars, kanban, editors, uploads, maps, AI panels and more.
Use it from plain HTML, React, Vue, Angular or Svelte, loaded from a CDN, npm or a downloaded file.

`MIT` · `0 dependencies` · `300+ features` · `Light/Dark/Auto` · `RTL` · `i18n` · `WAI-ARIA`

[**Explore Live Documentation &rarr;**](https://amithigh1.github.io/OrionUi/)

</div>

---

## Why Orion Admin?

- **Truly single-file.** `orion.min.js` contains the JavaScript, the CSS (injected automatically) and the icon set. No Bootstrap, no jQuery, no fonts, no extra requests.
- **Framework-agnostic.** Widgets are native Custom Elements (`<o-select>`, `<o-datatable>`, `<o-chart>`…) and behaviors are plain `data-o-*` attributes, so the same file works everywhere. Integration has been tested with React 18/19, Vue 3 (`v-model`) and Angular 21 (`ngModel`).
- **Complete.** Everything a back-office needs, from grids and buttons to server-side tables, Gantt charts, workflow designers, chat, PWA support and passkeys.
- **Accessible and global.** Keyboard support and ARIA everywhere, screen-reader announcements, reduced motion, high-contrast mode, font scaling, 10 languages built in, locale-aware formatting and full right-to-left layouts.
- **Themeable.** Design tokens (CSS variables), light/dark/auto, runtime brand colors, multi-tenant themes, white-labelling and a visual theme builder.
- **Yours.** MIT license, readable source and no build step required.

## Quick start

### CDN (Global jsDelivr Delivery)

Drop in the single script tag directly — zero setup required:

```html
<!-- Always latest -->
<script src="https://cdn.jsdelivr.net/gh/amithigh1/OrionUi@main/dist/orion.min.js"></script>

<!-- Or pinned to release (v0.1.0) -->
<script src="https://cdn.jsdelivr.net/gh/amithigh1/OrionUi@v0.1.0/dist/orion.min.js"></script>

<button class="o-btn o-btn-primary" onclick="Orion.toast.success('It works!')">Click me</button>
<o-datepicker name="start"></o-datepicker>
```

### npm

```bash
npm install @amithigh1/orion-admin
```

```js
import Orion from '@amithigh1/orion-admin';        // registers all components and injects the CSS
// import Orion from '@amithigh1/orion-admin/lite'; // the 48 most used components
Orion.theme.setMode('dark');
```

### Download

Copy `dist/orion.min.js` into your project. That's the whole library.

## Go live with the admin templates

[`templates/`](templates/index.html) is a complete admin application built only with the library — 18 pages on one
shared shell (sidebar with menu search, header with breadcrumbs, command palette, notifications and theme switch):

dashboard · users (CRUD) · orders · products · reports · calendar · project board · messages · files · profile ·
settings · invoice · sign in · sign up · forgot password · lock screen · 404 · 500

Every page is checked in headless Chrome in light, dark, right-to-left and phone layouts with zero console errors.

1. Copy the `templates/` folder next to `dist/orion.min.js` (or point each page's `<script src>` at the CDN).
2. `templates/assets/shell.js` is the app shell: the `NAV` array is your menu, and each page declares its own
   `window.PAGE = { title, breadcrumbs, actions }`.
3. Each page ends with a clearly marked demo-data block — replace it with your API calls (`Orion.http.get(...)`, or
   `table.source = '/api/orders'` for a server-side table).
4. `npm run serve` and open `http://127.0.0.1:8080/templates/index.html` to browse the gallery.

## Frameworks

```jsx
// React
import React from 'react';
import Orion from 'orion-admin';
const { Select, Datatable } = Orion.react(React);
<Select options={roles} value={role} onChange={e => setRole(e.detail.value)} />
```

```js
// Vue 3 — also set compilerOptions.isCustomElement = t => t.startsWith('o-')
app.use(Orion.vue);
// <o-select v-model="role" :options="roles" />
```

```ts
// Angular — schemas: [CUSTOM_ELEMENTS_SCHEMA]
// <o-select ngDefaultControl [(ngModel)]="role" [options]="roles"></o-select>
```

See [docs/frameworks.html](docs/frameworks.html) for details.

## What's inside

| Area | Highlights |
|---|---|
| **Foundation** | Design tokens, 12-column + CSS grid, utilities, typography, buttons, cards, badges, alerts, avatars, icons (250+), animation, theming, i18n & RTL |
| **Layout & navigation** | App shell, responsive sidebar (mini/off-canvas), navbar, mega menu, bottom navigation, breadcrumbs, tabs, multi-tab workspace, accordions, split/resizable/dockable panels, scroll spy, FAB |
| **Overlays & feedback** | Modals, drawers, alert/confirm/prompt dialogs, toasts, tooltips, popovers, dropdowns, context menus, progress, spinners, skeletons, empty/error states |
| **Forms** | Validation engine, dynamic (JSON) forms, conditional & repeatable fields, wizard, autosave/drafts, masks, phone, currency, OTP, tags, range, rating, color picker, password strength, CAPTCHA/reCAPTCHA, surveys, polls |
| **Pickers** | Searchable / multi / remote select, autocomplete, date, time and date-range pickers |
| **Data** | Data table (server-side, sort, filter, facets, column chooser/reorder/resize, frozen columns, inline edit, bulk actions, master-detail, tree grid, virtual scroll, saved views), pivot tables, CSV/Excel/PDF export & import, print preview |
| **Charts & dashboards** | Line, area, bar, pie, radar, scatter, heatmap, treemap, funnel, gauge, geo, sparklines, KPI cards, drag-and-drop dashboards |
| **Scheduling** | Full calendar, recurring events, resource scheduler, appointment booking, Gantt, timeline view, countdown, stopwatch |
| **Boards & diagrams** | Drag & drop, sortable lists, kanban/task board, tree view, flowchart/diagram builder, workflow designer, org chart, network graph |
| **Media & uploads** | Carousel, gallery, lightbox, zoom, lazy loading, crop/rotate/compress, video & audio players, PDF/Word/document preview, chunked & resumable uploads |
| **Editors & communication** | Rich text & code editors, mentions, comments, email preview, chat, notifications, presence, activity feed |
| **Devices & AI** | Webcam/face/document capture, OCR UI, signature pad, audio/video/screen recorder, speech-to-text, text-to-speech, QR & barcode generation and scanning, AI chatbot, assistant panel, AI search, autocomplete, summarization and form filling |
| **Services** | HTTP client, WebSocket/SignalR/SSE, live refresh, storage/IndexedDB/cache, PWA/service worker/offline mode, shortcuts, command palette, undo/redo, URL state, permissions, clipboard, share, print, fullscreen, idle and session timeout |
| **Maps** | Slippy map, markers, clustering, GeoJSON, location picker, address autocomplete, geolocation, Google Maps adapter |

Browse everything with live demos in the documentation site (`npm run serve`, then open `/docs/index.html`).

## Configuration

```html
<script src="orion.min.js" data-theme="auto" data-locale="ms" data-currency="MYR"></script>
<script>
  Orion.init({ tokens: { primary: '#0ea5e9' }, themes: { acme: { primary: '#e11d48', brand: { name: 'ACME' } } }, tenant: 'acme' });
</script>
```

## Smaller builds

`dist/` ships two ready-made bundles (sizes measured on the current build; CSS and icons are inside the JS):

| File | Contents | Minified | Gzipped |
|---|---|---|---|
| `orion.min.js` | everything, including all 10 language packs | 4.7 MB | 1.4 MB |
| `orion.lite.min.js` | the 48 most used components — layout, forms and pickers, tables, dialogs, toasts, charts, icons; English UI | 1.4 MB | 388 KB |
| `locales/<xx>.min.js` | one language pack (ar, de, es, fr, hi, id, ja, ms, pt, zh) to load after `lite` or a custom build | ~85 KB | ~28 KB |

The full bundle is big because it really does contain everything (maps, diagrams, editors, PDF/Excel, media,
AI panels, every translation…). For a typical back-office, start from `lite` or a preset and add what you use.

### Languages

Every UI string exists in English plus 10 locale packs kept in exact parity (`npm run test:i18n`). The full bundle
embeds all of them; `lite` and custom builds embed what you ask for:

```html
<script src="orion.lite.min.js"></script>
<script src="locales/ms.min.js"></script>          <!-- adds Bahasa Melayu -->
<script>Orion.init({ locale: 'ms' })</script>
```

```bash
node build/build.mjs --preset=lite --locales=ms,ar --out=my-build   # or --locales=none / --locales=all
```

Need a different cut? Build your own single file — presets or an explicit list:

```bash
npm install                                                     # esbuild, only for minification
node build/build.mjs --preset=forms --out=my-build              # presets: full, lite, forms, data (see build/presets.json)
node build/build.mjs --only=select,datepicker,datatable,modal,toast --out=my-build
node build/build.mjs --exclude=map,diagram,ai --out=my-build    # everything except…
node build/build.mjs --sizes                                    # per-component size report
```

`--only`/`--exclude` resolve `// @deps` between components automatically; `basics` and `icons` are always worth
including (`<o-avatar>`, `<o-icon>`, `Orion.loading`). The heaviest packages, if you are trimming, are `chart`,
`datatable`, `diagram`, `calendar`, `gantt`, `editor`, `upload`, `codeeditor`, `kanban` and `map`.

## Development

```bash
npm install          # optional esbuild for minification
npm run build        # dist/orion.js, orion.min.js, orion.esm.js, orion.css, orion.d.ts
npm run serve        # docs at http://127.0.0.1:8080/docs/index.html
npm test             # headless Chrome check of every docs & template page
npm run test:evals   # scripted user flows on the templates and examples (tests/evals/)
npm run test:unit    # Node-side unit tests (build tools, dates)
npm run test:i18n    # every locale pack has every key, placeholder and plural form
npm run audit        # naming collisions and CSS/JS hygiene across component packages
```

Read [ARCHITECTURE.md](ARCHITECTURE.md) (component contract) and [CONTRIBUTING.md](CONTRIBUTING.md).

## Browser support

Chrome/Edge 111+, Firefox 113+, Safari 16.4+ (iOS 16.4+). SSR-safe to import.

## License

[MIT](LICENSE)
