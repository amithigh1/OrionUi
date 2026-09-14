(async () => {
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const vis = el => !!el && el.getClientRects().length > 0;
  const r = {};
  r.rows = $$('#table tbody tr').length;
  r.badgeClasses = [...new Set($$('#table .o-badge').map(b => [...b.classList].filter(c => /^o-badge-/.test(c)).join(' ')))];
  $('#add').click(); await sleep(400);
  const modal = $$('.o-modal').find(vis);
  r.modalOpen = !!modal && vis($('#user-form'));
  const primary = modal && [...modal.querySelectorAll('.o-btn-primary')].find(vis);
  primary && primary.click(); await sleep(400);
  r.errorsOnEmptySubmit = $$('#user-form .o-error').filter(e => e.textContent.trim()).length;
  r.invalidFields = $$('#user-form .is-invalid, #user-form [aria-invalid="true"]').length;
  r.modalStillOpen = vis($('#user-form'));
  r.ok = r.rows > 0 && r.badgeClasses.length >= 2 && r.modalOpen && r.errorsOnEmptySubmit >= 1 && r.modalStillOpen;
  return r;
})()
