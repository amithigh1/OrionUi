# Examples

Small starter projects showing Orion Admin in each environment. All of them use the library built at
`../../dist/orion.js` (run `npm run build` in the repo root first), or you can point them at the CDN.

| Folder | Stack | Run |
|---|---|---|
| `vanilla/` | Plain HTML, no build step | Open `index.html` (or `npm run serve` in the root and browse to `/examples/vanilla/index.html`) |
| `react/` | React 19 + Vite + TypeScript | `cd react && npm install && npm run dev` |
| `vue/` | Vue 3 + Vite | `cd vue && npm install && npm run dev` |
| `angular/` | Angular standalone component | Copy the files into an `ng new` project (see `angular/README.md`) |

Every example renders the same screen: a page header, KPI cards, a data table with formatting and filters,
and a "New user" modal containing a validated form with `<o-select>` and `<o-datepicker>`.
