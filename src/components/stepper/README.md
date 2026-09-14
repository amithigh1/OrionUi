# stepper

`<o-stepper>`: a standalone step indicator (horizontal/vertical, 4 visual variants, clickable navigation,
responsive collapse) and `<o-progress-tracker>` for order/shipment-style progress. `<o-wizard>` renders an
`<o-stepper>` internally as its header. Docs: `docs/components/stepper.html`.

## Files

| File | Contents |
|---|---|
| `stepper.js` | `<o-stepper>`, `<o-progress-tracker>` |
| `stepper.css` | `.o-steps` static markup CSS (horizontal/vertical/dots/progress/compact), tracker CSS |

## `<o-stepper>`

```ts
interface StepDef { title: string; description?: string; icon?: string; optional?: boolean; status?: 'complete'|'current'|'upcoming'|'error'|'disabled'; }
class OStepper extends OElement {
  steps: (StepDef | string)[];
  current: number;                                    // 0-based
  orientation: 'horizontal' | 'vertical';
  variant: 'default' | 'dots' | 'progress' | 'compact';
  clickable: boolean;
  responsive: boolean;                                 // default true: collapses to "Step N of M" when too narrow
  label?: string; texts?: Record<string, string>;

  readonly total: number;
  statusOf(i: number): 'complete' | 'current' | 'upcoming' | 'error' | 'disabled';
  goTo(i: number): void; next(): void; prev(): void;
  setStatus(i: number, status?: string): void;         // omit status to clear the explicit override
}
```

A step's explicit `status` (set via `setStatus` or in the schema) always wins over the computed
complete/current/upcoming state. Events: `o-select { index, step }` (cancelable — the default handler calls
`goTo`), `o-change { index, previous }`.

Static markup (no JS): `<ol class="o-steps"><li class="o-step is-complete"><span class="o-step-marker">1</span><span class="o-step-text"><span class="o-step-title">Account</span></span></li>…</ol>` — add
`is-vertical`, `o-steps-dots`, `o-steps-progress` as needed.

## `<o-progress-tracker>`

```ts
interface TrackStep { title: string; icon?: string; description?: string; time?: string | Date; date?: string | Date; expected?: string | Date; errorTitle?: string; }
class OProgressTracker extends OElement {
  steps: TrackStep[];                                  // default: Ordered/Packed/Shipped/Out for delivery/Delivered
  current: number;
  orientation: 'horizontal' | 'vertical'; responsive: boolean;
  status?: 'error' | 'cancelled';                       // marks the current step as failed instead of in-progress
  label?: string; texts?: Record<string, string>;
}
```

## Keyboard

Arrow keys move focus between clickable steps (`Home`/`End` jump to the first/last); `ListNav` handles RTL
mirroring automatically. Disabled steps are skipped.
