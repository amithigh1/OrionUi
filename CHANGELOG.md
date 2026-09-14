# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/) and the project uses [Semantic Versioning](https://semver.org/).

## [0.1.0] — 2026-09-13

First public release. One file (`dist/orion.min.js`, CSS and icons embedded), zero runtime dependencies, usable from
plain HTML, React, Vue, Angular and Svelte.

### Added

**Core** — custom-element base classes (`OElement`, form-associated `FormElement`), attribute behaviors (`data-o-*`),
delegated actions, i18n with plurals and 10 locale packs, locale-aware formatting, date utilities, floating positioning,
overlay stack, animations, accessibility helpers, theming (light/dark/auto, high contrast, font scale, runtime tokens,
multi-tenant, white-label), 421 icons, chainable `Orion.$`.

**Foundation CSS** — design tokens, reboot, typography, 12-column and CSS grids, buttons, form controls, cards, badges,
chips, alerts, lists, avatars, tables, breadcrumbs, pagination, nav, empty/error states, stats, timeline, progress,
spinners, skeleton loading, print styles, responsive utility classes.

**Components (132 packages)** — layout & navigation (app shell, sidebar, navbar, mega menu, bottom nav, tabs, workspace,
accordion, split/dock panels, scroll spy, FAB); overlays & feedback (modal, drawer, dialogs, toast, tooltip, popover,
dropdown, context menu, progress, loaders); forms (validation, JSON/dynamic forms, conditional and repeatable fields,
stepper, wizard, autosave, masks, phone, number/currency, OTP, tags, range, rating, colour picker, password strength,
CAPTCHA + vendor adapters, survey, poll, reviews, feedback); pickers (select, autocomplete, date, time, date range);
data (datatable with server mode, facets, saved views, inline edit, tree grid, virtual scroll; pivot; CSV/Excel/PDF/ZIP
export & import; print and print preview; compare tray/table; faceted filter); charts, sparklines, stat tiles, KPI
countups, drag-and-drop dashboards; scheduling (calendar, recurrence, resource scheduler, booking, Gantt, timeline
view, countdown, stopwatch); boards & diagrams (drag & drop, sortable, kanban, tree, diagram/flowchart, workflow designer,
org chart, network graph); media (carousel, gallery, lightbox, zoom, lazy loading, crop/rotate/compress, audio/video
players, document viewer, chunked and resumable uploads); editors & communication (rich text, code editor, mentions,
emoji, email preview, chat, notifications + bell, presence, activity feed); devices (camera, document scanner, signature
pad, audio/video/screen recorder, speech-to-text, text-to-speech, QR and barcode generation and scanning, OCR with a
pluggable engine); AI (provider-agnostic client with mock provider, chatbot, assistant panel, ghost-text autocomplete,
text suggestions, summarize/rewrite/translate, form filling, document analysis, AI search provider); services (HTTP client
with mock server, WebSocket/SignalR/SSE, live refresh, storage/IndexedDB/cache, PWA/service worker/offline, shortcuts,
command palette, global search, undo/redo, URL state, permissions, clipboard, share, fullscreen, idle/session timeout,
device/network status, preferences, theme builder, tours, help); maps (slippy map, markers, clustering, vectors,
geolocation, address autocomplete, location picker, Google Maps adapter).

**Languages** — English plus 10 locale packs (ar, de, es, fr, hi, id, ja, ms, pt, zh) covering every UI string, kept in
parity by `npm run test:i18n`; all embedded in `orion.min.js`, English-only in `orion.lite.min.js`, and each pack also
standalone as `dist/locales/<xx>.min.js` (`--locales=` for custom builds).

**Documentation & templates** — 200+ live docs pages and examples (`docs/`), 18 admin page templates on one shared shell
(`templates/`), framework examples (`examples/`).

**Tooling** — zero-dependency bundler with presets and custom builds (`build/build.mjs`), headless-Chrome page checker
with light/dark/RTL/mobile modes and scripted interactions (`build/check.mjs`), cross-package audit (`build/audit.mjs`),
generated TypeScript declarations (`build/gen-types.mjs`), interaction-test runner (`tests/evals/`), React 18/19, Vue 3
and Angular 21 integration suite (`tests/frameworks/`).

### Security

- The bundle contains no third-party code and never ships API keys. AI and OCR adapters call the developer's own
  endpoint by default; direct browser calls to a vendor API require an explicit `dangerouslyAllowBrowser: true` and log
  a warning. All untrusted HTML passes through `sanitize()`; the email preview blocks remote images until allowed.
