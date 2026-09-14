/* Code highlighter: a small line-based tokenizer (state machine + sticky regexes).
 *   Orion.highlight(code, 'js')            -> escaped HTML with <span class="o-tk-*"> tokens
 *   Orion.highlightElement(preOrCode, lang) -> highlights in place
 *   <pre data-o-highlight="sql">…</pre>     behavior (add data-o-line-numbers for a gutter)
 *   Orion.highlight.tokenize(line, lang, state) -> { tokens: [[type, text]], state }   (incremental use)
 * Grammar: { modes: { root: [[regex, type | fn | [types per group], action?, when?], …] }, lineComment, blockComment }
 * Actions: 'push:mode' | 'pop' | 'goto:mode' (or a function returning one). State = stack of mode names.
 */

const W = s => new Set(s.split(/\s+/).filter(Boolean));
const NUM = /(?:0[xX][\da-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(?:\d[\d_]*(?:\.\d[\d_]*)?|\.\d[\d_]*)(?:[eE][+-]?\d+)?)[a-zA-Z]*/;
const DQ = /"(?:[^"\\]|\\.)*"?/;
const SQ = /'(?:[^'\\]|\\.)*'?/;
const WS = [/\s+/, null];
const BLOCK_C = { c: [[/.*?\*\//, 'com', 'pop'], [/.+/, 'com']] };

/** Classifies identifiers: keywords, constants, types, builtins, function calls, properties. */
function ident(o) {
  const ci = !!o.ci;
  return (m, ctx) => {
    const w = m[0], k = ci ? w.toLowerCase() : w;
    if (o.kw.has(k)) return 'kw';
    if (o.consts && o.consts.has(k)) return 'const';
    if (o.types && o.types.has(k)) return 'type';
    const after = ctx.line.slice(m.index + w.length);
    if (/^\s*\(/.test(after) && !(o.noCallAfter && ctx.prevText === '.')) return o.builtins && o.builtins.has(k) ? 'builtin' : 'fn';
    if (o.builtins && o.builtins.has(k)) return 'builtin';
    if (o.defFn && o.defFn.has(ctx.prevText)) return 'fn';
    if (o.defType && o.defType.has(ctx.prevText)) return 'type';
    if (ctx.prevText === '.' || ctx.prevText === '?.') return 'prop';
    if (o.typeCase && /^[A-Z][a-z0-9]/.test(w)) return 'type';
    return null;
  };
}
const regexOk = ctx => !ctx.prev || ctx.prev === 'op' || (ctx.prev === 'punct' && !/[)\]}]$/.test(ctx.prevText)) ||
  (ctx.prev === 'kw' && /^(?:return|typeof|case|do|else|in|of|new|delete|void|throw|instanceof|yield|await)$/.test(ctx.prevText));
const REGEX = /\/(?![*/])(?:[^/\\[\n]|\\.|\[(?:[^\]\\\n]|\\.)*\])+\/[dgimsuyv]*/;

/* ── C-like family builder ─────────────────────────────────────────── */
function clike(o) {
  const id = ident({ typeCase: true, defFn: W('function fn func def'), defType: W('class interface struct enum trait type record impl extends implements new'), ...o });
  const root = [
    WS,
    [/\/\/.*/, 'com'],
    [/\/\*/, 'com', 'push:c'],
    ...(o.pre || []),
    [DQ, 'str'],
    [o.charLit || SQ, 'str'],
    ...(o.regex ? [[REGEX, 'regex', null, regexOk]] : []),
    [NUM, 'num'],
    [o.identRe || /[A-Za-z_$][\w$]*/, id],
    [/=>|->|\.\.\.|::|\?\.|[+\-*/%=&|^!<>?:~]+/, 'op'],
    [/[{}()[\];,.@#]/, 'punct'],
  ];
  return { lineComment: '//', blockComment: ['/*', '*/'], modes: { root, ...BLOCK_C, ...(o.modes || {}) } };
}

const JS_KW = 'break case catch class const continue debugger default delete do else export extends finally for from function if import in instanceof let new of return static super switch this throw try typeof var void while with yield async await get set as';
const JS_CONST = 'true false null undefined NaN Infinity';
const JS_BUILTIN = 'console window document globalThis Math JSON Object Array String Number Boolean Promise Symbol Map Set WeakMap WeakSet Date RegExp Error BigInt Intl Reflect Proxy parseInt parseFloat setTimeout setInterval clearTimeout clearInterval fetch require module exports process';
const TPL = {
  tpl: [[/\\./, 'str'], [/`/, 'str', 'pop'], [/\$\{/, 'punct', 'push:tplx'], [/[^`\\$]+/, 'str'], [/\$/, 'str']],
};
function jsGrammar(ts) {
  const g = clike({
    kw: W(JS_KW + (ts ? ' interface type enum implements declare namespace abstract readonly keyof infer is satisfies private protected public override module unique asserts' : '')),
    consts: W(JS_CONST), builtins: W(JS_BUILTIN), types: ts ? W('string number boolean any unknown never void object symbol bigint') : null,
    regex: true, identRe: /#?[A-Za-z_$][\w$]*/,
    pre: [[/`/, 'str', 'push:tpl'], [/@[A-Za-z_][\w.]*/, 'meta']],
    modes: TPL,
  });
  g.modes.tplx = [[/\}/, 'punct', 'pop'], [/\{/, 'punct', 'push:tplx'], ...g.modes.root];
  return g;
}

/* ── languages ─────────────────────────────────────────────────────── */
const LANGS = Object.create(null);
const ALIASES = { js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript', node: 'javascript', ts: 'typescript', tsx: 'typescript', htm: 'html', xhtml: 'html', vue: 'html', svg: 'xml', rss: 'xml', py: 'python', rb: 'plaintext', sh: 'bash', shell: 'bash', zsh: 'bash', console: 'bash', yml: 'yaml', md: 'markdown', cs: 'csharp', 'c#': 'csharp', golang: 'go', rs: 'rust', text: 'plaintext', txt: 'plaintext', plain: 'plaintext', none: 'plaintext', jsonc: 'json', json5: 'json', mysql: 'sql', pgsql: 'sql', postgres: 'sql', sqlite: 'sql', tsql: 'sql', less: 'scss', sass: 'scss' };
const LANG_NAMES = { javascript: 'JavaScript', typescript: 'TypeScript', json: 'JSON', html: 'HTML', css: 'CSS', scss: 'SCSS', sql: 'SQL', python: 'Python', php: 'PHP', java: 'Java', csharp: 'C#', go: 'Go', rust: 'Rust', bash: 'Bash', yaml: 'YAML', xml: 'XML', markdown: 'Markdown', plaintext: 'Plain text' };

LANGS.plaintext = { modes: { root: [[/.+/, null]] } };
LANGS.javascript = jsGrammar(false);
LANGS.typescript = jsGrammar(true);

LANGS.json = {
  lineComment: '//',
  modes: {
    root: [WS, [/\/\/.*/, 'com'], [/\/\*/, 'com', 'push:c'], [/"(?:[^"\\]|\\.)*"(?=\s*:)/, 'key'], [DQ, 'str'],
      [/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/, 'num'], [/\b(?:true|false|null)\b/, 'const'], [/[{}[\],:]/, 'punct'], [/[^\s{}[\],:"]+/, 'err']],
    ...BLOCK_C,
  },
};

function cssGrammar(scss) {
  const atBlock = (m, ctx) => (/^@(?:media|supports|document|layer|container|include|mixin|if|else|each|for|while|function|font-feature-values|scope)\b/.test(ctx.stmt || '') ? 'push:root' : 'push:block');
  const pre = [WS, [/\/\*/, 'com', 'push:c'], ...(scss ? [[/\/\/.*/, 'com'], [/\$[\w-]+/, 'var'], [/#\{/, 'punct', 'push:interp']] : [])];
  const str = [/"(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?/, 'str'];
  const g = {
    lineComment: scss ? '//' : null, blockComment: ['/*', '*/'],
    modes: {
      root: [...pre, [/@[\w-]+/, 'kw'], str, [/\{/, 'punct', atBlock], [/\}/, 'punct', 'pop'], [/[.#][\w-]+/, 'sel'], [/&/, 'sel'],
        [/::?[\w-]+/, 'sel'], [/\[[^\]]*\]?/, 'attr'], [/-?\d[\d.]*(?:%|[a-z]+)?/i, 'num'],
        [/-?[a-zA-Z][\w-]*(?=\s*:\s*[^;{]*\))/, 'prop', null, ctx => /\($/.test(ctx.prevText)], [/[a-zA-Z][\w-]*/, 'tag'], [/[,>+~*;:()]/, 'punct']],
      block: [...pre, [/\}/, 'punct', 'pop'], [/\{/, 'punct', 'push:block'], [/@[\w-]+/, 'kw'], [/--[\w-]+/, 'var'],
        [/-?[a-zA-Z][\w-]*(?=\s*:(?![^;{}]*\{))/, 'prop'], [/#[\da-fA-F]{3,8}\b/, 'num'], [/!important\b/, 'kw'], str,
        [/-?(?:\d+\.?\d*|\.\d+)(?:%|[a-zA-Z]+)?/, 'num'], [/[\w-]+(?=\()/, 'fn'], [/&/, 'sel'], [/[.#][\w-]+(?=[^;]*\{)/, 'sel'],
        [/[\w-]+/, null], [/[:;,>+~*/=()]/, 'punct']],
      ...BLOCK_C,
      interp: [[/\}/, 'punct', 'pop'], [/\$[\w-]+/, 'var'], [/[^}$]+/, null]],
    },
  };
  return g;
}
LANGS.css = cssGrammar(false);
LANGS.scss = cssGrammar(true);

/** Rename a grammar's modes with a prefix so it can be embedded (HTML <script>/<style>). */
function embedModes(g, p) {
  const ren = a => (isStr(a) ? a.replace(/(push|goto):(\w+)/g, (_, k, m) => `${k}:${p}${m}`) : a);
  const out = {};
  for (const [name, rules] of Object.entries(g.modes)) {
    out[p + name] = rules.map(r => {
      const a = r[2];
      return [r[0], r[1], isFn(a) ? (m, ctx) => ren(a(m, ctx)) : ren(a), r[3]];
    });
  }
  return out;
}
function markupGrammar(html) {
  const tagRules = [WS, [/\/?>/, 'punct', 'pop'], [/"/, 'str', 'push:dq'], [/'/, 'str', 'push:sq'], [/=/, 'op'],
    [/[^\s"'>/=]+/, (m, ctx) => (ctx.prev === 'op' ? 'str' : 'attr')], [/\//, 'punct']];
  const modes = {
    root: [[/<!--/, 'com', 'push:hc'], [/<!\[CDATA\[/, 'meta', 'push:cdata'], [/<![a-zA-Z][^>]*>?/, 'meta'], [/<\?.*?(?:\?>|$)/, 'meta'],
      [/(<\/?)([a-zA-Z][\w:.-]*)/, ['punct', 'tag'], m => (m[1] === '<' && /^script$/i.test(m[2]) && html ? 'push:tagS' : m[1] === '<' && /^style$/i.test(m[2]) && html ? 'push:tagC' : 'push:tag')],
      [/&[#\w]+;?/, 'const'], [/[^<&]+/, null], [/[<&]/, null]],
    hc: [[/.*?-->/, 'com', 'pop'], [/.+/, 'com']],
    cdata: [[/.*?\]\]>/, 'meta', 'pop'], [/.+/, 'meta']],
    tag: tagRules,
    dq: [[/[^"]*"/, 'str', 'pop'], [/.+/, 'str']],
    sq: [[/[^']*'/, 'str', 'pop'], [/.+/, 'str']],
  };
  if (html) {
    modes.tagS = [[/>/, 'punct', 'goto:js_root'], ...tagRules.slice(0, 1), ...tagRules.slice(2)];
    modes.tagC = [[/>/, 'punct', 'goto:css_root'], ...tagRules.slice(0, 1), ...tagRules.slice(2)];
    const js = embedModes(LANGS.javascript, 'js_'), css = embedModes(LANGS.css, 'css_');
    js.js_root = [[/(?=<\/script\b)/i, null, 'pop'], ...js.js_root];
    css.css_root = [[/(?=<\/style\b)/i, null, 'pop'], ...css.css_root];
    Object.assign(modes, js, css);
  }
  return { blockComment: ['<!--', '-->'], modes };
}
LANGS.html = markupGrammar(true);
LANGS.xml = markupGrammar(false);

const SQL_KW = 'select from where and or not in is null like ilike between exists as on join inner left right full outer cross natural using group by order having limit offset fetch first next rows only union all intersect except distinct insert into values update set delete create table view index unique primary key foreign references constraint default check drop alter add column rename to truncate if replace temporary temp database schema grant revoke begin commit rollback transaction savepoint case when then else end with recursive returning asc desc nulls over partition window cascade restrict trigger procedure function returns language declare execute explain analyze vacuum materialized sequence cast collate escape any some top';
const SQL_TYPES = 'int integer bigint smallint tinyint decimal numeric float real double precision varchar char character text date time timestamp timestamptz interval boolean bool serial bigserial uuid json jsonb blob bytea money xml';
LANGS.sql = {
  lineComment: '--', blockComment: ['/*', '*/'],
  modes: {
    root: [WS, [/--.*/, 'com'], [/\/\*/, 'com', 'push:c'], [/'(?:[^']|'')*'?/, 'str'], [/"(?:[^"]|"")*"?/, 'prop'], [/`[^`]*`?/, 'prop'],
      [/[@:$]\w+/, 'var'], [NUM, 'num'], [/\b(?:true|false|unknown)\b/i, 'const'],
      [/[A-Za-z_][\w$]*/, ident({ ci: true, kw: W(SQL_KW), types: W(SQL_TYPES), consts: W('null true false') })],
      [/[+\-*/%=<>!|&^~]+|::/, 'op'], [/[(),;.[\]]/, 'punct']],
    ...BLOCK_C,
  },
};

const PY_ID = ident({ kw: W('and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case'), consts: W('True False None'), builtins: W('print len range int str float list dict set tuple bool type isinstance issubclass super open enumerate zip map filter sorted reversed min max sum abs any all repr iter next hasattr getattr setattr input round format object Exception self cls'), defFn: W('def'), defType: W('class') });
LANGS.python = {
  lineComment: '#',
  modes: {
    root: [WS, [/#.*/, 'com'], [/[rRbBuUfF]{0,2}"""/, 'str', 'push:tdq'], [/[rRbBuUfF]{0,2}'''/, 'str', 'push:tsq'],
      [/[rRbBuUfF]{0,2}"(?:[^"\\\n]|\\.)*"?/, 'str'], [/[rRbBuUfF]{0,2}'(?:[^'\\\n]|\\.)*'?/, 'str'], [/@[\w.]+/, 'meta'], [NUM, 'num'],
      [/[A-Za-z_]\w*/, PY_ID], [/->|[+\-*/%=&|^!<>~@:]+/, 'op'], [/[{}()[\];,.]/, 'punct']],
    tdq: [[/.*?"""/, 'str', 'pop'], [/.+/, 'str']],
    tsq: [[/.*?'''/, 'str', 'pop'], [/.+/, 'str']],
  },
};

LANGS.php = clike({
  kw: W('abstract and array as break callable case catch class clone const continue declare default do echo else elseif empty enddeclare endfor endforeach endif endswitch endwhile enum extends final finally fn for foreach function global goto if implements include include_once instanceof insteadof interface isset list match namespace new or print private protected public readonly require require_once return static switch throw trait try unset use var while xor yield self parent'),
  consts: W('true false null TRUE FALSE NULL __CLASS__ __DIR__ __FILE__ __FUNCTION__ __LINE__ __METHOD__ __NAMESPACE__'),
  builtins: W('strlen count array_map array_filter array_keys array_merge in_array explode implode json_encode json_decode isset sprintf printf str_replace substr trim var_dump die exit'),
  pre: [[/<\?php|<\?=?|\?>/, 'meta'], [/\$[A-Za-z_]\w*/, 'var'], [/#(?!\[).*/, 'com'], [/#\[[^\]]*\]?/, 'meta']],
});

LANGS.java = clike({
  kw: W('abstract assert break case catch class const continue default do else enum extends final finally for goto if implements import instanceof interface native new package private protected public return static strictfp super switch synchronized this throw throws transient try volatile while var record sealed permits yield'),
  types: W('boolean byte char double float int long short void String Object Integer Long Double Boolean List Map Set Optional'),
  consts: W('true false null'),
  pre: [[/"""/, 'str', 'push:tb'], [/@[A-Za-z_][\w.]*/, 'meta']],
  modes: { tb: [[/.*?"""/, 'str', 'pop'], [/.+/, 'str']] },
});
LANGS.csharp = clike({
  kw: W('abstract as base break case catch checked class const continue default delegate do else enum event explicit extern finally fixed for foreach goto if implicit in interface internal is lock namespace new operator out override params private protected public readonly ref return sealed sizeof stackalloc static struct switch this throw try typeof unchecked unsafe using virtual volatile while async await var dynamic get set init record when where yield nameof partial required'),
  types: W('bool byte char decimal double float int long object sbyte short string uint ulong ushort void Task List Dictionary'),
  consts: W('true false null'),
  pre: [[/@"/, 'str', 'push:vs'], [/\$"(?:[^"\\]|\\.)*"?/, 'str'], [/#\s*(?:region|endregion|if|else|elif|endif|define|undef|pragma|nullable)\b.*/, 'meta']],
  modes: { vs: [[/(?:[^"]|"")*"(?!")/, 'str', 'pop'], [/.+/, 'str']] },
});
LANGS.go = clike({
  kw: W('break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var'),
  types: W('bool byte complex64 complex128 error float32 float64 int int8 int16 int32 int64 rune string uint uint8 uint16 uint32 uint64 uintptr any'),
  consts: W('true false nil iota'), builtins: W('append cap close complex copy delete imag len make new panic print println real recover'),
  pre: [[/`/, 'str', 'push:raw']], typeCase: false,
  modes: { raw: [[/[^`]*`/, 'str', 'pop'], [/.+/, 'str']] },
});
LANGS.rust = clike({
  kw: W('as async await break const continue crate dyn else enum extern fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait type unsafe use where while macro_rules'),
  types: W('i8 i16 i32 i64 i128 isize u8 u16 u32 u64 u128 usize f32 f64 bool char str String Vec Option Result Box Rc Arc HashMap HashSet'),
  consts: W('true false None Some Ok Err'),
  pre: [[/#!?\[[^\]]*\]?/, 'meta'], [/r#*"(?:[^"]|"(?!#))*"#*/, 'str'], [/\b[a-z_]\w*!(?=\s*[([{])/, 'fn'], [/'[a-zA-Z_]\w*(?!')/, 'type'], [/"(?:[^"\\]|\\.)*$/, 'str', 'push:rs']],
  charLit: /'(?:[^'\\]|\\.)'/,
  modes: { rs: [[/(?:[^"\\]|\\.)*"/, 'str', 'pop'], [/.+/, 'str']] },
});

const BASH_CMD = ctx => !ctx.prev || (ctx.prev === 'op' && /[|&;(]$/.test(ctx.prevText)) || (ctx.prev === 'kw' && /^(?:then|do|else|sudo|time|exec)$/.test(ctx.prevText));
const BASH_ID = ident({ kw: W('if then else elif fi for while until do done case esac in function select return local export readonly declare unset shift break continue exit source alias time'), consts: W('true false') });
LANGS.bash = {
  lineComment: '#',
  modes: {
    root: [[/^#!.*/, 'meta'], WS, [/#.*/, 'com', null, ctx => ctx.pos === 0 || /\s/.test(ctx.line[ctx.pos - 1])], [/"/, 'str', 'push:bdq'], [/'[^']*'?/, 'str'],
      [/\$\{[^}]*\}?|\$\(|\$[\w@#?$!*-]+/, 'var'], [/--?[A-Za-z][\w-]*/, 'attr', null, ctx => /\s/.test(ctx.line[ctx.pos - 1] || ' ')],
      [/\d+(?=\s|$|[;|&)])/, 'num'], [/[A-Za-z_][\w.:/-]*/, (m, ctx) => BASH_ID(m, ctx) || (BASH_CMD(ctx) ? 'fn' : null)],
      [/&&|\|\||[|&;<>()=!]+/, 'op'], [/[{}[\]]/, 'punct']],
    bdq: [[/\\./, 'str'], [/"/, 'str', 'pop'], [/\$\{[^}]*\}?|\$[\w@#?$!*-]+/, 'var'], [/[^"\\$]+/, 'str'], [/\$/, 'str']],
  },
};

LANGS.yaml = {
  lineComment: '#',
  modes: {
    root: [[/^(?:---|\.\.\.)\s*$/, 'meta'], WS, [/#.*/, 'com', null, ctx => ctx.pos === 0 || /\s/.test(ctx.line[ctx.pos - 1])], [/-(?=\s|$)/, 'punct'],
      [/(?:"(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^\s#:{}[\],"'-][^#:\n]*?|-[^\s#:][^#:\n]*?)(?=\s*:(?:\s|$))/, 'key'],
      [/"(?:[^"\\]|\\.)*"?|'(?:[^']|'')*'?/, 'str'], [/[&*][\w-]+/, 'var'], [/!!?[\w-]+/, 'type'],
      [/(?:true|false|yes|no|on|off|null|~)(?=\s*(?:#|$|,|\]|\}))/i, 'const'], [/[-+]?(?:\d[\d_]*\.?\d*(?:e[+-]?\d+)?|\.inf|\.nan)(?=\s*(?:#|$|,|\]|\}))/i, 'num'],
      [/[|>][-+]?\d*(?=\s*(?:#|$))/, 'punct'], [/[:{}[\],?]/, 'punct'], [/[^\s#,{}[\]][^#,{}[\]]*?(?=\s*(?:#|$|,|\]|\}))/, 'str'], [/\S+/, 'str']],
  },
};

LANGS.markdown = {
  modes: {
    root: [[/^\s*(?:```|~~~).*$/, 'punct', 'push:fence'], [/^#{1,6}\s.*$/, 'heading'], [/^\s*>+/, 'punct'], [/^\s*(?:[-*+]|\d+[.)])(?=\s)/, 'kw'],
      [/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/, 'meta'], [/^\s*\|.*\|\s*$/, 'attr'], [/`[^`]+`?/, 'code'], [/!?\[[^\]]*\]\([^)]*\)?/, 'link'], [/<https?:\/\/[^>]+>/, 'link'],
      [/\*\*[^*]+\*\*|__[^_]+__/, 'bold'], [/\*[^*\s][^*]*\*|\b_[^_\s][^_]*_\b/, 'italic'], [/~~[^~]+~~/, 'del'], [/<\/?[a-zA-Z][^>]*>/, 'tag'],
      [/\\./, 'op'], [/[^`!\[*_~<\\]+/, null], [/./, null]],
    fence: [[/^\s*(?:```|~~~)\s*$/, 'punct', 'pop'], [/.+/, 'code']],
  },
};

/* ── engine ────────────────────────────────────────────────────────── */
const __compiled = new WeakMap();
function compile(g) {
  let c = __compiled.get(g);
  if (c) return c;
  c = { g, modes: Object.create(null) };
  for (const [name, rules] of Object.entries(g.modes)) {
    c.modes[name] = rules.map(([re, t, a, when]) => ({ re: new RegExp(re.source, re.flags.replace(/[gy]/g, '') + 'y'), t, a, when }));
  }
  __compiled.set(g, c);
  return c;
}
function langKey(lang) {
  const l = String(lang || 'plaintext').toLowerCase().replace(/^(?:language-|lang-)/, '');
  return LANGS[l] ? l : ALIASES[l] && LANGS[ALIASES[l]] ? ALIASES[l] : 'plaintext';
}
function grammarOf(lang) { return compile(LANGS[langKey(lang)]); }

function applyAction(stack, a) {
  for (const part of a.split(',')) {
    if (part === 'pop') { if (stack.length > 1) stack.pop(); }
    else if (part.startsWith('push:')) stack.push(part.slice(5));
    else if (part.startsWith('goto:')) stack[stack.length - 1] = part.slice(5);
  }
}

/** tokenizeLine(compiledGrammar, text, stateArray) -> { tokens: [[type, text], ...], state } */
function tokenizeLine(c, line, state) {
  const stack = state && state.length ? state.slice() : ['root'];
  const out = [];
  const ctx = { line, pos: 0, prev: null, prevText: '', stmt: '' };
  const push = (type, text) => { const last = out[out.length - 1]; if (last && last[0] === type) last[1] += text; else out.push([type, text]); };
  let pos = 0, guard = 0;
  while (pos < line.length && guard++ < 20000) {
    const rules = c.modes[stack[stack.length - 1]] || c.modes.root;
    ctx.pos = pos;
    let hit = false;
    for (const r of rules) {
      if (r.when && !r.when(ctx)) continue;
      r.re.lastIndex = pos;
      const m = r.re.exec(line);
      if (!m) continue;
      const text = m[0];
      const act = isFn(r.a) ? r.a(m, ctx) : r.a;
      if (!text && !act) continue;
      if (Array.isArray(r.t)) r.t.forEach((ty, i) => { if (m[i + 1]) push(ty, m[i + 1]); });
      else if (text) push(isFn(r.t) ? r.t(m, ctx) : r.t, text);
      pos += text.length;
      if (act) applyAction(stack, act);
      const last = out[out.length - 1];
      if (text && !/^\s+$/.test(text) && last) {
        ctx.prev = last[0] || 'text'; ctx.prevText = Array.isArray(r.t) ? m[m.length - 1] : text;
        if (/^[;{}]$/.test(text)) ctx.stmt = ''; else if (!ctx.stmt) ctx.stmt = text;
      }
      hit = true;
      break;
    }
    if (!hit) { push(null, line[pos]); pos++; }
  }
  if (pos < line.length) push(null, line.slice(pos));
  return { tokens: out, state: stack };
}

const TK_CLASS = t => 'o-tk-' + t;
/** Render tokens to HTML. decos: [{ from, to, cls }] (character offsets within the line). */
function renderTokens(tokens, decos) {
  if (!decos || !decos.length) {
    let s = '';
    for (const [t, text] of tokens) s += t ? `<span class="${TK_CLASS(t)}">${esc(text)}</span>` : esc(text);
    return s;
  }
  const cuts = new Set();
  decos.forEach(d => { cuts.add(d.from); cuts.add(d.to); });
  let s = '', pos = 0;
  for (const [t, text] of tokens) {
    const end = pos + text.length;
    const pts = [pos, ...[...cuts].filter(x => x > pos && x < end).sort((a, b) => a - b), end];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const piece = text.slice(a - pos, b - pos);
      const dc = decos.filter(d => d.from <= a && d.to >= b && d.to > d.from).map(d => d.cls);
      const c = [t && TK_CLASS(t), ...dc].filter(Boolean).join(' ');
      s += c ? `<span class="${c}">${esc(piece)}</span>` : esc(piece);
    }
    pos = end;
  }
  // zero-width decorations at the end of the line (e.g. an error after the last character)
  decos.filter(d => d.from >= pos).forEach(d => { s += `<span class="${d.cls} is-eol"> </span>`; });
  return s;
}

/** highlightCode(code, lang, { lines }) -> HTML string */
function highlightCode(code, lang, opts = {}) {
  const c = grammarOf(lang);
  const lines = String(code ?? '').replace(/\r\n?/g, '\n').split('\n');
  let state = ['root'];
  const out = lines.map(line => {
    const r = tokenizeLine(c, line, state);
    state = r.state;
    const htmlLine = renderTokens(r.tokens);
    return opts.lines ? `<span class="o-hl-line">${htmlLine}</span>` : htmlLine;
  });
  return out.join('\n');
}

function langFromEl(el) {
  const cand = [el, el.querySelector && el.querySelector(':scope > code'), el.parentElement && el.parentElement.localName === 'pre' ? el.parentElement : null].filter(Boolean);
  for (const e of cand) {
    const v = e.getAttribute('data-o-highlight') || e.getAttribute('data-lang') || e.getAttribute('data-language');
    if (v) return v;
    const m = (e.className || '').match(/\b(?:language|lang)-([\w#+-]+)/);
    if (m) return m[1];
  }
  return 'plaintext';
}
/** highlightElement(pre|code, lang?) — highlight the element's text in place. */
function highlightElement(el, lang) {
  if (!el) return el;
  const target = el.localName === 'pre' && el.querySelector(':scope > code') ? el.querySelector(':scope > code') : el;
  const text = target.textContent;
  const l = langKey(lang || langFromEl(el));
  const lines = el.hasAttribute('data-o-line-numbers') || (el.parentElement && el.parentElement.hasAttribute('data-o-line-numbers'));
  target.innerHTML = highlightCode(text, l, { lines });
  (el.localName === 'code' && el.parentElement && el.parentElement.localName === 'pre' ? el.parentElement : el).classList.add('o-code-hl');
  if (lines) el.classList.add('o-hl-numbered');
  el.setAttribute('data-lang-name', LANG_NAMES[l] || l);
  return el;
}

const hl = (code, lang, opts) => highlightCode(code, lang, opts);
hl.tokenize = (line, lang, state) => tokenizeLine(grammarOf(lang), line, state);
hl.render = renderTokens;
hl.languages = () => Object.keys(LANGS);
hl.names = LANG_NAMES;
hl.resolve = langKey;
hl.grammar = lang => LANGS[langKey(lang)];
hl.compiled = grammarOf;
/** register('ini', grammar, ['cfg']) — add a language. */
hl.register = (name, grammar, aliases = []) => { LANGS[name] = grammar; aliases.forEach(a => { ALIASES[a] = name; }); if (!LANG_NAMES[name]) LANG_NAMES[name] = cap(name); };
hl.element = highlightElement;
O.highlight = hl;
O.highlightElement = highlightElement;

behavior('data-o-highlight', el => {
  const target = el.localName === 'pre' && el.querySelector(':scope > code') ? el.querySelector(':scope > code') : el;
  const text = target.textContent;
  highlightElement(el, el.getAttribute('data-o-highlight') || undefined);
  return () => { if (target.isConnected) target.textContent = text; el.classList.remove('o-code-hl', 'o-hl-numbered'); };
});
