/* ============================================================================
 * Assemble the aitools additions to the shared Orion.ai namespace. "ai" is declared as a hard
 * @deps (see 00-shared.js) precisely so Orion.ai already exists as an object here — this file
 * only ever ADDS methods to it, never redefines Orion.ai itself.
 * ========================================================================== */
O.ai.summarize = aitSummarize;
O.ai.rewrite = aitRewrite;
O.ai.translate = aitTranslate;
O.ai.fillForm = aiFillForm;
O.ai.analyze = aiAnalyze;
O.ai.searchProvider = aiSearchProvider;
