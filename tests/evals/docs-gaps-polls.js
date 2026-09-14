/* docs-gaps-polls.js — docs/components/survey-poll.html "Programmatic factory — Orion.polls()" demo.
 * Confirms Orion.polls(target, opts) actually builds a working <o-poll> (not just Object.assign on a detached
 * element): picks an option, clicks Vote, and checks the o-vote event + results view reflect the click — the
 * real voting flow, not a call straight into poll.vote().
 *   node build/check.mjs docs/components/survey-poll.html --bundle=.tmp/docsgaps/orion.js "--eval=@tests/evals/docs-gaps-polls.js"
 */
(async () => {
  const host = document.getElementById('poll-factory-host');
  if (!host) return { ok: false, error: 'no #poll-factory-host on page' };
  const poll = host.querySelector('o-poll');
  if (!poll) return { ok: false, error: 'Orion.polls() did not create an <o-poll> inside the host' };
  poll.reset(); // in case a previous run in the same profile left a persisted vote
  await new Promise(r => setTimeout(r, 30));

  const radio = poll.querySelector('.o-poll-choice input[value="GraphQL"]');
  if (!radio) return { ok: false, error: 'GraphQL option not rendered' };
  radio.click();
  const submit = poll.querySelector('.o-poll-submit');
  let voteDetail = null;
  poll.addEventListener('o-vote', e => { voteDetail = e.detail; }, { once: true });
  submit.click();
  await new Promise(r => setTimeout(r, 60));

  const eventOk = !!voteDetail && voteDetail.value === 'GraphQL' && Array.isArray(voteDetail.results);
  const hasVotedOk = poll.hasVoted();
  const picked = poll.querySelector('.o-poll-result.is-picked .o-poll-result-label');
  const resultsViewOk = !!picked && /GraphQL/.test(picked.textContent);
  const getResultsOk = poll.getResults().find(r => r.value === 'GraphQL')?.count === 1;

  const ok = eventOk && hasVotedOk && resultsViewOk && getResultsOk;
  return { ok, eventOk, hasVotedOk, resultsViewOk, getResultsOk, voteDetail };
})()
