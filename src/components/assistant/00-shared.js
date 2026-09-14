/* ============================================================================
 * Shared helpers for <o-chatbot> and <o-assistant>.
 * ========================================================================== */
i18n.add('en', {
  chatbot: {
    title: 'Assistant', placeholder: 'Message…', send: 'Send', stop: 'Stop', newChat: 'New chat', attach: 'Attach a file',
    regenerate: 'Regenerate', copy: 'Copy message', good: 'Good response', bad: 'Bad response',
    error: 'Something went wrong.', retry: 'Retry', jump: 'New messages', close: 'Close chat', open: 'Open chat',
    removeFile: 'Remove attachment', stopped: 'Stopped generating.', fileTooBig: 'That file is too large to attach.',
    export: 'Export transcript', exported: 'Transcript exported',
  },
  assistant: {
    title: 'Assistant', ask: 'Ask', placeholder: 'Ask about the page or your selection…',
    summarizePage: 'Summarize this page', explainSelection: 'Explain selection', draftReply: 'Draft a reply',
    insert: 'Insert', replace: 'Replace selection', copy: 'Copy', history: 'History', clearHistory: 'Clear history',
    close: 'Close assistant', open: 'Toggle assistant', noContext: 'Select some text, place your cursor in a field, or just ask a question.',
    contextSelection: 'Selection', contextPage: 'Page', contextNone: 'No context', running: 'Working…',
    resultCopied: 'Copied to clipboard', inserted: 'Inserted', replaced: 'Replaced selection',
  },
});

/** Truncate long attachment/page context so we don't blow up the prompt. */
function aiSharedTruncate(s, max = 8000) {
  s = String(s ?? '');
  return s.length > max ? s.slice(0, max) + `\n…[truncated ${s.length - max} characters]` : s;
}

/** Track the last focused editable element outside `boundary` (for Insert / Replace selection). */
function trackLastFocused(boundary) {
  let last = null;
  const isEditable = el => !!el && el.nodeType === 1 && (
    el.tagName === 'TEXTAREA'
    || (el.tagName === 'INPUT' && !/^(checkbox|radio|button|submit|reset|range|color|file|image|hidden)$/i.test(el.type))
    || el.isContentEditable
    || (el.localName.includes('-') && 'value' in el && isFn(el.setValue))
  );
  const off = on(doc, 'focusin', e => {
    const el = e.target;
    if (boundary && boundary.contains(el)) return;
    if (isEditable(el)) last = el;
  });
  return { off, get: () => (last && last.isConnected ? last : null) };
}

/** Insert text into a target editable element, replacing its selection or inserting at the caret. */
function insertIntoTarget(el, text, mode = 'insert') {
  if (!el) return false;
  try { el.focus({ preventScroll: true }); } catch { /* ignore */ }
  if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
    const hasSel = el.selectionStart !== el.selectionEnd;
    const start = mode === 'replace' ? (hasSel ? el.selectionStart : 0) : (el.selectionStart ?? el.value.length);
    const end = mode === 'replace' ? (hasSel ? el.selectionEnd : el.value.length) : (el.selectionEnd ?? el.value.length);
    el.setRangeText(text, start, end, 'end');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }
  if (el.isContentEditable) {
    const sel = win.getSelection && win.getSelection();
    if (mode === 'replace' && sel && !sel.isCollapsed && el.contains(sel.anchorNode)) sel.deleteFromDocument();
    try {
      if (doc.queryCommandSupported && doc.queryCommandSupported('insertText')) doc.execCommand('insertText', false, text);
      else el.append(doc.createTextNode(text));
    } catch { el.append(doc.createTextNode(text)); }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }
  if ('value' in el && isFn(el.setValue)) { el.setValue(mode === 'replace' ? text : String(el.value ?? '') + text); return true; }
  return false;
}
/** The current window selection's text, if any. */
function currentSelectionText() {
  const sel = isBrowser && win.getSelection ? win.getSelection() : null;
  return sel && !sel.isCollapsed ? sel.toString() : '';
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

/**
 * runStream(messages, opts, handlers) — drives Orion.ai.stream() with a throttled onChunk callback
 * (so DOM updates — and anything an assistive tech observes via the live region — are batched
 * instead of firing once per token) and normalizes success / abort / error outcomes.
 * handlers: { onChunk(fullText), onDone(fullText), onAbort(partialText), onError(err, partialText) }
 * Returns the underlying stream handle (has .cancel()), or null if Orion.ai is unavailable.
 */
function runStream(messages, opts, handlers) {
  const AI = O.ai;
  if (!AI) { handlers.onError?.(new Error('[Orion] the "ai" component is required by "assistant"/"aitools" — include it in your build.'), ''); return null; }
  let full = '';
  const emitChunk = throttle(() => handlers.onChunk?.(full), 300);
  const it = AI.stream(messages, { ...opts, onToken: (tok, f) => { full = f; emitChunk(); } });
  (async () => {
    try {
      for await (const _tok of it) { /* consumption drives the onToken callback above */ }
      handlers.onChunk?.(full);
      handlers.onDone?.(full);
    } catch (err) {
      if (err?.name === 'AbortError') handlers.onAbort?.(full);
      else handlers.onError?.(err, full);
    }
  })();
  return it;
}
