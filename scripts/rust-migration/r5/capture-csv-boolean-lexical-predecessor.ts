// SPDX-License-Identifier: MIT OR Apache-2.0
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {readDocument} from '../../../src/model/document';
import {
  validateCsvBooleanLexical,
  verifyCsvBooleanLexical,
  type CsvBooleanLexicalRequest,
} from '../../../src/model/csv-boolean-lexical';
import {boundedJsonBytes} from '../../../src/model/internal/json-byte-budget';

const repo = new URL('../../../', import.meta.url);
const evidence = new URL('../../../docs/helix/04-build/evidence/rust-migration/r5-csv-boolean-lexical/pre-binding-freeze.json', import.meta.url);
const captureOutput = new URL('file:///private/tmp/umf-r5-csv-boolean-lexical-prebinding-freeze.json');
const readText = async (path: string) => readFile(new URL(path, repo), 'utf8');
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const source = readDocument(await readText('spec/domain-packs/medical/ontology.json'), 'json');
const request = (token: CsvBooleanLexicalRequest['token'], sourceContext: unknown = {source: 'original.csv', row: 1, column: 'active', unknown: {retained: ['雪', null]}}): CsvBooleanLexicalRequest => ({
  profile: 'umf.csv-boolean-lexical/1.0.0',
  field: {module: 'domain', element: 'patients.active'},
  token,
  sourceContext: sourceContext as CsvBooleanLexicalRequest['sourceContext'],
});
const capture = (run: () => unknown) => {
  try { return {status: 'accepted', value: run()}; }
  catch (error) {
    const e = error as Error & {code?: string; path?: string};
    return {status: 'refused', name: e.name, code: e.code ?? null, path: e.path ?? '', message: e.message};
  }
};
const summarize = (receipt: ReturnType<typeof validateCsvBooleanLexical>) => ({
  operation: receipt.operation,
  version: receipt.version,
  token: receipt.request.token,
  boolean: receipt.value.boolean,
  validation: receipt.validation,
  provenance: receipt.provenance,
});

const outcomes: Record<string, unknown> = {};
for (const token of ['true', 'false', 'True', 'False'] as const) {
  outcomes[`token:${token}`] = summarize(validateCsvBooleanLexical(source, request(token)));
}

const constrained = structuredClone(source);
constrained.modules[0]!.elements.find(e => e.id === 'patients.active')!.allowedValues = [{boolean: false}];
outcomes.allowedValueMismatch = summarize(validateCsvBooleanLexical(constrained, request('True')));
const unknown = structuredClone(source);
(unknown.modules[0]!.elements.find(e => e.id === 'patients.active') as any).facets = {futureBooleanRule: {meaning: 'unknown'}};
outcomes.unknownSelectedSemantics = summarize(validateCsvBooleanLexical(unknown, request('true')));
outcomes.wrongFieldKind = capture(() => validateCsvBooleanLexical(source, {...request('true'), field: {module: 'domain', element: 'patients.birth_date'}} as any));
const arrayField = structuredClone(source);
arrayField.modules[0]!.elements.find(e => e.id === 'patients.active')!.cardinality = 'array';
outcomes.wrongFieldCardinality = capture(() => validateCsvBooleanLexical(arrayField, request('true')));
outcomes.unsupportedToken = capture(() => validateCsvBooleanLexical(source, {...request('true'), token: 'TRUE'} as any));

// The byte ceiling is applied before request-schema admission. A malformed
// request at exactly 4,000,000 bytes reaches the closed-schema refusal; one
// extra UTF-8 byte reaches the byte-limit refusal first.
const inputRequest = (context: string) => ({
  profile: 'umf.csv-boolean-lexical/1.0.0',
  field: {module: 'domain', element: 'patients.active'},
  sourceContext: context,
});
const inputBase = inputRequest('');
const inputBaseBytes = boundedJsonBytes({source, request: inputBase} as any);
const exactInputText = 'x'.repeat(4_000_000 - inputBaseBytes);
const exactInput = inputRequest(exactInputText);
const overInput = inputRequest(`${exactInputText}x`);
outcomes.inputByteLimit = {
  limit: 4_000_000,
  exactPairBytes: boundedJsonBytes({source, request: exactInput} as any),
  exact: capture(() => validateCsvBooleanLexical(source, exactInput as any)),
  overPairBytes: boundedJsonBytes({source, request: overInput} as any, 4_000_001),
  over: capture(() => validateCsvBooleanLexical(source, overInput as any)),
};

// A valid operation receipt has fixed envelope overhead. Grow only the
// retained sourceContext string to exercise exact full-receipt byte admission.
const emptyReceipt = validateCsvBooleanLexical(source, request('true', ''));
const emptyReceiptBytes = boundedJsonBytes(emptyReceipt as any);
const receiptContextAtLimit = 'x'.repeat(4_000_000 - emptyReceiptBytes);
const requestAtLimit = request('true', receiptContextAtLimit);
const requestOverLimit = request('true', `${receiptContextAtLimit}x`);
const receiptAtLimit = validateCsvBooleanLexical(source, requestAtLimit);
outcomes.receiptByteLimit = {
  limit: 4_000_000,
  exactReceiptBytes: boundedJsonBytes(receiptAtLimit as any),
  exact: 'accepted',
  over: capture(() => validateCsvBooleanLexical(source, requestOverLimit)),
};

let expectedSourceReads = 0;
const unreadExpectedSource = Object.defineProperty({}, 'umf', {enumerable: true, get() { expectedSourceReads++; return '0.10.0'; }});
outcomes.invalidReceiptBeforeExpectedInput = {
  result: capture(() => verifyCsvBooleanLexical({} as any, unreadExpectedSource as any, request('true'))),
  expectedSourceReads,
};

const validReceipt = validateCsvBooleanLexical(source, request('true'));
let validReceiptExpectedReads = 0;
const guardedExpectedSource = Object.defineProperty({}, 'umf', {enumerable: true, get() { validReceiptExpectedReads++; return '0.10.0'; }});
outcomes.validReceiptThenExpectedGetter = {
  result: capture(() => verifyCsvBooleanLexical(validReceipt, guardedExpectedSource as any, request('true'))),
  expectedSourceReads: validReceiptExpectedReads,
};

// Malformed request shape wins over selected-source semantics after both
// plain JSON snapshots and the pair byte check have completed.
outcomes.requestShapeBeforeSourceInspection = capture(() => validateCsvBooleanLexical({} as any, {...request('true'), profile: 'future'} as any));

const frozen = {
  format: 'umf-r5-csv-boolean-lexical-prebinding/1',
  runtime: {bun: Bun.version},
  sourceHashes: {
    'src/model/csv-boolean-lexical.ts': hash(await readText('src/model/csv-boolean-lexical.ts')),
    'src/model/internal/json-byte-budget.ts': hash(await readText('src/model/internal/json-byte-budget.ts')),
    'tests/csv-boolean-lexical.test.ts': hash(await readText('tests/csv-boolean-lexical.test.ts')),
    'spec/core/csv-boolean-lexical-operation.schema.json': hash(await readText('spec/core/csv-boolean-lexical-operation.schema.json')),
    'spec/domain-packs/medical/ontology.json': hash(await readText('spec/domain-packs/medical/ontology.json')),
  },
  outcomes,
};

if (Bun.argv.includes('--check')) {
  const existing = JSON.parse(await readFile(evidence, 'utf8'));
  if (JSON.stringify(existing) !== JSON.stringify(frozen)) throw new Error('CSV Boolean lexical frozen predecessor drift');
  console.log(JSON.stringify({status: 'current', format: frozen.format, sourceHashes: frozen.sourceHashes}));
} else {
  await writeFile(captureOutput, `${JSON.stringify(frozen, null, 2)}\n`);
  console.log(`Captured candidate to ${captureOutput.pathname}; review and update the checked-in freeze explicitly.`);
}
