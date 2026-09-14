# wizard

`<o-wizard>`: a multi-step form built from plain `<section data-step="…">` children — per-step validation
(via the `validation` package), a stepper header (via `stepper`), optional steps, a review step, and draft
persistence (via `autosave`, optional). Docs: `docs/components/wizard.html`.

## Files

| File | Contents |
|---|---|
| `wizard.js` | `<o-wizard>` |
| `wizard.css` | Header/footer layout, vertical two-column layout at ≥768px, review-step cards |

## Usage

```html
<form data-o-validate>
  <o-wizard persist="job-application">
    <section data-step="Account" data-icon="user" data-description="Login details">…</section>
    <section data-step="Experience" data-optional>…</section>
    <section data-step="Review" data-review></section>   <!-- auto-filled summary -->
  </o-wizard>
</form>
```

```ts
class OWizard extends OElement {
  current: number;                                     // 0-based, reflects the active step
  linear: boolean;                                      // default true: can't skip ahead of the furthest reached step
  validate: boolean;                                     // default true: runs Orion.validate per step
  persist?: string;                                      // storage key -> wires an internal Orion.autosave
  restore: 'auto' | 'prompt';                             // default 'auto'
  orientation: 'horizontal' | 'vertical'; stepperVariant: 'default'|'dots'|'progress'|'compact';
  nextText?: string; backText?: string; finishText?: string; skipText?: string;
  guard?(from: number, to: number, wizard: OWizard): boolean | Promise<boolean>;   // veto a navigation
  texts?: Record<string, string>;

  readonly steps: { index, title, icon?, description?, optional, review, el: Element }[];
  next(): Promise<boolean>; prev(): Promise<boolean>; skip(): Promise<boolean>;
  goTo(i: number, opts?: { force?: boolean }): Promise<boolean>;
  finish(): Promise<boolean>; reset(): void;
  review(): { index, title, fields: { name, label, value }[] }[];
}
```

Section attributes: `data-step="Title"` (required), `data-icon`, `data-description`, `data-optional`,
`data-review` (this section is auto-populated with `review()`'s output instead of holding real fields).

Events: `o-step-change { from, to, direction, waitUntil(promise) }` (cancelable; call `waitUntil` with a
promise that resolves `false` to block the transition — e.g. an async save), `o-step { index, from }`,
`o-finish { data }` (cancelable), `o-reset {}`. Inside a `<form>`, `finish()` calls `form.requestSubmit()`
so `Orion.validate`'s `onSubmit` (or native submit) takes over instead of the wizard emitting its own data.

Keyboard: `Enter` in a text field advances to the next step (or finishes on the last step); the stepper
header is arrow-key navigable when `clickable`.
