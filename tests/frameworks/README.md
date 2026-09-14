# Framework integration tests

Verifies that Orion Admin custom elements work inside real framework apps:

| Framework | Checks |
|---|---|
| React 19 and React 18 (`Orion.react(React)`) | array/object/function props, initial value, className, data attributes, children, `onChange` → `o-change`, `onRowClick` → `o-row-click`, native `onClick`, refs |
| Vue 3 (`app.use(Orion.vue)`) | `:props`, `v-model` in both directions, `@o-*` events, no unknown-component warnings |
| Angular 21 (`CUSTOM_ELEMENTS_SCHEMA` + `ngDefaultControl`) | `[prop]` bindings, `[(ngModel)]` in both directions, `(o-*)` events, zoneless change detection |

```bash
# from the repo root, build the library first
npm run build
cd tests/frameworks
npm install
npm test
```
