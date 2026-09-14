/* ============================================================================
 * Orion.ai.analyze(file | text, opts) -> Promise<{ summary, keyPoints, entities, fields, raw }>
 *   summary: string — a short prose summary
 *   keyPoints: string[] — the notable takeaways
 *   entities: { name, type }[] — people/organizations/dates/amounts/places mentioned
 *   fields: object — only populated when opts.fields is given (same shape as Orion.ai.tasks.extract)
 *   raw: string — the model's raw reply, kept for debugging when JSON parsing fails
 * `file` may be a File/Blob (plain text types only — .txt/.md/.csv/.json/.log/.xml/.html/.yml; a
 * zero-dependency build cannot parse PDFs, so a .pdf throws with a message pointing at a dedicated
 * parser) or any input Orion.ai.summarize() also accepts (string, element, selection text).
 * opts: { fields?: Field[] (see Orion.ai.tasks.extract), provider, signal }
 * Needs the "ai" component (Orion.ai).
 * ========================================================================== */
const __AI_DOC_MAX_BYTES = 5_000_000;
const __AI_DOC_TEXT_TYPE_RE = /^(text\/|application\/(json|xml|csv)$)/i;
const __AI_DOC_TEXT_EXT_RE = /\.(txt|md|markdown|csv|json|log|xml|ya?ml|html?)$/i;

async function __aitReadDocInput(input) {
  if (typeof Blob !== 'undefined' && input instanceof Blob) {
    if (input.size > __AI_DOC_MAX_BYTES) { const e = new Error(t('aiDocument.tooBig')); e.code = 'too-big'; throw e; }
    const name = input.name || '';
    const isPdf = /pdf$/i.test(input.type || '') || /\.pdf$/i.test(name);
    if (isPdf) { const e = new Error(t('aiDocument.pdfNote')); e.code = 'pdf-unsupported'; throw e; }
    const isText = __AI_DOC_TEXT_TYPE_RE.test(input.type || '') || __AI_DOC_TEXT_EXT_RE.test(name) || !input.type;
    if (!isText) { const e = new Error(t('aiDocument.unsupported')); e.code = 'unsupported'; throw e; }
    return await input.text();
  }
  return aitTextOf(input);
}
function __aiAnalyzeTask(text, opts) {
  const wantFields = toArr(opts.fields);
  const fieldsBlock = wantFields.length
    ? `\n\nAlso extract these into "fields":\n${wantFields.map(f => `- ${f.name || f}${f.type ? ` (${f.type})` : ''}${f.description ? `: ${f.description}` : ''}`).join('\n')}`
    : '';
  return {
    system: 'You analyze documents. Reply with ONLY a strict JSON object (no markdown fences, no prose) shaped exactly '
      + 'like {"summary": string, "keyPoints": string[], "entities": [{"name": string, "type": string}], "fields": object}. '
      + '"entities" lists notable people, organizations, dates, amounts or places found in the text (a short "type" label '
      + 'such as "person", "organization", "date", "amount" or "place"). Use an empty array/object when there is nothing '
      + 'to report; use "fields": {} when no fields were requested.' + fieldsBlock,
    messages: [{ role: 'user', content: aitTruncate(text, 12000) }],
  };
}

/** Orion.ai.analyze(file|text, opts) -> Promise<{ summary, keyPoints, entities, fields, raw }> */
async function aiAnalyze(input, opts = {}) {
  if (!O.ai) throw new Error('[Orion] Orion.ai.analyze requires the "ai" component (Orion.ai) — include it in your build.');
  const text = await __aitReadDocInput(input);
  if (!text || !text.trim()) return { summary: '', keyPoints: [], entities: [], fields: {}, raw: '' };
  const { system, messages } = __aiAnalyzeTask(text, opts);
  const raw = await O.ai.chat(messages, { system, signal: opts.signal, provider: opts.provider });
  const data = aitParseJSON(raw) || {};
  return {
    summary: isStr(data.summary) ? data.summary : '',
    keyPoints: Array.isArray(data.keyPoints) ? data.keyPoints.map(String) : [],
    entities: Array.isArray(data.entities) ? data.entities.filter(isObj).map(e => ({ name: String(e.name ?? ''), type: String(e.type ?? '') })) : [],
    fields: isObj(data.fields) ? data.fields : {},
    raw: String(raw ?? ''),
  };
}
