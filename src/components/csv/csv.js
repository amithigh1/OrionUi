/* CSV — RFC 4180 parser & writer (data package). No dependencies, works in browsers, workers and Node.
 *
 *   O.csv.parse(text, { delimiter: 'auto', header: true, trim, skipEmpty: true, dynamicTyping, comment, maxRows,
 *                       onChunk(rows, meta) -> false to stop, chunkSize: 1000, collect }) -> { rows, fields, errors, meta }
 *   O.csv.parseAsync(text | Blob | File, { ...same, encoding: 'auto', onProgress(ratio), signal }) -> Promise<same>
 *        (streams Blobs, yields to the UI thread between slices — use it for big files)
 *   O.csv.stringify(rows, { columns: [{ key, title, format(value, row) }], header: true, delimiter: ',', bom: false,
 *                           eol: '\r\n', quote: 'auto' | 'all', safe: true, nullValue: '', dateFormat }) -> string
 *   O.csv.detect(text) -> ',' | ';' | '\t' | '|'
 *
 * `safe` (default on) prefixes values that start with = + - @ TAB CR with a single quote (CSV formula injection guard);
 * plain numbers such as "-12.5" or "-$5.00" are left untouched.
 */

const DELIMITERS = [',', ';', '\t', '|'];
const NUM_RE = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/;
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const PLAIN_NUM_RE = /^[-+]?[\p{Sc}]?\s?[\d.,\s]*\d[\d.,\s]*\s?[\p{Sc}%]?$/u;
const yieldUI = () => new Promise(r => (globalThis.scheduler?.yield ? globalThis.scheduler.yield().then(r) : setTimeout(r, 0)));
const abortError = () => { const e = new Error('Aborted'); e.name = 'AbortError'; return e; };

/** Parse an ISO date / datetime string; returns a Date or null (validates the calendar date). */
function isoDate(v) {
  const m = ISO_RE.exec(v);
  if (!m) return null;
  const [, y, mo, d, hh = '0', mi = '0', ss = '0', frac = '0', tz] = m;
  const ms = +frac.slice(0, 3).padEnd(3, '0');
  if (+mo < 1 || +mo > 12 || +d < 1 || +d > 31 || +hh > 23 || +mi > 59 || +ss > 59) return null;
  let out;
  if (tz) {
    const off = tz === 'Z' ? 0 : (tz[0] === '-' ? -1 : 1) * (+tz.slice(1, 3) * 60 + +tz.slice(-2));
    out = new Date(Date.UTC(+y, +mo - 1, +d, +hh, +mi, +ss, ms) - off * 6e4);
  } else out = new Date(+y, +mo - 1, +d, +hh, +mi, +ss, ms);
  const check = tz ? new Date(Date.UTC(+y, +mo - 1, +d)) : out;
  return (tz ? check.getUTCDate() : check.getDate()) === +d ? out : null;
}

/** dynamicTyping conversion: numbers, booleans, ISO dates, '' -> null. Codes such as "007" and long digit strings stay text. */
function typed(v) {
  if (v === '') return null;
  const c = v.charCodeAt(0);
  if ((c >= 48 && c <= 57) || c === 45 || c === 43 || c === 46) {
    if (NUM_RE.test(v)) {
      if (/^[-+]?0\d/.test(v)) return v;
      const n = +v;
      return Number.isFinite(n) && (Number.isSafeInteger(n) || /[.eE]/.test(v)) ? n : v;
    }
    if (v.length >= 10 && c !== 45 && c !== 43) return isoDate(v) || v;
    return v;
  }
  if (v.length === 4 || v.length === 5) { const l = v.toLowerCase(); if (l === 'true') return true; if (l === 'false') return false; }
  return v;
}

/** Guess the delimiter from the first lines (quote-aware): the candidate with the most consistent field count wins. */
function detect(text, candidates = DELIMITERS, quote = '"') {
  const s = String(text ?? '').replace(/^\u{FEFF}/u, '').slice(0, 65536);
  let best = null;
  for (const d of candidates) {
    const counts = [];
    let n = 1, inQ = false, lineHasContent = false;
    for (let i = 0; i < s.length && counts.length < 25; i++) {
      const ch = s[i];
      if (ch === quote) { inQ = !inQ; lineHasContent = true; }
      else if (inQ) continue;
      else if (ch === d) { n++; lineHasContent = true; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && s[i + 1] === '\n') i++;
        if (lineHasContent) counts.push(n);
        n = 1; lineHasContent = false;
      } else lineHasContent = true;
    }
    if (lineHasContent && s.length < 65536) counts.push(n);
    if (!counts.length) continue;
    const freq = new Map();
    counts.forEach(c => freq.set(c, (freq.get(c) || 0) + 1));
    let mode = 1, modeN = 0;
    freq.forEach((f, c) => { if (f > modeN || (f === modeN && c > mode)) { mode = c; modeN = f; } });
    if (mode < 2) continue;
    const score = modeN / counts.length;
    if (!best || score > best.score + 1e-9 || (Math.abs(score - best.score) < 1e-9 && mode > best.mode)) best = { d, score, mode };
  }
  return best ? best.d : ',';
}

function uniqueFields(list, transform) {
  const used = new Set();
  return list.map((f, i) => {
    let base = String(transform ? transform(f, i) : f).trim() || `field${i + 1}`, k = base, n = 1;
    while (used.has(k)) k = `${base}_${++n}`;
    used.add(k);
    return k;
  });
}

/** Incremental RFC 4180 parser: push(chunk, final) as text arrives, then result(). */
class CsvParser {
  constructor(o = {}) {
    this.o = { header: true, skipEmpty: true, quote: '"', chunkSize: 1000, delimiter: 'auto', ...o };
    this.buf = '';
    this.rows = []; this.batch = []; this.errors = []; this.fields = null;
    this.count = 0; this.stopped = false; this.started = false;
    this.meta = { delimiter: null, linebreak: null, truncated: false, aborted: false, rows: 0 };
    this.collect = this.o.collect ?? !this.o.onChunk;
    const dt = this.o.dynamicTyping;
    this.typeFor = !dt ? null : dt === true ? () => true : isFn(dt) ? dt : (f) => !!dt[f];
  }
  push(chunk, final = false) {
    if (this.stopped) return this;
    this.buf += chunk;
    if (!this.started) {
      if (!final && this.buf.length < 4096) return this; // wait for enough text to sniff delimiter / line break
      this.started = true;
      if (this.buf.charCodeAt(0) === 0xfeff) this.buf = this.buf.slice(1);
      const d = this.o.delimiter;
      this.delim = !d || d === 'auto' ? detect(this.buf, DELIMITERS, this.o.quote) : d;
      this.meta.delimiter = this.delim;
      const m = /\r\n|\n|\r/.exec(this.buf);
      this.meta.linebreak = m ? m[0] : '\r\n';
    }
    const used = this._scan(this.buf, final);
    this.buf = used >= this.buf.length ? '' : this.buf.slice(used);
    if (final) this._flush(true);
    return this;
  }
  _error(type, code, message) { this.errors.push({ type, code, message, row: this.count }); }
  _scan(s, final) {
    const n = s.length, o = this.o, delim = this.delim, dc = delim.charCodeAt(0), qs = o.quote, qc = qs.charCodeAt(0);
    const trim = !!o.trim, comment = o.comment ? (o.comment === true ? '#' : o.comment) : null;
    const isSp = c => c === 32 || (c === 9 && dc !== 9);
    let i = 0;
    while (i < n && !this.stopped) {
      const rowStart = i;
      if (comment && s.startsWith(comment, i)) {
        let e = i;
        while (e < n && s.charCodeAt(e) !== 10 && s.charCodeAt(e) !== 13) e++;
        if (e >= n && !final) return rowStart;
        i = e + (s.charCodeAt(e) === 13 && s.charCodeAt(e + 1) === 10 ? 2 : 1);
        continue;
      }
      const row = [];
      let quoted = false;
      for (;;) {
        let j = i, c;
        if (trim) while (j < n && isSp(s.charCodeAt(j))) j++;
        if (j < n && s.charCodeAt(j) === qc) {
          quoted = true;
          let val = '', k = j + 1;
          for (;;) {
            const q = s.indexOf(qs, k);
            if (q < 0) {
              if (!final) return rowStart;
              this._error('Quotes', 'MissingQuotes', 'Quoted field is not terminated');
              val += s.slice(k); i = n; break;
            }
            if (q + 1 >= n && !final) return rowStart;
            if (s.charCodeAt(q + 1) === qc) { val += s.slice(k, q + 1); k = q + 2; continue; }
            val += s.slice(k, q); i = q + 1; break;
          }
          c = i < n ? s.charCodeAt(i) : -1;
          if (trim) while (isSp(c)) c = ++i < n ? s.charCodeAt(i) : -1;
          if (c !== dc && c !== 10 && c !== 13 && c !== -1) {
            let e = i;
            while (e < n) { const x = s.charCodeAt(e); if (x === dc || x === 10 || x === 13) break; e++; }
            if (e >= n && !final) return rowStart;
            this._error('Quotes', 'InvalidQuotes', 'Unexpected text after a closing quote');
            val += s.slice(i, e); i = e; c = i < n ? s.charCodeAt(i) : -1;
          }
          row.push(val);
        } else {
          let e = i;
          while (e < n) { const x = s.charCodeAt(e); if (x === dc || x === 10 || x === 13) break; e++; }
          if (e >= n && !final) return rowStart;
          let v = s.slice(trim ? j : i, e);
          if (trim) v = v.replace(/[ \t]+$/, '');
          row.push(v);
          i = e; c = i < n ? s.charCodeAt(i) : -1;
        }
        if (c === dc) {
          i++;
          if (i >= n) { if (!final) return rowStart; row.push(''); break; }
          continue;
        }
        if (c === 13) { if (i + 1 >= n && !final) return rowStart; i += s.charCodeAt(i + 1) === 10 ? 2 : 1; }
        else if (c === 10) i++;
        break;
      }
      this._row(row, quoted);
    }
    return i;
  }
  _row(raw, quoted) {
    const o = this.o;
    if (o.skipEmpty && !quoted && raw.length === 1 && raw[0] === '') return;
    if (o.skipEmpty === 'greedy' && raw.every(v => !String(v).trim())) return;
    if (o.header && !this.fields) { this.fields = uniqueFields(raw, o.transformHeader); return; }
    const tf = this.typeFor, tr = o.transform;
    let row;
    if (o.header) {
      const f = this.fields, nf = f.length;
      row = {};
      for (let i = 0; i < nf; i++) {
        let v = i < raw.length ? raw[i] : '';
        if (tr) v = tr(v, f[i]);
        row[f[i]] = tf && isStr(v) && tf(f[i], i) ? typed(v) : v;
      }
      if (raw.length !== nf) {
        if (raw.length < nf) this._error('FieldMismatch', 'TooFewFields', `Expected ${nf} fields but parsed ${raw.length}`);
        else { this._error('FieldMismatch', 'TooManyFields', `Expected ${nf} fields but parsed ${raw.length}`); row.__extra = raw.slice(nf); }
      }
    } else {
      row = raw;
      if (tr || tf) for (let i = 0; i < raw.length; i++) { let v = raw[i]; if (tr) v = tr(v, i); raw[i] = tf && isStr(v) && tf(i, i) ? typed(v) : v; }
    }
    this.count++;
    if (this.collect) this.rows.push(row);
    if (o.onChunk) { this.batch.push(row); if (this.batch.length >= o.chunkSize) this._flush(false); }
    if (o.maxRows && this.count >= o.maxRows) { this.meta.truncated = true; this.stopped = true; }
  }
  _flush(final) {
    if (!this.o.onChunk || this.meta.aborted || this.finished) return;
    if (final) this.finished = true;
    if (!this.batch.length) return;
    const b = this.batch; this.batch = [];
    if (this.o.onChunk(b, { fields: this.fields, delimiter: this.delim, rows: this.count, final }) === false) { this.stopped = true; this.meta.aborted = true; }
  }
  result() {
    this.meta.rows = this.count;
    const fields = this.fields || [];
    return { rows: this.rows, fields, errors: this.errors, meta: this.meta };
  }
}

/** Synchronous parse of a whole string. */
function parse(text, opts = {}) {
  const p = new CsvParser(opts);
  p.push(String(text ?? ''), true);
  p._flush(true);
  return p.result();
}

/** Asynchronous parse (string or Blob/File). Yields between slices so the page stays responsive. */
async function parseAsync(input, opts = {}) {
  const { signal, onProgress } = opts;
  if (signal?.aborted) throw abortError();
  if (typeof Blob !== 'undefined' && input instanceof Blob) {
    const head = new Uint8Array(await input.slice(0, 4).arrayBuffer());
    let enc = opts.encoding && opts.encoding !== 'auto' ? opts.encoding : head[0] === 0xff && head[1] === 0xfe ? 'utf-16le' : head[0] === 0xfe && head[1] === 0xff ? 'utf-16be' : 'utf-8';
    const run = async (encoding, fatal) => {
      const p = new CsvParser(opts), dec = new TextDecoder(encoding, { fatal });
      const reader = input.stream().getReader();
      let read = 0, since = 0;
      try {
        for (;;) {
          if (signal?.aborted) throw abortError();
          const { done, value } = await reader.read();
          if (done) break;
          read += value.length; since += value.length;
          p.push(dec.decode(value, { stream: true }), false);
          onProgress?.(input.size ? read / input.size : 0);
          if (p.stopped) break;
          if (since > 1 << 20) { since = 0; await yieldUI(); }
        }
      } finally { reader.cancel().catch(noop); }
      if (!p.stopped) p.push(dec.decode(), true); else p._flush(true);
      const res = p.result();
      res.meta.encoding = encoding;
      return res;
    };
    if (enc === 'utf-8' && (!opts.encoding || opts.encoding === 'auto')) {
      try { return await run('utf-8', true); } catch (e) { if (e.name === 'AbortError') throw e; enc = 'windows-1252'; }
    }
    return run(enc, false);
  }
  const s = String(input ?? ''), step = opts.sliceSize || 1 << 19, p = new CsvParser(opts);
  if (!s.length) { p.push('', true); return p.result(); }
  for (let i = 0; i < s.length; i += step) {
    if (signal?.aborted) throw abortError();
    const end = Math.min(s.length, i + step);
    p.push(s.slice(i, end), end >= s.length);
    onProgress?.(end / s.length);
    if (p.stopped) { p._flush(true); break; }
    if (end < s.length) await yieldUI();
  }
  return p.result();
}

/* ── writer ─────────────────────────────────────────────────────────── */
const pad = n => String(n).padStart(2, '0');
function csvDate(d, format) {
  if (Number.isNaN(+d)) return '';
  if (format) return O.date ? O.date.format(d, format) : d.toISOString();
  const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return d.getHours() || d.getMinutes() || d.getSeconds() || d.getMilliseconds() ? `${day} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` : day;
}
function columnsFor(columns, rows) {
  if (columns && columns.length) return columns.map((c, i) => (isStr(c) || isNum(c) ? { key: c, title: String(c) } : { ...c, key: c.key ?? c.field ?? i, title: c.title ?? c.label ?? String(c.key ?? c.field ?? '') }));
  const first = rows.find(r => r != null);
  if (!first || Array.isArray(first)) return null;
  const keys = new Set();
  for (let i = 0; i < Math.min(rows.length, 100); i++) if (isObj(rows[i])) for (const k of Object.keys(rows[i])) if (k !== '__extra') keys.add(k);
  return [...keys].map(k => ({ key: k, title: k }));
}
/** Convert rows to CSV text. */
function stringify(rows, opts = {}) {
  const o = { delimiter: ',', eol: '\r\n', quote: 'auto', header: true, bom: false, safe: true, nullValue: '', ...opts };
  const list = toArr(rows);
  const cols = columnsFor(o.columns, list);
  const d = o.delimiter, all = o.quote === 'all';
  const special = new RegExp(`[${d.replace(/[\]\\^-]/g, '\\$&')}"\\r\\n]|^\\s|\\s$`);
  const cell = v => {
    if (v == null) return o.nullValue;
    if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (v instanceof Date) return csvDate(v, o.dateFormat);
    if (Array.isArray(v)) return v.map(x => (x instanceof Date ? csvDate(x, o.dateFormat) : isObj(x) ? JSON.stringify(x) : x ?? '')).join(', ');
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  };
  const field = (v, isNumber) => {
    let s = cell(v);
    if (o.safe && !isNumber && s && /^[=+\-@\t\r]/.test(s) && !PLAIN_NUM_RE.test(s)) s = "'" + s;
    return all || special.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const lines = [];
  if (cols) {
    if (o.header) lines.push(cols.map(c => field(c.title, false)).join(d));
    for (const r of list) {
      if (r == null) continue;
      let line = '';
      for (let i = 0; i < cols.length; i++) {
        const c = cols[i];
        let v = getPath(r, c.key);
        if (isFn(c.format)) v = c.format(v, r);
        if (i) line += d;
        line += field(v, typeof v === 'number');
      }
      lines.push(line);
    }
  } else {
    if (o.header && o.fields) lines.push(o.fields.map(f => field(f, false)).join(d));
    for (const r of list) if (r != null) lines.push(toArr(r).map(v => field(v, typeof v === 'number')).join(d));
  }
  return (o.bom ? '\u{FEFF}' : '') + lines.join(o.eol) + (o.trailingEol ? o.eol : '');
}

O.csv = { parse, parseAsync, stringify, detect, Parser: CsvParser, typed, DELIMITERS };
