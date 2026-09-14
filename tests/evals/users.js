(async () => {
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const vis = el => !!el && el.getClientRects().length > 0;
  const r = {};
  r.rows = $$('#users tbody tr').length;
  $('#add-user').click(); await sleep(400);
  r.modalOpen = vis($('#user-form'));
  const btn = $$('.o-modal .o-btn-primary').find(vis); btn && btn.click(); await sleep(400);
  r.errorsOnEmptySubmit = $$('#user-form .o-error').filter(e => e.textContent.trim()).length;
  r.modalStillOpen = vis($('#user-form'));
  const cancel = $$('.o-modal .o-btn').find(b => vis(b) && /cancel/i.test(b.textContent)); cancel && cancel.click(); await sleep(400);
  r.modalClosedOnCancel = !vis($('#user-form'));
  r.ok = r.rows > 0 && r.modalOpen && r.errorsOnEmptySubmit >= 2 && r.modalStillOpen && r.modalClosedOnCancel;
  return r;
})()
