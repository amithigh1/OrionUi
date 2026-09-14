/* legacy-undo-manager.js — salvaged from the UndoManager half of .tmp/undo-url-eval.js
 * (docs/components/undo-redo.html). Merge window, batching, and mod+Z / mod+Shift+Z keyboard binding.
 * The URL half of the original script is kept separately as legacy-url-state.js (url-state.html).
 *
 * FIX vs the original script: it expected the post-batch history length to be historySizeAfterMerge + 1.
 * That ignores what um.undo() just did: src/components/undo/10-manager.js's push()/_truncate() correctly
 * discard the "redo" tail (the just-undone "Type" entry) before adding a new one, per standard undo/redo
 * semantics (any new edit after an undo drops the old future). So the truncated entry is REPLACED by the
 * batch entry — net stack size stays the same. Checks that directly (size unchanged, but the current
 * entry is the 3-command batch), instead of assuming growth.
 */
(async () => {
  const out = {};
  let value = '';
  const um = new Orion.UndoManager({ mergeWindow: 500 });
  um.execute({ label: 'Type', mergeKey: 'type', merge: true, do() { value += 'a'; }, undo() { value = value.slice(0, -1); } });
  um.execute({ label: 'Type', mergeKey: 'type', merge: true, do() { value += 'b'; }, undo() { value = value.slice(0, -1); } });
  out.mergedValue = value;
  out.historySizeAfterMerge = um.history.length;
  um.undo();
  out.afterUndoMerged = value;

  let list = [];
  um.batch('Add 3', () => { for (let i = 0; i < 3; i++) um.push({ do: () => list.push(i), undo: () => list.pop() }); list.push(0), list.push(1), list.push(2); });
  out.batchedAsOne = um.history.length;
  out.batchEntryCmdCount = um.history[um.pointer]?.count;

  const host = document.createElement('div'); host.tabIndex = 0; document.body.appendChild(host);
  const um2 = new Orion.UndoManager();
  let v2 = 0;
  um2.push({ label: 'Inc', do: () => v2++, undo: () => v2-- });
  const unbind = um2.bind(host, { allowInInputs: true });
  v2 = 1;
  host.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
  out.boundUndo = v2;
  host.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }));
  out.boundRedo = v2;
  unbind(); host.remove();

  const ok = out.mergedValue === 'ab' && out.historySizeAfterMerge === 1 && out.afterUndoMerged === ''
    && out.batchedAsOne === 1 && out.batchEntryCmdCount === 3 && out.boundUndo === 0 && out.boundRedo === 1;
  return { ok, ...out };
})()
