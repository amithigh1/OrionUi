# Orion Admin + Angular

Orion needs no Angular adapter: the components are native custom elements.

## Setup

```bash
ng new my-admin --standalone
cd my-admin
npm install orion-admin
```

1. Import the library once in `src/main.ts` (before bootstrapping):

```ts
import 'orion-admin';
```

2. Allow custom elements in any component that uses `<o-*>` tags, and import `FormsModule` if you bind with `ngModel`:

```ts
import { Component, CUSTOM_ELEMENTS_SCHEMA, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [FormsModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <div class="o-container o-py-6">
      <div class="o-page-header">
        <h1 class="o-page-title">Users</h1>
        <button class="o-btn o-btn-primary" (click)="add()">New user</button>
      </div>

      <!-- ngDefaultControl connects ngModel to any element exposing value + input events -->
      <o-select ngDefaultControl [(ngModel)]="role" [options]="roleOptions" clearable placeholder="All roles"></o-select>

      <o-datatable [columns]="columns" [rows]="rows()" [pageSize]="10" row-key="id"
                   (o-row-click)="open($event)"></o-datatable>
    </div>`,
})
export class UsersComponent {
  role = 'Admin';
  roleOptions = [{ value: 'Admin', label: 'Admin' }, { value: 'Editor', label: 'Editor' }];
  columns = [
    { key: 'name', title: 'Name', type: 'avatar' },
    { key: 'email', title: 'Email' },
    { key: 'role', title: 'Role', type: 'badge' },
    { key: 'salary', title: 'Salary', type: 'currency', align: 'end' },
  ];
  rows = signal([{ id: 1, name: 'Aisha Rahman', email: 'aisha@example.com', role: 'Admin', salary: 92400 }]);

  open(e: Event) { (window as any).Orion.toast(`Clicked ${(e as CustomEvent).detail.row.name}`); }
  async add() {
    const name = await (window as any).Orion.prompt({ title: 'New user', label: 'Full name', required: true });
    if (name) this.rows.update(r => [{ id: r.length + 1, name, email: '', role: 'Viewer', salary: 50000 }, ...r]);
  }
}
```

## Notes

- **Property bindings** (`[columns]`, `[rows]`, `[options]`) pass arrays and objects straight through.
- **Events**: `(o-change)`, `(o-row-click)`, … the payload is in `$event.detail`.
- **Forms**: add `ngDefaultControl` to use `ngModel` / `formControlName` with Orion controls.
- **Types**: `orion-admin` ships `dist/orion.d.ts`, so `document.querySelector('o-select')` is typed.
- Verified against Angular 21 with zoneless change detection (see `tests/frameworks/` in the repository).
