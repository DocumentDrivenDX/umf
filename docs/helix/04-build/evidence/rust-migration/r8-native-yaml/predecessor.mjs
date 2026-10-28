import { writeFile } from 'node:fs/promises';
import { parseNativeYaml } from '../../../../../../src/model/native-json.ts';

const cases = [
  ['default-boolean-true', 'value: true'],
  ['default-boolean-case', 'value: True\nother: TRUE'],
  ['default-boolean-false', 'value: false\nother: False\nlast: FALSE'],
  ['yaml12-legacy-boolean-words', 'yes: yes\non: on\nno: no\noff: off'],
  ['yaml12-null-words', 'null: null\ntilde: ~\nempty:'],
  ['date-default-string', 'value: 2024-02-29'],
  ['exact-numbers', 'plus: +001\nnegative-zero: -0\nfraction: .5\ntrailing-dot: 1.\nexponent: 1e3\nlarge: 9007199254740992'],
  ['radix-and-unsupported', 'hex: 0x10\noctal: 0o10\nbinary: 0b10\nsigned-hex: +0x10\nunderscored: 1_000'],
  ['unsafe-integer-preserved', 'value: 999999999999999999999999999999999999999999'],
  ['duplicate-key', 'x: 1\nx: 2'],
  ['duplicate-after-bad-syntax', 'x: 1\nx: 2\ny: ['],
  ['duplicate-after-tag', 'x: !!str value\nx: next'],
  ['duplicate-after-alias', 'x: &a hi\ny: *a\nx: next'],
  ['alias', 'x: &a hi\ny: *a'],
  ['unused-anchor', 'x: &a hi'],
  ['explicit-value-tag', 'x: !!str 1'],
  ['explicit-key-tag', '!!str x: one'],
  ['numeric-key', '1: value'],
  ['timestamp-like-key', '2024-02-29: value'],
  ['malformed-sequence', 'x: [1,'],
  ['multiple-documents', 'x: 1\n---\ny: 2'],
  ['astral-string', 'value: "😀"'],
  ['integer-index-key-order', '10: ten\n2: two\nname: text'],
  ['yaml11-boolean-lexicon', 'a: yes\nb: ON\nc: no\nd: OFF', { version: '1.1' }],
  ['yaml11-date-unsupported', 'value: 2024-02-29', { version: '1.1' }],
  ['yaml11-date-as-string', 'value: 2024-02-29', { version: '1.1', dateOnly: 'string' }],
  ['yaml11-time-as-string', 'value: 2024-02-29T12:30:00Z', { version: '1.1', dateOnly: 'string' }],
  ['yaml11-pyyaml-boolean-lexicon', 'a: y\nb: n\nc: yes\nd: on', { version: '1.1', booleanLexicon: 'pyyaml' }],
  ['invalid-version-option', 'x: true', { version: '1.0' }],
  ['empty-stream', ''],
];

const results = cases.map(([id, source, options]) => {
  try {
    return { id, source, ...(options ? { options } : {}), outcome: 'return', tree: parseNativeYaml(source, options) };
  } catch (error) {
    return { id, source, ...(options ? { options } : {}), outcome: 'throw', code: error.code, message: error.message };
  }
});

const packet = {
  profile: 'umf-r8-native-yaml-predecessor/0.1.0',
  source: 'src/model/native-json.ts parseNativeYaml; direct TypeScript predecessor',
  cases: results,
};
await writeFile(new URL('./predecessor.json', import.meta.url), `${JSON.stringify(packet, null, 2)}\n`);
console.log(JSON.stringify({ cases: results.length, returns: results.filter(x => x.outcome === 'return').length, throws: results.filter(x => x.outcome === 'throw').length }));
