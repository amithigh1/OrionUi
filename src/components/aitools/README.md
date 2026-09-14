# aitools — "AI everywhere" helpers

Attribute- and function-driven AI helpers for plain markup: ghost-text autocomplete, an "improve with AI"
rewrite/tone toolbar, one-line summarize/rewrite/translate, form filling from free text, document analysis, and
an AI-answer provider for `<o-global-search>`. Every helper calls the `ai` package's `Orion.ai.*` — this package
adds no new transport, no new provider concept, and (`@deps ai`) cannot load without it. No custom elements, no
CSS-only classes to theme beyond what's listed below.

Docs: `docs/components/ai-tools.html`. Realistic example: `docs/examples/ai-helpdesk.html`.

## Files

| File | Contents |
|---|---|
| `00-shared.js` | i18n strings, text truncation, word-diff (`renderDiff`), field value/caret/selection helpers, `syncOverlayToField` (mirrors a field's box/font metrics onto an overlay) |
| `10-complete.js` | `data-o-ai-complete` — ghost-text inline autocomplete |
| `20-suggest.js` | `data-o-ai-suggest` — floating "improve with AI" trigger, tone menu, diff preview |
| `30-textops.js` | `Orion.ai.summarize` / `.rewrite` / `.translate` |
| `40-fillform.js` | `Orion.ai.fillForm` + its confirmation panel |
| `50-analyze.js` | `Orion.ai.analyze` (text and plain-text File/Blob input) |
| `60-search.js` | `Orion.ai.searchProvider` — an `<o-global-search>` provider adapter |
| `70-api.js` | Assembles the additions onto the shared `Orion.ai` namespace |
| `aitools.css` | Ghost-text overlay, suggest trigger/panel, fill-form confirmation panel |

## `data-o-ai-complete[="hint"]`

```html
<textarea data-o-ai-complete="a reply to a customer support ticket"
          data-o-ai-complete-min-chars="8"    <!-- default 8: minimum typed characters before asking -->
          data-o-ai-complete-delay="450"      <!-- default 450ms debounce after typing stops -->
          data-o-ai-complete-max="160"></textarea>  <!-- default 160: max suggestion length in characters -->
```

Works on `<input>` (text-like types only), `<textarea>` and `[contenteditable]`. A suggestion is only requested
once the caret is at the very end of the field's text; it renders as muted text after the caret via a
positioned, `aria-hidden` overlay (kept in sync on scroll/resize), and is announced to assistive tech through a
visually-hidden `aria-describedby` hint (the ghost text itself is not read). **Tab** (or **→**/**End** at the end
of the field) accepts it into the field and dispatches a native `input` event; **Esc** or further typing
dismisses it; blurring the field dismisses it. Requests use `retries: 0` (fail fast — never blocks typing) and
the latest keystroke always aborts the previous in-flight request.

## `data-o-ai-suggest`

```html
<textarea data-o-ai-suggest></textarea>
```

A small trigger button appears at the field's top-end corner while it has focus and non-empty text. Clicking it
opens a floating menu (Improve / Fix grammar / Shorten / Expand / Make formal / Make friendly / Translate to… /
Custom instruction…); picking one calls `Orion.ai.tasks.rewrite`/`.translate` and shows a word-diff preview
(`<del>`/`<ins>`, sanitized) of the result with **Accept**, **Retry** and **Discard**. Operates on the field's
*whole* value, never a partial selection — for selection-aware rewriting inside a page, use `<o-assistant>`'s
"Replace selection" (`assistant` package) instead. Built on the core floating-panel primitives (`portal`,
`autoPlace`, `overlays.open`), so Escape and click-outside close it for free.

## `Orion.ai.summarize(input, opts)` / `.rewrite(input, opts)` / `.translate(input, opts)`

```ts
function summarize(input: string | Element, opts?: { length?: 'short'|'medium'|'long', format?: 'paragraph'|'bullets', ...CallOpts }): Promise<string>;
function rewrite(input: string | Element, opts?: { instruction?: string, ...CallOpts }): Promise<string>;
function translate(input: string | Element, opts?: { to?: string, ...CallOpts }): Promise<string>;
```

`input` is a plain string (including a window selection's text — `getSelection().toString()`), or any element
(`.value` for form controls, else `.textContent`). Thin wrappers around `Orion.ai.tasks.*` + `Orion.ai.chat`/
`.stream` (pass `onToken` in `opts` to stream instead of awaiting the whole reply); `CallOpts` (`signal`,
`provider`, `retries`, …) pass straight through.

## `Orion.ai.fillForm(form, text, opts)`

```ts
function fillForm(form: Element | string, text: string | Element, opts?: {
  fields?: string[];         // limit to these field names (default: every named field Orion.formFields() finds)
  provider?; signal?;
  container?: Element | string;  // where to mount the confirmation panel (default: right after the form)
}): Promise<{ proposed: Record<string, any>, applied: boolean, values: Record<string, any> }>;
```

Reads the form's named fields via `Orion.formFields()` (`validation` package — a runtime dependency checked at
call time, like `ai` is for the rest of this package, but not declared as a hard `@deps` since `fillForm()` is
one function among several here and the others don't need it), builds a
field list (name, guessed label from `<label>`/`aria-label`/placeholder, a light type hint for email/tel/
number/date/url), and asks the AI to extract matching values with `Orion.ai.tasks.extract`. Renders a panel —
one row per proposed field, a checkbox (checked by default), the old value struck through next to the new one —
with **Apply**/**Cancel**. **The form is only written to (via `Orion.fill`) when Apply is clicked**; the returned
promise resolves once the user acts either way. Skips password/file/hidden/submit/reset/button/image inputs and
de-dupes radio/checkbox groups to their first control (one value per field name — multi-value checkbox groups
are not extracted as arrays).

## `Orion.ai.analyze(input, opts)`

```ts
function analyze(input: string | Element | File | Blob, opts?: { fields?: Field[], provider?, signal? }): Promise<{
  summary: string; keyPoints: string[]; entities: { name: string, type: string }[]; fields: Record<string, any>; raw: string;
}>;
```

`fields`/`raw` are `{}`/`''` when nothing was requested/parsed. A `File`/`Blob` is read as text only for
plain-text types (`.txt/.md/.csv/.json/.log/.xml/.yml/.html` or a `text/*`/`application/json|xml|csv` MIME
type); a `.pdf` rejects with a message pointing at a dedicated parser (a zero-dependency build cannot include
one), anything else unrecognized rejects as unsupported, and anything over 5MB rejects as too large — all three
reject with `Error` (check `err.code`: `'pdf-unsupported' | 'unsupported' | 'too-big'`), they do not resolve
with an empty result. If the model's reply isn't valid JSON (or is JSON wrapped in a code fence), the parser
tries to recover it; on total failure every field falls back to its empty default and `raw` still has the
model's original text for debugging.

## `Orion.ai.searchProvider(opts)`

```ts
function searchProvider(opts?: {
  id?: string; title?: string | (() => string); icon?: string; minChars?: number;   // defaults: 'ai', "AI answer", 'sparkles', 4
  system?: string; provider?; onSelect?(answer: string, query: string): void;
  sources?: (query: string, answer: string) => { title, subtitle?, url?, icon?, onSelect? }[];
}): Provider;   // <o-global-search> provider — see globalsearch/README.md for the Provider/Result contract
```

Answers the typed query directly with `Orion.ai.chat` once it reaches `minChars`; `sources`, if given, appends
up to 3 extra result rows (e.g. linking to the documents the answer came from).

## Keyboard

| Key | Where | Action |
|---|---|---|
| Tab | Ghost text visible | Accept the suggestion. |
| → / End (at end of field) | Ghost text visible | Accept the suggestion. |
| Esc | Ghost text visible | Dismiss the suggestion. |
| Esc | Suggest panel open | Close the panel (via `overlays`). |

## Accessibility

Ghost text is `aria-hidden`; a paired visually-hidden hint (`aria-describedby`) tells assistive tech a
suggestion is available and how to accept/dismiss it. The suggest trigger is a labeled button
(`aria-haspopup`/`aria-expanded`); its panel is a labeled `role="dialog"` and receives initial focus on open.
The fill-form panel's proposed values render as native `<label class="o-check">` checkboxes.

## Limitations

- No custom elements: `<o-ai-search>`/`<o-ai-summary>`/`<o-ai-fill>`/`<o-ai-document>` mentioned in `FEATURES.md`
  are **not** built as separate elements — the functionality is the API/behaviors above plus the
  `<o-global-search>` provider adapter, per this package's brief. See "Proposed changes outside my scope" in the
  finishing agent's report for the suggested `FEATURES.md` wording fix.
- Ghost text and "improve with AI" both operate on plain text fields; rich text / contenteditable formatting is
  not preserved by an accepted suggestion or an applied rewrite (they read/write plain text).
