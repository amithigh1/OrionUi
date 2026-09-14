/* ============================================================================
 * Orion.ai.searchProvider(opts) -> Provider — an AI-answer category for <o-global-search>.
 * Drop the returned object into <o-global-search>'s `providers` array to add an "AI answer" result
 * that asks Orion.ai the typed query and shows the reply (see globalsearch/README.md for the
 * Provider/Result contract this implements):
 *
 *   searchEl.providers = [ Orion.ai.searchProvider(), ...otherProviders ];
 *
 * opts: { id='ai', title=t('aiSearch.answer'), icon='sparkles', minChars=4, system, provider,
 *         sources(query, answer) -> Result[] (optional citation rows appended after the answer) }
 * Needs the "ai" component (Orion.ai); until then the provider quietly returns no results.
 * ========================================================================== */
function aiSearchProvider(opts = {}) {
  const { id = 'ai', title, icon = 'sparkles', minChars = 4, system, provider, sources } = opts;
  return {
    id,
    title: title || (() => t('aiSearch.answer')),
    icon,
    limit: 1 + (sources ? 3 : 0),
    async search(query, { signal } = {}) {
      query = String(query || '').trim();
      if (!O.ai || query.length < minChars) return [];
      let answer;
      try {
        answer = await O.ai.chat([{ role: 'user', content: query }], {
          system: system || 'Answer the user\'s question concisely and directly in plain prose (no markdown headings). If you are unsure, say so briefly instead of guessing.',
          signal, provider, retries: 0,
        });
      } catch (err) {
        if (err?.name === 'AbortError') throw err;
        return [{ id: id + '-error', title: err?.message || t('ai.error'), icon: 'alert-circle' }];
      }
      answer = String(answer || '').trim();
      if (!answer) return [];
      const results = [{
        id: id + '-answer', title: aitTruncate(answer, 240).replace(/\s+/g, ' '), subtitle: t('aiSearch.askFollowUp'), icon,
        onSelect: isFn(opts.onSelect) ? () => opts.onSelect(answer, query) : undefined,
      }];
      const list = isFn(sources) ? sources(query, answer) : sources;
      if (Array.isArray(list)) {
        list.slice(0, 3).forEach((s, i) => results.push({ id: `${id}-src-${i}`, title: s.title, subtitle: s.subtitle || t('aiSearch.sources'), url: s.url, icon: s.icon || 'link', onSelect: s.onSelect }));
      }
      return results;
    },
  };
}
