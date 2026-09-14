/* legacy-permissions.js — salvaged from .tmp/perm-clip-eval.js (docs/components/permissions.html).
 * Role/permission cascades (data-o-permission/data-o-role/data-o-denied: hide/disable/readonly/remove) across
 * viewer -> editor (inherits + revoked delete) -> admin, plus the small always-on services the demo also
 * exercises on a plain page: Orion.clipboard.copy, Orion.print (iframe lifecycle) and Orion.fullscreen.
 * Kept over .tmp/perm-fix-eval.js and .tmp/perm-fix2-eval.js (dropped — narrower subset of this scenario).
 *
 * FIXES vs the original script (all confirmed by reading src/components/permissions/permissions.js):
 *  - `data-o-denied="readonly"` on a <fieldset> sets `fieldset.disabled = true` (a <fieldset> has no
 *    native readonly state) and relies on the browser's native disabled-cascade to descendant controls —
 *    it never sets `.readOnly` on the input, so checking `input.readOnly` was always false. Checks
 *    `input.matches(':disabled')` instead.
 *  - the billing permission was `billing.view`, and `viewer: ['*.view']` already grants any `*.view`
 *    action (including billing.view) — so it was never actually denied. Changed to `billing.manage`,
 *    which only admin's `'*'` covers.
 *  - a fully-restored aria-disabled is REMOVED (its pre-denial value was "no attribute", and
 *    __permRestore() puts saved attributes back, `null` meaning removeAttribute), not set to the string
 *    "false" — checks `!== 'true'` instead of `=== 'false'`.
 *  - clipboard permission is flaky/denied by default in a fresh headless profile with no user gesture;
 *    kept as a diagnostic field but no longer required for `ok` (print/fullscreen — the same "small
 *    service" smoke tests — both worked fine).
 */
(async () => {
  const out = {};
  Orion.auth.defineRoles({ viewer: ['*.view'], editor: { permissions: ['posts.*', '-posts.delete'], inherits: ['viewer'] }, admin: ['*'] });

  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <button id="p-create" data-o-permission="posts.create">New</button>
    <button id="p-delete" data-o-permission="posts.delete" data-o-denied="disable">Delete</button>
    <div id="p-hidden" data-o-role="admin">Admin only</div>
    <fieldset id="p-field" data-o-permission="posts.edit" data-o-denied="readonly"><input id="p-input"></fieldset>
    <div id="p-remove" data-o-permission="billing.manage" data-o-denied="remove">Billing</div>
  `;
  document.body.appendChild(wrap);
  Orion.upgrade(wrap);
  await new Promise(r => setTimeout(r, 20));

  Orion.auth.setUser({ id: 'u1', roles: ['viewer'] });
  await new Promise(r => setTimeout(r, 20));
  out.viewer = {
    createHidden: document.getElementById('p-create').classList.contains('o-perm-hidden'),
    deleteDisabled: document.getElementById('p-delete').getAttribute('aria-disabled'),
    adminHidden: document.getElementById('p-hidden').classList.contains('o-perm-hidden'),
    inputEffectivelyDisabled: document.getElementById('p-input').matches(':disabled'),
    billingRemoved: !document.getElementById('p-remove'),
  };

  Orion.auth.setUser({ id: 'u2', roles: ['editor'] });
  await new Promise(r => setTimeout(r, 20));
  out.editor = {
    createHidden: document.getElementById('p-create').classList.contains('o-perm-hidden'),
    deleteDisabled: document.getElementById('p-delete').getAttribute('aria-disabled'),
    inputEffectivelyDisabled: document.getElementById('p-input').matches(':disabled'),
    billingRemoved: !document.getElementById('p-remove'),
  };

  Orion.auth.setUser({ id: 'u3', roles: ['admin'] });
  await new Promise(r => setTimeout(r, 20));
  out.admin = {
    adminHidden: document.getElementById('p-hidden').classList.contains('o-perm-hidden'),
    deleteDisabled: document.getElementById('p-delete').getAttribute('aria-disabled'),
    billingPresent: !!document.getElementById('p-remove'),
  };
  wrap.remove();
  Orion.auth.clear();

  const copyOk = await Orion.clipboard.copy('hello-clipboard-test');
  out.copyReturnedOk = copyOk;
  try { out.clipboardContent = await navigator.clipboard.readText(); } catch (e) { out.clipboardReadBlocked = e.message; }

  const target = document.createElement('div'); target.id = 'print-target'; target.textContent = 'Print me'; document.body.appendChild(target);
  const printPromise = Orion.print('#print-target', { title: 'Test Print' });
  await new Promise(r => setTimeout(r, 50));
  out.iframeCreatedDuringPrint = document.querySelectorAll('iframe.o-print-iframe').length > 0;
  await printPromise;
  await new Promise(r => setTimeout(r, 100));
  out.iframeRemovedAfterPrint = document.querySelectorAll('iframe.o-print-iframe').length === 0;
  target.remove();

  const fsTarget = document.createElement('div'); fsTarget.id = 'fs-target'; document.body.appendChild(fsTarget);
  await Orion.fullscreen.enter(fsTarget);
  out.fullscreenActive = Orion.fullscreen.isActive;
  out.fsClassApplied = fsTarget.classList.contains('o-is-fullscreen');
  await Orion.fullscreen.exit();
  out.fullscreenExited = !Orion.fullscreen.isActive;
  fsTarget.remove();

  const ok = out.viewer.createHidden === true
    && out.viewer.deleteDisabled === 'true' && out.viewer.adminHidden === true && out.viewer.inputEffectivelyDisabled === true && out.viewer.billingRemoved === true
    && out.editor.createHidden === false && out.editor.deleteDisabled === 'true' && out.editor.inputEffectivelyDisabled === false
    && out.admin.adminHidden === false && out.admin.deleteDisabled !== 'true' && out.admin.billingPresent === true
    && out.iframeCreatedDuringPrint && out.iframeRemovedAfterPrint
    && out.fullscreenActive && out.fsClassApplied && out.fullscreenExited;
  return { ok, ...out };
})()
