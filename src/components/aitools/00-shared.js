// @deps ai
/* ============================================================================
 * Shared helpers for the aitools package (ai-search, ghost-text autocomplete, ✨ suggest,
 * summary, form-fill, document analysis). Declares "ai" as a hard dependency (not just a runtime
 * one like assistant's) because 70-api.js assigns new methods onto the shared Orion.ai namespace
 * at load time, so Orion.ai must already exist as an object by then.
 * ========================================================================== */
i18n.add('en', {
  aiSearch: { placeholder: 'Search…', answer: 'AI answer', sources: 'Sources', askFollowUp: 'Ask a follow-up…', noResults: 'No results found', results: '{count} results' },
  aiSuggest: {
    trigger: 'Improve with AI', improve: 'Improve writing', fix: 'Fix grammar', shorten: 'Shorten', expand: 'Expand',
    formal: 'Make formal', friendly: 'Make friendly', translate: 'Translate to…', custom: 'Custom instruction…',
    accept: 'Accept', retry: 'Retry', discard: 'Discard', placeholder: 'Tell it what to change…', working: 'Rewriting…',
  },
  aiSummary: { title: 'Summary', regenerate: 'Regenerate', copy: 'Copy', keyPoints: 'Key points', paragraph: 'Paragraph', empty: 'Nothing to summarize yet.' },
  aiFill: { title: 'Fill with AI', action: 'Fill with AI', working: 'Reading your text…', undo: 'Undo', filled: '{count} fields filled', error: 'Could not fill the form from that text.' },
  aiDocument: {
    drop: 'Drop a file here, or click to choose one', analyzing: 'Analyzing…', ask: 'Ask about this document', send: 'Send',
    extract: 'Extract fields', exportCsv: 'Export CSV', chat: 'Q&A', summaryTab: 'Summary', dataTab: 'Extracted data',
    pdfNote: 'PDF text extraction needs a dedicated parser, which a zero-dependency build cannot include — use the media/docviewer extractor when present, or convert to .txt/.md first.',
    unsupported: 'Unsupported file type.', tooBig: 'That file is too large to analyze in the browser.',
  },
});

/** Truncate long text before sending it as prompt context. */
function aitTruncate(s, max = 8000) { s = String(s ?? ''); return s.length > max ? s.slice(0, max) + `\n…[truncated ${s.length - max} characters]` : s; }

/** Simple word-level diff (LCS) for the suggest preview. Returns [{ type: 'same'|'del'|'ins', text }]. */
function wordDiff(a, b) {
  const aw = String(a).split(/(\s+)/), bw = String(b).split(/(\s+)/);
  const n = aw.length, m = bw.length;
  if (n * m > 250000) return [{ type: 'del', text: a }, { type: 'ins', text: b }];
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = aw[i] === bw[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  let i = 0, j = 0; const out = [];
  while (i < n && j < m) {
    if (aw[i] === bw[j]) { out.push({ type: 'same', text: aw[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ type: 'del', text: aw[i] }); i++; }
    else { out.push({ type: 'ins', text: bw[j] }); j++; }
  }
  while (i < n) out.push({ type: 'del', text: aw[i++] });
  while (j < m) out.push({ type: 'ins', text: bw[j++] });
  return out;
}
/** renderDiff(before, after) -> SafeHTML with <del>/<ins> spans, sanitized. */
function renderDiff(a, b) {
  const html = wordDiff(a, b).map(p => (p.type === 'same' ? esc(p.text) : p.type === 'del' ? `<del>${esc(p.text)}</del>` : `<ins>${esc(p.text)}</ins>`)).join('');
  return raw(sanitize(html, { tags: ['del', 'ins'] }));
}

/** Best-effort plain text of a value/element. */
function aitTextOf(input) {
  if (input == null) return '';
  if (isStr(input)) return input;
  if (input.nodeType === 1) return 'value' in input ? String(input.value ?? '') : (input.textContent || '');
  return String(input);
}

/** Parse a model's "should be JSON" reply, tolerating markdown code fences / stray prose around it. */
function aitParseJSON(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  try { return JSON.parse(s); } catch { /* fall through */ }
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) { try { return JSON.parse(fence[1].trim()); } catch { /* fall through */ } }
  const m = s.match(/[[{][\s\S]*[\]}]/);
  if (m) { try { return JSON.parse(m[0]); } catch { /* give up */ } }
  return null;
}

/* ── caret / value helpers for text fields and contenteditable ─────────── */
const __AIT_NON_TEXT_INPUT = /^(checkbox|radio|button|submit|reset|range|color|file|image|hidden)$/i;
const isEditableField = el => !!el && el.nodeType === 1 && (
  el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !__AIT_NON_TEXT_INPUT.test(el.type)) || el.isContentEditable
);
function fieldValue(el) { return el.isContentEditable ? (el.textContent || '') : String(el.value ?? ''); }
function setFieldValue(el, v) {
  if (el.isContentEditable) {
    el.textContent = v;
    const r = doc.createRange(); r.selectNodeContents(el); r.collapse(false);
    const sel = win.getSelection(); sel.removeAllRanges(); sel.addRange(r);
  } else { el.value = v; el.setSelectionRange(v.length, v.length); }
}
function caretAtEnd(el) {
  if (el.isContentEditable) {
    const sel = win.getSelection();
    if (!sel || !sel.rangeCount) return false;
    const r = sel.getRangeAt(0);
    if (!r.collapsed) return false;
    const probe = r.cloneRange(); probe.selectNodeContents(el); probe.setStart(r.endContainer, r.endOffset);
    return probe.toString().length === 0;
  }
  const len = el.value.length;
  return el.selectionStart === len && el.selectionEnd === len;
}
/** Selected text of a field, or ''. */
function fieldSelection(el) {
  if (el.isContentEditable) { const sel = win.getSelection(); return sel && !sel.isCollapsed && el.contains(sel.anchorNode) ? sel.toString() : ''; }
  return el.value.slice(el.selectionStart, el.selectionEnd);
}

/** Position a fixed-position overlay exactly on top of `el`, copying the box/font metrics that affect text layout. */
function syncOverlayToField(el, overlay, { wrap = true } = {}) {
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  css(overlay, {
    left: r.left, top: r.top, width: r.width, minHeight: r.height,
    font: cs.font, letterSpacing: cs.letterSpacing, lineHeight: cs.lineHeight,
    paddingTop: cs.paddingTop, paddingRight: cs.paddingRight, paddingBottom: cs.paddingBottom, paddingLeft: cs.paddingLeft,
    borderTopWidth: cs.borderTopWidth, borderRightWidth: cs.borderRightWidth, borderBottomWidth: cs.borderBottomWidth, borderLeftWidth: cs.borderLeftWidth,
    borderStyle: 'solid', borderColor: 'transparent', boxSizing: cs.boxSizing, textAlign: cs.textAlign,
    whiteSpace: wrap ? 'pre-wrap' : 'pre', wordBreak: cs.wordBreak,
  });
}
