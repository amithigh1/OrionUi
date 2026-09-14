# autosave

Draft/auto-save for any form: debounced local (or remote) saves, a restore banner for drafts found on load,
a dirty/unload warning, and a status indicator. Depends on `validation` for `Orion.formUtil.serialize`/`fill`.
Docs: `docs/components/autosave.html`.

## Files

| File | Contents |
|---|---|
| `autosave.js` | `Orion.autosave`, storage adapters (local/session/IndexedDB), the `data-o-autosave` behavior, `save-draft` action |
| `autosave.css` | Status indicator states, restore banner |

## `Orion.autosave(form, options)`

```ts
interface AutosaveOptions {
  key?: string;                                         // storage key suffix; defaults to form id/name/pathname
  storage?: 'local' | 'session' | 'idb';                 // default 'local'; falls back to 'local' if IndexedDB is unavailable
  delay?: number;                                        // debounce ms, default 800
  restore?: 'prompt' | 'auto' | false;                   // default 'prompt'
  exclude?: string[];                                     // field names never saved (password/file/cc-*/otp are always excluded)
  warn?: boolean;                                         // beforeunload warning while dirty, default false
  files?: boolean;                                        // include File values (idb storage only), default false
  retries?: number;                                       // remote save retry attempts, default 3
  maxAge?: number;                                        // ms; older drafts found on load are discarded
  meta?(): any;                                           // extra data stored alongside the draft (e.g. wizard step)
  onSave?(data: object, form: Element): Promise<void>;     // makes save() remote; retried with backoff, offline-aware
  onRestore?(data: object, meta: any): void;
  onDiscard?(): void;
}
interface Autosave {
  save(opts?: { force?: boolean; manual?: boolean }): Promise<boolean>;
  restore(record?: any): Promise<boolean>;
  discard(): Promise<void>;
  clear(): Promise<void>;                                 // forgets the draft, treats current values as the new baseline
  destroy(): void;
  readonly isDirty: boolean; readonly lastSaved: Date | null; readonly draft: any;
}
function autosave(form: Element | string, opts?: AutosaveOptions): Autosave;    // one per form; re-calling merges opts
autosave.get(form: Element | string): Autosave | null;
```

### Declarative

```html
<form data-o-autosave="profile" data-o-autosave-restore="prompt" data-o-autosave-storage="local"
      data-o-autosave-delay="800" data-o-autosave-warn data-o-autosave-exclude="card,cvv">
  <span data-o-autosave-status></span>
  <button type="button" data-o-action="save-draft">Save draft</button>
</form>
```

Password and file inputs, and any field inside `[data-o-no-autosave]`, are never persisted. The draft clears
automatically on a successful submit (`o-submitted`) or a native `reset`.

Events on the form: `o-autosave { data, remote, manual }`, `o-restore { data, meta, savedAt }`,
`o-discard {}`, `o-autosave-error { error }`.

`[data-o-autosave-status]` renders "Saving…" / "Saved 2:14 PM" / "Offline — saved locally" / "Save failed —
retrying…" / an error, localized via the `autosave.*` i18n keys; `data-state` reflects the current state for
custom styling.
