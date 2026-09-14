# Feature coverage

Every feature from the original requirement list, with the component, class or API that implements it and the
documentation page that demonstrates it. Docs paths are relative to `docs/` (run `npm run serve` and open `/docs/index.html`).

Legend: **Element** = custom element (`<o-…>`), **Class** = CSS classes, **Behavior** = `data-o-…` attribute,
**Action** = `data-o-toggle` / `data-o-action`, **API** = JavaScript (`Orion.…`).

## Core UI

| # | Feature | Implementation | Kind | Docs |
|---|---|---|---|---|
| 1 | Responsive Layout | `.o-app` shell, containers, breakpoints | Class | components/app-shell.html, components/layout-grid.html |
| 2 | Grid System | `.o-row`/`.o-col-*` (12 col) + `.o-grid`/`.o-grid-cols-*` | Class | components/layout-grid.html |
| 3 | Forms | `.o-field`, `.o-input`, `.o-select`, `.o-check`, `.o-switch`, groups, floating labels | Class | components/form-controls.html |
| 4 | Form Validation | `Orion.validate()`, `data-o-validate`, `data-o-rules` | API + Behavior | components/validation.html |
| 5 | Buttons | `.o-btn` (8 colors × solid/outline/soft/ghost/link, 5 sizes, loading, groups, segmented) | Class | components/buttons.html |
| 6 | Modals | `<o-modal>`, `Orion.modal()` | Element + API | components/modal.html |
| 7 | Alerts | `.o-alert` + `data-o-dismiss="alert"` | Class | components/badges-alerts.html |
| 8 | Confirmation Dialogs | `Orion.confirm()`, `data-o-confirm` | API + Behavior | components/dialogs.html |
| 9 | Toast Notifications | `Orion.toast()` + `.success/.error/.warning/.info/.loading/.promise` | API | components/toast.html |
| 10 | Tooltips | `data-o-tooltip`, `Orion.tooltip()` | Behavior + API | components/tooltip-popover.html |
| 11 | Popovers | `<o-popover>`, `data-o-popover`, `Orion.popover()` | Element + API | components/tooltip-popover.html |
| 12 | Dropdowns | `<o-dropdown>`, `data-o-toggle="dropdown"`, `Orion.menu()` | Element + API | components/dropdown.html |
| 13 | Searchable Dropdowns | `<o-select searchable>` | Element | components/select.html |
| 14 | Multi-Select Dropdowns | `<o-select multiple>` | Element | components/select.html |
| 15 | Date Picker | `<o-datepicker>` | Element | components/datepicker.html |
| 16 | Time Picker | `<o-timepicker>` | Element | components/timepicker.html |
| 17 | Date Range Picker | `<o-daterange>` | Element | components/daterange.html |
| 18 | Data Tables | `<o-datatable>` | Element | components/datatable.html |
| 19 | Sorting | `<o-datatable>` multi-column sort | Element | components/datatable.html |
| 20 | Searching | `<o-datatable>` global search + highlight | Element | components/datatable.html |
| 21 | Filtering | column filters, filter row/panel | Element | components/datatable.html |
| 22 | Pagination | `<o-pagination>`, table pagination | Element | components/pagination.html |
| 23 | Server-Side Table Processing | `source(query)` / `url` | Element | components/datatable-server.html |
| 24 | Charts | `<o-chart>` / `Orion.chart()` (line, area, bar, column, stacked, mixed) | Element + API | components/charts.html |
| 25 | Graphs | `<o-graph>` force-directed network graph | Element | components/graph.html |
| 26 | Dashboards | `<o-dashboard>` + templates | Element | components/dashboard.html, templates/ |
| 27 | Icons | `<o-icon>`, `Orion.icon()` — 421 icons | Element + API | components/icons.html |
| 28 | Tabs | `<o-tabs>`, `data-o-toggle="tab"` | Element | components/tabs.html |
| 29 | Accordions | `<o-accordion>` | Element | components/accordion.html |
| 30 | Collapse Panels | `data-o-toggle="collapse"`, `Orion.collapse()` | Action + API | components/accordion.html |
| 31 | Navbar | `.o-navbar` | Class | components/navbar.html |
| 32 | Sidebar | `.o-sidebar`, `<o-sidebar-menu>` | Class + Element | components/sidebar.html |
| 33 | Breadcrumbs | `.o-breadcrumb`, `<o-breadcrumb>` | Class + Element | components/breadcrumb.html |
| 34 | Cards | `.o-card` (+ header/body/footer/accent/hover) | Class | components/cards.html |
| 35 | Badges | `.o-badge` (solid/soft/outline/dot/counter) | Class | components/badges-alerts.html |
| 36 | Progress Bars | `.o-progress`, `.o-progress-ring` | Class | components/feedback.html |
| 37 | Spinners / Loaders | `.o-spinner`, `.o-loader-dots`, `.o-loader-bars`, `Orion.loading()` | Class + API | components/feedback.html |
| 38 | Carousel / Slider | `<o-carousel>` | Element | components/carousel.html |
| 39 | Image Gallery | `<o-gallery>` | Element | components/gallery.html |
| 40 | Drag and Drop | `Orion.sortable()`, `Orion.draggable()`, `Orion.dropzone()`, `data-o-sortable` | API + Behavior | components/drag-drop.html |
| 41 | Sortable Lists | `Orion.sortable()` | API | components/drag-drop.html |
| 42 | File Upload | `<o-upload>` | Element | components/upload.html |
| 43 | Drag-and-Drop File Upload | `<o-upload>` dropzone | Element | components/upload.html |
| 44 | Multiple File Upload | `<o-upload multiple>` | Element | components/upload.html |
| 45 | Autocomplete | `<o-autocomplete>` | Element | components/autocomplete.html |
| 46 | Typeahead Search | `<o-autocomplete inline>` ghost completion | Element | components/autocomplete.html |
| 47 | Tree View | `<o-tree>` | Element | components/tree.html |
| 48 | Context Menu | `Orion.contextMenu()`, `data-o-context-menu` | API + Behavior | components/dropdown.html |
| 49 | Infinite Scroll | `Orion.infiniteScroll()`, `data-o-infinite` | API + Behavior | components/infinite-scroll.html |
| 50 | Lazy Loading | `data-o-lazy`, `Orion.lazy` | Behavior + API | components/lazy-loading.html |
| 51 | Lightbox | `Orion.lightbox()`, `data-o-preview` | API + Behavior | components/gallery.html |
| 52 | Image Preview | `data-o-preview`, `Orion.preview()` | Behavior + API | components/gallery.html, components/document-viewer.html |
| 53 | Rich Text Editor | `<o-editor>` | Element | components/rich-text-editor.html |
| 54 | Code Editor | `<o-code-editor>`, `Orion.highlight()` | Element + API | components/code-editor.html |
| 55 | Notifications | `<o-notification-bell>`, `<o-notifications>`, `Orion.notifications` | Element + API | components/notifications.html |
| 56 | AJAX Requests | `Orion.http`, `data-o-ajax`, `data-o-load` | API + Behavior | components/http.html |
| 57 | DOM Manipulation | `Orion.$` (chainable), `Orion.h()`, `Orion.dom` | API | components/dom.html |
| 58 | Animation | `Orion.animate()`, `.o-animate-*` | API + Class | components/animation.html |
| 59 | Transitions | `Orion.transition()`, `Orion.collapse()` | API | components/animation.html |
| 60 | Mobile-Friendly UI | responsive everywhere, touch gestures, bottom nav, mobile drawer | — | components/app-shell.html |
| 61 | Responsive Tables | `.o-table-stack`, `<o-datatable responsive>` | Class + Element | components/tables.html, components/datatable.html |
| 62 | Theme Support | design tokens + `Orion.theme` | API | components/theming.html |
| 63 | Dark Mode | `data-theme`, `.o-theme-dark`, auto mode | Class + API | components/theming.html |
| 64 | Custom Styling | CSS variables, low specificity, `.o-c-*` color contexts | — | components/theming.html |
| 65 | Utility Classes | spacing/display/flex/text/color/border/position utilities | Class | components/utilities.html |
| 66 | Authentication UI | `<o-auth-form>`, `.o-auth-split` | Element + Class | components/auth.html |
| 67 | Admin Dashboard Components | KPI cards, widgets, activity, charts | Element | components/dashboard.html, components/stat.html |
| 68 | Stepper / Wizard | `<o-stepper>`, `<o-wizard>` | Element | components/stepper.html, components/wizard.html |
| 69 | Timeline | `.o-timeline`, `<o-timeline-view>` | Class + Element | components/timeline.html, components/timeline-view.html |
| 70 | Calendar | `<o-calendar>` | Element | components/calendar.html |
| 71 | Scheduler | `<o-calendar view="resource-*">` | Element | components/scheduler.html |
| 72 | Kanban Board | `<o-kanban>` | Element | components/kanban.html |
| 73 | Rating Component | `<o-rating>` | Element | components/rating.html |
| 74 | Tags Input | `<o-tags>` | Element | components/tags-input.html |
| 75 | Color Picker | `<o-colorpicker>` | Element | components/color-picker.html |
| 76 | Range Slider | `<o-range>` (single + dual) | Element | components/range-slider.html |
| 77 | Clipboard / Copy Button | `Orion.clipboard`, `<o-copy>`, `data-o-action="copy"` | API + Element | components/clipboard-share.html |
| 78 | QR Code Generation | `<o-qrcode>`, `Orion.qr` | Element + API | components/qr-code.html |
| 79 | PDF Viewer | `<o-docviewer type="pdf">` | Element | components/document-viewer.html |
| 80 | Excel/CSV Export | `O.export.xlsx/csv`, `O.xlsx`, `O.csv` | API | components/export-import.html |
| 81 | Print Support | `Orion.print()`, `.o-print-hide`, `data-o-action="print"` | API + Class | components/print-fullscreen.html |
| 82 | Fullscreen Mode | `Orion.fullscreen`, `data-o-action="fullscreen"` | API + Action | components/print-fullscreen.html |

## Advanced

| # | Feature | Implementation | Kind | Docs |
|---|---|---|---|---|
| 83 | Advanced Search | `<o-query-builder>` (+ query language) | Element | components/query-builder.html |
| 84 | Global Search | `<o-global-search>` | Element | components/global-search.html |
| 85 | Faceted Filtering | `<o-facets>`, `<o-facet-chips>`, table facets | Element | components/faceted-filter.html |
| 86 | Column Chooser | `<o-datatable>` toolbar | Element | components/datatable-advanced.html |
| 87 | Column Reordering | drag headers | Element | components/datatable-advanced.html |
| 88 | Column Resizing | drag/double-click autofit | Element | components/datatable-advanced.html |
| 89 | Sticky Header | `.o-table-sticky`, table option | Class | components/tables.html, components/datatable-advanced.html |
| 90 | Frozen Columns | `column.frozen: 'start'｜'end'` | Element | components/datatable-advanced.html |
| 91 | Inline Editing | cell/row editing with validation | Element | components/datatable-editing.html |
| 92 | Bulk Actions | selection toolbar + `bulkActions` | Element | components/datatable-editing.html |
| 93 | Row Selection | checkbox/shift-range/select-all | Element | components/datatable-editing.html |
| 94 | Expandable Rows | `detail` renderer | Element | components/datatable-advanced.html |
| 95 | Master-Detail View | nested table / detail panel | Element | components/datatable-advanced.html |
| 96 | Export to PDF | `O.export.pdf`, `O.PDF` | API | components/pdf.html |
| 97 | Export to Excel | `O.export.xlsx` | API | components/export-import.html |
| 98 | Export to CSV | `O.export.csv` | API | components/export-import.html |
| 99 | Import from Excel | `Orion.importWizard`, `O.xlsx.read` | API | components/export-import.html |
| 100 | Import from CSV | `Orion.importWizard`, `O.csv.parse` | API | components/export-import.html |
| 101 | Print Preview | `Orion.printPreview()` | API | components/print-preview.html |
| 102 | Keyboard Shortcuts | `Orion.shortcuts`, `data-o-shortcut`, help overlay | API | components/shortcuts.html |
| 103 | Command Palette | `Orion.commandPalette`, `Orion.commands` | API | components/command-palette.html |
| 104 | Auto Save | `data-o-autosave`, `Orion.autosave()` | Behavior + API | components/autosave.html |
| 105 | Draft Save | draft restore banner | Behavior | components/autosave.html |
| 106 | Undo / Redo | `Orion.UndoManager`, `Orion.undoable()` | API | components/undo-redo.html |
| 107 | Dynamic Forms | `<o-form>` / `Orion.form(el, schema)` | Element + API | components/dynamic-forms.html |
| 108 | Conditional Fields | `data-o-show-if` / `-hide-if` / `-enable-if` / `-require-if` | Behavior | components/dynamic-forms.html |
| 109 | Repeatable Form Fields | `<o-repeater>` | Element | components/dynamic-forms.html |
| 110 | Form Wizard | `<o-wizard>` | Element | components/wizard.html |
| 111 | OTP Input | `<o-otp>` | Element | components/otp.html |
| 112 | Password Strength Meter | `data-o-strength`, `Orion.password.strength()` | Behavior + API | components/password.html |
| 113 | Show/Hide Password | `data-o-password-toggle` | Behavior | components/password.html |
| 114 | Input Masking | `data-o-mask`, `Orion.mask()` | Behavior + API | components/input-mask.html |
| 115 | Phone Number Input | `<o-phone>` | Element | components/phone-input.html |
| 116 | Currency Input | `<o-number currency>`, `data-o-currency` | Element + Behavior | components/number-currency.html |
| 117 | Number Formatting | `<o-number>`, `Orion.format.number` | Element + API | components/number-currency.html |
| 118 | Character Counter | `data-o-counter` | Behavior | components/input-mask.html |
| 119 | File Size Validation | `<o-upload max-size>`, rule `filesize:` | Element | components/upload.html |
| 120 | File Type Validation | `<o-upload accept>` + magic-number sniffing, rule `filetype:` | Element | components/upload.html |
| 121 | Image Cropping | `<o-cropper>`, `Orion.cropImage()` | Element + API | components/image-editor.html |
| 122 | Image Compression | `Orion.image.compress()` | API | components/image-editor.html |
| 123 | Image Rotation | `Orion.image.rotate()`, cropper rotate | API | components/image-editor.html |
| 124 | Webcam Capture | `<o-camera>`, `Orion.camera.capture()` | Element + API | components/camera.html |
| 125 | Signature Pad | `<o-signature>` | Element | components/signature.html |
| 126 | Audio Recorder | `<o-audio-recorder>` | Element | components/recorder.html |
| 127 | Video Recorder | `<o-video-recorder>` (+ screen recording) | Element | components/recorder.html |
| 128 | Voice Input | `data-o-voice` | Behavior | components/speech.html |
| 129 | Speech-to-Text | `Orion.speech.listen()` | API | components/speech.html |
| 130 | Text-to-Speech | `Orion.speech.speak()`, `<o-tts>` | API + Element | components/speech.html |
| 131 | Location Picker | `<o-location-picker>` | Element | components/location-picker.html |
| 132 | Google Maps Integration | `Orion.maps.google.load()`, `<o-map provider="google">` | API | components/google-maps.html |
| 133 | Map Markers | `<o-map>` markers, clustering, popups | Element | components/maps.html |
| 134 | Geolocation | `Orion.geo.current/watch`, locate control | API | components/maps.html |
| 135 | Address Autocomplete | `<o-address-input>`, `Orion.geocode` | Element + API | components/address-autocomplete.html |
| 136 | Timeline View | `<o-timeline-view>` (zoomable time axis) | Element | components/timeline-view.html |
| 137 | Activity Feed | `<o-activity-feed>`, `.o-feed` | Element + Class | components/presence-activity.html |
| 138 | Comments | `<o-comments>` | Element | components/comments-mentions.html |
| 139 | Mentions | `Orion.mentions()`, `data-o-mentions` | API + Behavior | components/comments-mentions.html |
| 140 | User Avatar | `<o-avatar>`, `.o-avatar-group` | Element + Class | components/lists-avatars.html |
| 141 | Online/Offline Status | `<o-presence>`, `.o-status`, `<o-network-status>` | Element + Class | components/presence-activity.html, components/device-network.html |
| 142 | Real-Time Notifications | `Orion.notifications.connect()` | API | components/notifications.html |
| 143 | Notification Bell | `<o-notification-bell>` | Element | components/notifications.html |
| 144 | Chat UI | `<o-chat>` | Element | components/chat.html |
| 145 | Messaging | `<o-chat>` conversations + composer | Element | components/chat.html |
| 146 | Read/Unread Status | message ticks + unread divider | Element | components/chat.html |
| 147 | Typing Indicator | `setTyping()` | Element | components/chat.html |
| 148 | Presence Indicator | `<o-presence>`, `<o-presence-list>` | Element | components/presence-activity.html |
| 149 | SignalR/WebSocket Support | `Orion.ws()`, `Orion.signalr()`, `Orion.sse()` | API | components/realtime.html |
| 150 | Live Data Refresh | `Orion.poll()`, `Orion.live()` | API | components/realtime.html |
| 151 | Countdown Timer | `<o-countdown>` | Element | components/timers.html |
| 152 | Stopwatch | `<o-stopwatch>` | Element | components/timers.html |
| 153 | Session Timeout Warning | `Orion.sessionTimeout()` | API | components/session-idle.html |
| 154 | Idle User Detection | `Orion.idle()` | API | components/session-idle.html |
| 155 | Full Calendar | `<o-calendar>` (month/week/day/list/year) | Element | components/calendar.html |
| 156 | Appointment Booking | `<o-booking>` | Element | components/booking.html |
| 157 | Event Scheduling | create/edit dialog + drag scheduling | Element | components/calendar.html |
| 158 | Recurring Events | `Orion.rrule`, recurrence editor | API | components/recurring-events.html |
| 159 | Gantt Chart | `<o-gantt>` | Element | components/gantt.html |
| 160 | Task Board | `<o-kanban variant="list">` | Element | components/kanban.html |
| 161 | Drag-and-Drop Scheduling | calendar/gantt drag-move-resize | Element | components/calendar.html, components/gantt.html |
| 162 | Tree Grid | `<o-datatable tree>` | Element | components/datatable-advanced.html |
| 163 | Organization Chart | `<o-orgchart>` | Element | components/orgchart.html |
| 164 | Flowchart | `<o-diagram>` | Element | components/diagram.html |
| 165 | Diagram Builder | `<o-diagram>` with palette + properties | Element | components/diagram.html |
| 166 | Workflow Designer | `<o-workflow>` | Element | components/workflow.html |
| 167 | Dynamic Dashboard | `<o-dashboard editable>` | Element | components/dashboard.html |
| 168 | Dashboard Widgets | `<o-widget>` + catalog | Element | components/dashboard.html |
| 169 | Resizable Widgets | widget resize handles | Element | components/dashboard.html |
| 170 | Draggable Widgets | widget drag + compaction | Element | components/dashboard.html |
| 171 | KPI Cards | `<o-stat>`, `.o-stat` | Element + Class | components/stat.html |
| 172 | Statistics Cards | `<o-stat>` variants, `<o-countup>` | Element | components/stat.html |
| 173 | Sparklines | `<o-sparkline>` | Element | components/charts-gauge-sparkline.html |
| 174 | Gauge Charts | `type: 'gauge'` | Element | components/charts-gauge-sparkline.html |
| 175 | Heatmaps | `type: 'heatmap'` + calendar heatmap | Element | components/charts-heatmap.html |
| 176 | Maps / Geo Charts | `type: 'geo'` (GeoJSON choropleth/bubble) | Element | components/charts-geo.html |
| 177 | Pivot Tables | `<o-pivot>` | Element | components/pivot.html |
| 178 | Data Visualization | chart engine (tooltips, legends, annotations, export) | Element + API | components/charts-api.html |
| 179 | Skeleton Loading | `.o-skeleton` | Class | components/feedback.html |
| 180 | Shimmer Loading | `.o-skeleton` shimmer, `.o-shimmer` | Class | components/feedback.html |
| 181 | Progress Tracking | `<o-progress-tracker>` | Element | components/stepper.html |
| 182 | Multi-Step Progress | `<o-stepper variant="progress">` | Element | components/stepper.html |
| 183 | Empty States | `.o-empty` | Class | components/feedback.html |
| 184 | Error States | `.o-empty.is-error`, `.o-error-page` | Class | components/feedback.html |
| 185 | Offline Mode | `Orion.offline`, `<o-offline-banner>` | API + Element | components/offline.html |
| 186 | PWA Support | `Orion.pwa` | API | components/pwa.html |
| 187 | Browser Notifications | `Orion.notify()` | API | components/pwa.html |
| 188 | Install App Prompt | `<o-install-prompt>`, `Orion.pwa.install()` | Element + API | components/pwa.html |
| 189 | Service Worker Support | the same `orion.js` runs as a service worker | API | components/pwa.html |
| 190 | Local Storage | `Orion.store` | API | components/storage.html |
| 191 | Session Storage | `Orion.session` | API | components/storage.html |
| 192 | IndexedDB | `Orion.idb` | API | components/storage.html |
| 193 | Cache Management | `Orion.cache`, `<o-storage-inspector>` | API + Element | components/storage.html |
| 194 | Clipboard Paste | `Orion.clipboard.onPaste()` | API | components/clipboard-share.html |
| 195 | Chunked Upload | `<o-upload chunk-size>` | Element | components/upload-advanced.html |
| 196 | Resume Upload | `<o-upload resumable>` (+ tus mode) | Element | components/upload-advanced.html |
| 197 | Upload Progress | per-file + overall progress, speed, ETA | Element | components/upload-advanced.html |
| 198 | Download Progress | `Orion.http.download()` | API | components/http.html |
| 199 | Document Preview | `<o-docviewer>` | Element | components/document-viewer.html |
| 200 | PDF Preview | `<o-docviewer type="pdf">` | Element | components/document-viewer.html |
| 201 | Word Document Preview | DOCX → HTML converter | Element | components/document-viewer.html |
| 202 | Video Preview | `data-o-video-preview`, docviewer video | Behavior | components/players.html |
| 203 | Audio Player | `<o-audio>` (waveform) | Element | components/players.html |
| 204 | Video Player | `<o-video>` (captions, PiP, playlist) | Element | components/players.html |
| 205 | Zoom Controls | `<o-zoom>`, lightbox zoom | Element | components/gallery.html |
| 206 | Fullscreen Viewer | lightbox fullscreen, `Orion.fullscreen` | API | components/gallery.html |
| 207 | QR Code Scanner | `<o-scanner>` (pure-JS QR decoder + BarcodeDetector) | Element | components/scanner.html |
| 208 | Barcode Scanner | `<o-scanner formats>` | Element | components/scanner.html |
| 209 | Barcode Generator | `<o-barcode>`, `Orion.barcode` | Element + API | components/barcode.html |
| 210 | CAPTCHA | `<o-captcha type="text｜math｜slider">` | Element | components/captcha.html |
| 211 | reCAPTCHA | `<o-recaptcha>` (+ hCaptcha, Turnstile) | Element | components/captcha.html |
| 212 | Two-Factor Authentication UI | `<o-2fa-setup>`, `<o-2fa-verify>`, `Orion.totp` | Element + API | components/two-factor.html |
| 213 | Role-Based UI | `Orion.hasRole()`, `data-o-role` | API + Behavior | components/permissions.html |
| 214 | Permission-Based Elements | `Orion.can()`, `data-o-permission`, `<o-can>` | API + Behavior | components/permissions.html |
| 215 | Multi-Language Support | `Orion.i18n` + 10 locale packs | API | components/i18n-rtl.html |
| 216 | RTL Support | logical CSS properties throughout, auto `dir` | — | components/i18n-rtl.html |
| 217 | Accessibility Support | ARIA patterns, keyboard, focus management | — | (every component page) |
| 218 | Screen Reader Support | `Orion.announce()`, live regions, table views for charts | API | components/dom.html, components/charts-api.html |
| 219 | High Contrast Mode | `Orion.theme.setContrast()`, `prefers-contrast` | API | components/theming.html |
| 220 | Font Size Controls | `Orion.theme.setFontScale()`, `<o-preferences>` | API + Element | components/theming.html, components/preferences.html |
| 221 | Theme Switcher | `<o-theme-switch>`, `data-o-action="theme"` | Element + Action | components/theme-switcher.html |
| 222 | Custom Theme Builder | `<o-theme-builder>` | Element | components/theme-builder.html |
| 223 | Dark / Light / Auto Theme | `Orion.theme.setMode()` | API | components/theming.html |
| 224 | Responsive Sidebar | mini + off-canvas sidebar | Class + API | components/sidebar.html |
| 225 | Mega Menu | `.o-megamenu` | Class | components/mega-menu.html |
| 226 | Command Menu | `<o-command-menu>` | Element | components/command-palette.html |
| 227 | Floating Action Button | `.o-fab`, `<o-fab>` speed dial | Class + Element | components/fab.html |
| 228 | Bottom Navigation | `.o-bottom-nav` | Class | components/bottom-nav.html |
| 229 | Mobile Drawer | `<o-drawer>`, sidebar off-canvas | Element | components/drawer.html |
| 230 | Split View | `<o-split>`, `<o-split-view>` | Element | components/split-panels.html |
| 231 | Resizable Panels | `<o-split>` | Element | components/split-panels.html |
| 232 | Dockable Panels | `<o-dock>` | Element | components/dock.html |
| 233 | Sticky Actions | `.o-sticky-bar`, `data-o-sticky-actions` | Class + Behavior | components/scroll.html |
| 234 | Back-to-Top Button | `<o-back-to-top>` | Element | components/scroll.html |
| 235 | Scroll Progress Indicator | `<o-scroll-progress>` | Element | components/scroll.html |
| 236 | Scroll Spy | `data-o-spy` | Behavior | components/scroll.html |
| 237 | Virtual Scrolling | `<o-virtual-list>`, table virtual mode | Element | components/virtual-list.html |
| 238 | Infinite Loading | `Orion.infiniteScroll()` | API | components/infinite-scroll.html |
| 239 | Pagination with Page Size | `<o-pagination page-sizes>` | Element | components/pagination.html |
| 240 | Breadcrumb Navigation | `<o-breadcrumb auto>` | Element | components/breadcrumb.html |
| 241 | Recent Items | `Orion.recent`, `<o-recent-list>` | API + Element | components/user-data.html |
| 242 | Favorites / Bookmarks | `Orion.favorites`, `<o-favorite-button>` | API + Element | components/user-data.html |
| 243 | Saved Filters | `Orion.views` + facets/table saved filters | API | components/faceted-filter.html, components/user-data.html |
| 244 | Saved Views | table saved views, `<o-saved-views>` | Element | components/datatable-advanced.html, components/user-data.html |
| 245 | Search History | `Orion.searchHistory` | API | components/global-search.html |
| 246 | Recently Viewed Items | `Orion.viewed`, `data-o-track-view` | API + Behavior | components/user-data.html |
| 247 | Compare Items | `<o-compare-tray>`, `<o-compare-table>` | Element | components/compare.html |
| 248 | Multi-Tab Workspace | `<o-workspace>` | Element | components/workspace.html |
| 249 | Customizable Columns | table column chooser + persistence | Element | components/datatable-advanced.html |
| 250 | Customizable Dashboard | `<o-dashboard persist>` | Element | components/dashboard.html |
| 251 | User Preferences | `Orion.prefs`, `<o-preferences>` | API + Element | components/preferences.html |
| 252 | Onboarding Tour | `Orion.tour()` | API | components/tour.html |
| 253 | Product Tour | `Orion.tour()` + `<o-checklist>` | API + Element | components/tour.html |
| 254 | Guided Walkthrough | tour `advanceOn` steps + hotspots | API | components/tour.html |
| 255 | Help Tooltip | `<o-help>` | Element | components/help.html |
| 256 | Contextual Help | `<o-help-panel>`, `data-o-help` | Element + Behavior | components/help.html |
| 257 | Feedback Widget | `Orion.feedback()` | API | components/feedback-reviews.html |
| 258 | Rating / Review UI | `<o-reviews>` | Element | components/feedback-reviews.html |
| 259 | Survey Forms | `<o-survey>` | Element | components/survey-poll.html |
| 260 | Polls | `<o-poll>` | Element | components/survey-poll.html |
| 261 | FAQ Accordion | `<o-faq searchable>` | Element | components/accordion.html |
| 262 | Chatbot UI | `<o-chatbot>` | Element | components/chatbot.html |
| 263 | AI Assistant Panel | `<o-assistant>` (context actions: summarize page/selection, explain, generate, insert) | Element | components/chatbot.html |
| 264 | AI Search | `Orion.ai.searchProvider()` — a provider for `<o-global-search>` | API | components/ai-tools.html |
| 265 | AI Auto-Complete | `data-o-ai-complete` (ghost text, Tab accepts) | Behavior | components/ai-tools.html |
| 266 | AI Text Suggestions | `data-o-ai-suggest` (tone/rewrite toolbar with diff preview), `Orion.ai.rewrite/translate()` | Behavior + API | components/ai-tools.html |
| 267 | AI Summarization | `Orion.ai.summarize(text \| element)` | API | components/ai-tools.html |
| 268 | AI Form Filling | `Orion.ai.fillForm(form, text)` — proposes values, applied only on confirm | API | components/ai-tools.html |
| 269 | AI Document Analysis | `Orion.ai.analyze(file \| text)` → structured extraction | API | components/ai-tools.html |
| 269a | AI provider client | `Orion.ai` — proxy-first, `dangerouslyAllowBrowser` opt-in for direct vendor calls, streaming, `Orion.ai.mock` for offline docs/tests | API | components/ai.html |
| 270 | OCR UI | `<o-ocr>` + pluggable engine (`Orion.ocr`) | Element + API | components/ocr.html |
| 271 | Document Scanner | `<o-doc-scanner>` (edge detect + perspective) | Element | components/document-scanner.html |
| 272 | Face Capture | `<o-camera mode="face">` | Element | components/camera.html |
| 273 | Camera Integration | `<o-camera>` | Element | components/camera.html |
| 274 | Biometric Login UI | `Orion.webauthn`, `<o-biometric-login>` | API + Element | components/biometric.html |
| 275 | Browser Device Detection | `Orion.device` | API | components/device-network.html |
| 276 | Network Status Indicator | `<o-network-status>`, `Orion.network` | Element + API | components/device-network.html |
| 277 | Print-Friendly Layout | print stylesheet + `.o-print-*` | Class | components/print-fullscreen.html |
| 278 | Responsive Email Preview | `<o-email-preview>` | Element | components/email-preview.html |
| 279 | Share Button | `<o-share>`, `Orion.share()` | Element + API | components/clipboard-share.html |
| 280 | Social Sharing | `<o-share networks>` | Element | components/clipboard-share.html |
| 281 | Copy Link | `<o-copy>`, share panel | Element | components/clipboard-share.html |
| 282 | Deep Linking | `Orion.deeplink` | API | components/url-state.html |
| 283 | URL State Management | `Orion.url` (get/set/bind) | API | components/url-state.html |
| 284 | Multi-Tenant Theme Support | `Orion.theme.register()/use()` | API | components/theming.html |
| 285 | White-Label UI Support | `Orion.theme.brand()`, `data-o-brand` | API + Behavior | components/theming.html |

## Notes

- Features 124–130 and 270–274 depend on browser capabilities (camera, microphone, Web Speech, Shape Detection).
  Each component detects support and degrades gracefully with a clear message.
- AI features (262–269) are provider-agnostic: you supply a function or point an adapter at your own backend
  proxy. The library never ships or requires an API key, and the documentation demos use a built-in mock provider.
- Google Maps (132) and reCAPTCHA/hCaptcha/Turnstile (211) load the vendor's official script only when you
  pass a key. Everything else is self-contained.
- OCR (270) needs an engine: it uses the browser's Shape Detection API when available, or any function/AI
  provider you configure.
