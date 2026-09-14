/* Built-in validators (currently JSON) returning precise positions and friendly messages.
 *   Orion.highlight.validateJSON(text) -> [{ line, column, offset, message, severity }]
 */

i18n.add('en', {
  codeeditor: {
    json: {
      empty: 'Empty document', eof: 'Unexpected end of input', unexpected: 'Unexpected {token}', quotes: 'Strings must use double quotes',
      key: 'Expected a property name in double quotes', keyQuotes: 'Property names must be in double quotes', colon: "Expected ':' after property name",
      objEnd: "Expected ',' or '}' after property value", arrEnd: "Expected ',' or ']' after array item", trailing: 'Trailing commas are not allowed',
      escape: 'Invalid escape sequence', unterminated: 'Unterminated string', control: 'Control characters must be escaped', number: 'Invalid number',
      comment: 'Comments are not allowed in JSON', after: 'Unexpected content after the JSON value',
    },
  },
});

/** offset -> { line, column } (1-based) */
function posOf(text, at) {
  let line = 1, last = -1;
  for (let i = 0; i < at && i < text.length; i++) if (text.charCodeAt(i) === 10) { line++; last = i; }
  return { line, column: at - last };
}

function validateJSON(text) {
  const s = String(text ?? ''), n = s.length, T = k => t('codeeditor.json.' + k);
  let i = 0;
  const fail = (key, at = i, params) => { const e = new Error('json'); e.at = Math.min(at, n); e.msg = t('codeeditor.json.' + key, params); throw e; };
  const describe = c => (c === undefined ? T('eof') : t('codeeditor.json.unexpected', { token: JSON.stringify(c) }));
  const ws = () => {
    while (i < n) {
      const c = s.charCodeAt(i);
      if (c === 32 || c === 9 || c === 10 || c === 13) i++;
      else if (c === 47 && (s[i + 1] === '/' || s[i + 1] === '*')) fail('comment');
      else break;
    }
  };
  const str = () => {
    i++;
    while (i < n) {
      const c = s[i];
      if (c === '"') { i++; return; }
      if (c === '\\') {
        const e = s[i + 1];
        if (e === 'u') { if (!/^[0-9a-fA-F]{4}$/.test(s.slice(i + 2, i + 6))) fail('escape'); i += 6; continue; }
        if (!'"\\/bfnrt'.includes(e) || e === undefined) fail('escape');
        i += 2; continue;
      }
      if (c === '\n') fail('unterminated');
      if (c.charCodeAt(0) < 32) fail('control');
      i++;
    }
    fail('unterminated');
  };
  const NUMRE = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
  const num = () => { NUMRE.lastIndex = i; const m = NUMRE.exec(s); if (!m || /[\w.]/.test(s[i + m[0].length] || '')) fail('number'); i += m[0].length; };
  const value = () => {
    ws();
    const c = s[i];
    if (c === '{') return obj();
    if (c === '[') return arr();
    if (c === '"') return str();
    if (c === '-' || (c >= '0' && c <= '9')) return num();
    for (const w of ['true', 'false', 'null']) if (s.startsWith(w, i) && !/\w/.test(s[i + w.length] || '')) { i += w.length; return; }
    if (i >= n) fail('eof');
    if (c === "'") fail('quotes');
    const e = new Error('json'); e.at = i; e.msg = describe(c); throw e;
  };
  const obj = () => {
    i++; ws();
    if (s[i] === '}') { i++; return; }
    for (;;) {
      ws();
      if (s[i] !== '"') { if (s[i] === "'") fail('quotes'); fail(/[A-Za-z_$]/.test(s[i] || '') ? 'keyQuotes' : i >= n ? 'eof' : 'key'); }
      str(); ws();
      if (s[i] !== ':') fail(i >= n ? 'eof' : 'colon');
      i++; value(); ws();
      if (s[i] === ',') { const comma = i; i++; ws(); if (s[i] === '}') fail('trailing', comma); continue; }
      if (s[i] === '}') { i++; return; }
      fail(i >= n ? 'eof' : 'objEnd');
    }
  };
  const arr = () => {
    i++; ws();
    if (s[i] === ']') { i++; return; }
    for (;;) {
      value(); ws();
      if (s[i] === ',') { const comma = i; i++; ws(); if (s[i] === ']') fail('trailing', comma); continue; }
      if (s[i] === ']') { i++; return; }
      fail(i >= n ? 'eof' : 'arrEnd');
    }
  };
  try {
    ws();
    if (i >= n) return [];
    value(); ws();
    if (i < n) fail('after');
    return [];
  } catch (e) {
    if (e.at == null) throw e;
    const p = posOf(s, e.at);
    return [{ ...p, offset: e.at, message: e.msg, severity: 'error' }];
  }
}
O.highlight.validateJSON = validateJSON;
