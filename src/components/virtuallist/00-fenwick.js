/* <o-virtual-list> internals: a Fenwick (binary-indexed) tree over row heights so that both
 * "offset of row i" and "row at offset y" resolve in O(log n) — the two operations a virtualizer
 * needs on every scroll frame — even with 100k+ rows of independently measured heights.
 * Kept in its own file (loaded before 10-virtuallist.js by file-name order) with no dependency
 * on the rest of the component; only used inside this folder's scope.
 */
class VFenwick {
  /** sizes: number[] — initial per-row size (px). */
  constructor(sizes) {
    const n = sizes.length;
    this.n = n;
    const t = this.tree = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) t[i + 1] += sizes[i];
    for (let i = 1; i <= n; i++) { const j = i + (i & -i); if (j <= n) t[j] += t[i]; }
  }
  /** Rebuild for a new row count (used when the row list is rebuilt wholesale). */
  static from(sizes) { return new VFenwick(sizes); }
  /** Add `delta` to row i's size (delta may be negative). */
  add(i, delta) {
    if (!delta) return;
    for (i = i + 1; i <= this.n; i += i & -i) this.tree[i] += delta;
  }
  /** Sum of sizes for rows [0, i] inclusive (0-based). */
  sumTo(i) {
    if (i < 0) return 0;
    if (i >= this.n) i = this.n - 1;
    let s = 0;
    for (i = i + 1; i > 0; i -= i & -i) s += this.tree[i];
    return s;
  }
  /** Cumulative offset (top/left edge) of row i. */
  offsetOf(i) { return i <= 0 ? 0 : this.sumTo(i - 1); }
  /** Total size of every row. */
  total() { return this.n ? this.sumTo(this.n - 1) : 0; }
  /**
   * Index of the row that contains position `pos` (the largest i such that offsetOf(i) <= pos),
   * clamped to [0, n-1]. O(log n) binary lifting over the tree.
   */
  indexAt(pos) {
    if (this.n === 0) return 0;
    if (pos <= 0) return 0;
    let idx = 0, rem = pos;
    let mask = 1; while (mask * 2 <= this.n) mask *= 2;
    for (; mask > 0; mask >>= 1) {
      const next = idx + mask;
      if (next <= this.n && this.tree[next] <= rem) { idx = next; rem -= this.tree[next]; }
    }
    return Math.min(idx, this.n - 1);
  }
}

/**
 * Flatten `items` into virtual rows, inserting a group-header row whenever the group key changes.
 * Assumes items already arrive sorted so a key's occurrences are contiguous (documented behavior).
 */
function vlBuildRows(items, groupBy) {
  if (!groupBy) return items.map(item => ({ type: 'item', item }));
  const keyOf = isFn(groupBy) ? groupBy : (it => getPath(it, groupBy));
  const rows = [];
  let last, has = false;
  for (const item of items) {
    const k = keyOf(item);
    if (!has || k !== last) { rows.push({ type: 'group', key: k }); last = k; has = true; }
    rows.push({ type: 'item', item });
  }
  return rows;
}

/** Default key: item.id / item.key if present, else its (stable) position among items. */
function vlDefaultKey(item, i) { return item == null ? i : (item.id ?? item.key ?? i); }
