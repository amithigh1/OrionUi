# icons

The complete Orion Admin icon set: 421 canonical icons (the 68 core essentials plus 353 drawn for this package,
including 15 `brand-*` marks) and 290 aliases. Docs: `docs/components/icons.html`.

## Files

| File | Contents |
|---|---|
| `00-registry.js` | `reg(category, map)` / `tag(category, names)` helpers shared by the other files |
| `10-navigation.js` | Navigation arrows, Layout |
| `20-actions.js` | Actions (plus redrawn `settings`), Editor |
| `30-files.js` | Files, Development, Diagrams |
| `40-people.js` | Communication, People, Security |
| `50-commerce.js` | Commerce, Charts |
| `60-devices.js` | Devices (plus redrawn `printer`), Media (plus redrawn `camera`) |
| `70-places.js` | Places, Time, Weather |
| `80-status.js` | Status, Objects, Shapes |
| `85-brands.js` | Brands |
| `99-meta.js` | Aliases, RTL list, single `O.icons.add()` pass, `O.icons.*` helpers |
| `icons.css` | Size, stroke and background helpers; RTL mirroring; `size` attribute fix |

## Drawing rules

* 24×24 `viewBox`, inner markup only (`<path>`, `<circle>`, `<rect>`, `<ellipse>`, `<g>`). No `fill`/`stroke`
  attributes, except `fill="currentColor" stroke="none"` on shapes that must be solid (brand marks, half star, contrast).
* 2px stroke with round caps and joins, inherited from the `<svg>`. Never set `stroke-width` on a shape, or the
  `.o-icon-thin` / `.o-icon-bold` helpers stop working.
* Keep the live area inside 2–22 (strokes may reach 1–23). Full circles use `r="10"`, framed squares
  `x="3" y="3" width="18" height="18" rx="2"`, and files use the core `file` outline so badges line up.
* Balance optically: the bounding-box centre should sit within about 1 unit of (12, 12).
* Every icon must stay recognisable at 16px. Check new icons on the scratch sheets (see below).

## API added to `Orion.icons`

`categories`, `aliases`, `alias(name, target)`, `resolve(name)`, `aliasesOf(name)`, `names()`, `categoryOf(name)`,
`search(query, limit)`, `rtl`. `add()` is wrapped so that re-registering an icon also updates its aliases, and so that
registering an alias name turns it into a real icon.

## CSS helpers

`.o-icon-xs|sm|md|lg|xl|2xl` (set `--o-icon-size`), `.o-icon-thin` / `.o-icon-bold` (stroke 1.5 / 2.5),
`.o-icon-bg` (+ `.o-c-{color}`, `.o-icon-bg-solid`, `.o-icon-bg-rounded`), `.o-icon-no-flip`.
All of them work on the `<svg>`, on `<o-icon>` or on a parent.

Notes:

* The text-formatting icon is named `bold`, so its `<svg>` gets the class `o-icon-bold`. Its path carries
  `class="o-glyph-bold"` and the stroke rule skips it (`:has()`), so the glyph keeps the normal weight.
* Core CSS sets `.o-icon { width: var(--o-icon-size, 1.25em) }`, which overrides the `width`/`height` attributes that
  `icon(name, { size })` and `<o-icon size>` write. `icons.css` restores them with `.o-icon[width] { width: auto; height: auto }`.
* RTL mirroring is keyed on the canonical class (`.o-icon-undo`). An alias renders with its own class (`o-icon-return`),
  so use the canonical name, or add `.o-icon-flip`, when an alias should mirror.

## Visual QA

```bash
node build/build.mjs --only=icons --out=.tmp/icons/build --no-min
node build/check.mjs .tmp/icons/sheet-1.html --bundle=.tmp/icons/build/orion.js --shots=.tmp/icons/shots
```

The scratch sheets (`.tmp/icons/sheet-N.html`, 48 icons each at 48px plus rows at 16px and 24px) are not part of
the library.

Brand names and logos are trademarks of their respective owners; the `brand-*` glyphs are simplified monochrome
drawings for sign-in buttons and links.
