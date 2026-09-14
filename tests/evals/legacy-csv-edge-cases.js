/* legacy-csv-edge-cases.js — salvaged from .tmp/eval-csv-edge.js (docs/components/export-import.html).
 * Orion.csv.parse()/detect()/stringify() edge cases: a quoted field containing a comma, an embedded
 * newline inside quotes, a UTF-8 BOM prefix, semicolon auto-detection vs an explicit delimiter, and a
 * stringify -> reparse round trip that also guards formula-injection values. The original script only
 * dumped these results for eyeballing; the expected values below follow directly from the literal input.
 */
(async () => {
  const out = {};

  const csv1 = 'name,note\n"Smith, John",Hello\nBob,World';
  const r1 = Orion.csv.parse(csv1, { header: true });
  out.quotedComma = { rows: r1.rows, errors: r1.errors };

  const csv2 = 'name,note\n"Multi","Line one\nLine two"\nBob,Simple';
  const r2 = Orion.csv.parse(csv2, { header: true });
  out.embeddedNewline = { rows: r2.rows, errors: r2.errors };

  const csv3 = '﻿name,city\nAda,Paris\nZoë,Münich';
  const r3 = Orion.csv.parse(csv3, { header: true });
  out.bom = { fields: r3.fields, rows: r3.rows, firstFieldCharCode: r3.fields[0].charCodeAt(0) };

  const csv4 = 'id;name;amount\n1;Ada;123,45\n2;Bob;67,00';
  const r4 = Orion.csv.parse(csv4, { header: true });
  out.semicolon = { delimiter: r4.meta.delimiter, rows: r4.rows };

  const r4b = Orion.csv.parse(csv4, { header: true, delimiter: ';' });
  out.semicolonExplicit = { delimiter: r4b.meta.delimiter, rows: r4b.rows };

  out.detect = { comma: Orion.csv.detect('a,b,c\n1,2,3'), semi: Orion.csv.detect('a;b;c\n1;2;3'), tab: Orion.csv.detect('a\tb\tc\n1\t2\t3'), pipe: Orion.csv.detect('a|b|c\n1|2|3') };

  const rows = [{ a: 'plain', b: '=SUM(A1:A2)', c: 'has, comma', d: 'quote"inside', e: 5, f: -12.5, g: null }];
  const csvOut = Orion.csv.stringify(rows, { columns: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] });
  out.stringify = csvOut;
  const reparsed = Orion.csv.parse(csvOut, { header: false });
  out.stringifyReparsed = reparsed.rows;
  const rr = reparsed.rows[1]; // rows[0] is the literal "a,b,c,d,e,f,g" header line, since header:false parses it as data too

  const ok = r1.errors.length === 0 && r1.rows[0].name === 'Smith, John' && r1.rows[0].note === 'Hello' && r1.rows[1].name === 'Bob'
    && r2.errors.length === 0 && r2.rows[0].name === 'Multi' && r2.rows[0].note === 'Line one\nLine two' && r2.rows[1].name === 'Bob'
    && r3.fields[0] === 'name' && r3.fields.length === 2 && r3.rows[0].name === 'Ada' && r3.rows[1].city === 'Münich'
    && r4.meta.delimiter === ';' && r4.rows[0].id === '1' && r4.rows[0].amount === '123,45'
    && r4b.meta.delimiter === ';' && JSON.stringify(r4b.rows) === JSON.stringify(r4.rows)
    && out.detect.comma === ',' && out.detect.semi === ';' && out.detect.tab === '\t' && out.detect.pipe === '|'
    && rr[0] === 'plain' && /^'?=SUM/.test(rr[1]) && rr[2] === 'has, comma' && rr[3] === 'quote"inside' && rr[4] === '5' && rr[5] === '-12.5';
  return { ok, ...out };
})()
