// SPDX-License-Identifier: MIT OR Apache-2.0
import {readFile, writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {encodeRequestWire} from '@umf/core-rust-native/src/wire.js';

const repo = resolve(process.argv[2]);
const receiptPath = resolve(process.argv[3]);
const readJson = async path => JSON.parse(await readFile(resolve(repo, path), 'utf8'));
const resources = {
  coreSchema: await readJson('spec/core/schema.json'),
  referenceSchema: await readJson('spec/core/semantic-type-reference.schema.json'),
  packageSchema: await readJson('spec/core/extension-package.schema.json'),
  constraints: await readJson('spec/metamodel/generated/core-constraints.json'),
  domainPolicy: await readJson('spec/metamodel/generated/domain-policy.json'),
};
const source = await readJson('spec/domain-packs/medical/ontology.json');
const {createCoreModelEngine} = await import('@umf/core-rust-native');
const engine = createCoreModelEngine(resources);
const require = createRequire(import.meta.url);
const addon = require('@umf/core-rust-native/umf_core_node.node');
const encoder = new TextEncoder();
const capture = run => {
  try { return {status: 'accepted', value: run()}; }
  catch (error) { return {status: 'refused', code: error?.code ?? null, path: error?.path ?? '', message: error?.message ?? String(error)}; }
};
const request = (token, sourceContext = {source: 'original.csv', row: 1, unknown: ['雪', null]}) => ({
  profile: 'umf.csv-boolean-lexical/1.0.0',
  field: {module: 'domain', element: 'patients.active'},
  token,
  sourceContext,
});
const outcomes = {};
for (const [token, boolean] of [['true', true], ['false', false], ['True', true], ['False', false]]) {
  const receipt = engine.validateCsvBooleanLexical(source, request(token));
  if (receipt.value.boolean !== boolean) throw new Error(`token result mismatch: ${token}`);
  if (engine.verifyCsvBooleanLexical(receipt, source, request(token)).value.boolean !== boolean) throw new Error(`verify mismatch: ${token}`);
  outcomes[`token:${token}`] = {boolean, validation: receipt.validation};
}

let getterCalls = 0;
const unreadSource = Object.defineProperty({}, 'umf', {enumerable: true, get() { getterCalls++; return '0.10.0'; }});
outcomes.malformedReceiptBeforeExpectedInputs = {
  refusal: capture(() => engine.verifyCsvBooleanLexical({}, unreadSource, request('true'))),
  getterCalls,
};
const validReceipt = engine.validateCsvBooleanLexical(source, request('true'));
outcomes.crossedInvalidExpectedSourceAndRequest = capture(() => engine.verifyCsvBooleanLexical(
  validReceipt,
  {},
  {...request('true'), profile: 'future'},
));

const astralAndLone = request('True', {opaque: 'astral:😀; lone:\ud800'});
const echoed = engine.validateCsvBooleanLexical(source, astralAndLone);
if (echoed.request.sourceContext.opaque !== astralAndLone.sourceContext.opaque) throw new Error('UTF-16 host round trip changed astral/lone-surrogate text');
outcomes.astralAndLoneSurrogatePreserved = true;

const missingToken = {
  profile: 'umf.csv-boolean-lexical/1.0.0',
  field: {module: 'domain', element: 'patients.active'},
  sourceContext: '',
};
const pairSize = requestValue => encoder.encode(JSON.stringify({source, request: requestValue})).length;
const exactPairContext = 'x'.repeat(4_000_000 - pairSize(missingToken));
const exactPair = {...missingToken, sourceContext: exactPairContext};
const overPair = {...missingToken, sourceContext: `${exactPairContext}x`};
outcomes.sourceRequestByteCeiling = {
  exactBytes: pairSize(exactPair),
  exact: capture(() => engine.validateCsvBooleanLexical(source, exactPair)),
  overBytes: pairSize(overPair),
  over: capture(() => engine.validateCsvBooleanLexical(source, overPair)),
};

const emptyReceipt = engine.validateCsvBooleanLexical(source, request('true', ''));
const emptyReceiptBytes = encoder.encode(JSON.stringify(emptyReceipt)).length;
const exactReceiptRequest = request('true', 'x'.repeat(4_000_000 - emptyReceiptBytes));
const overReceiptRequest = request('true', `${exactReceiptRequest.sourceContext}x`);
outcomes.fullReceiptByteCeiling = {
  exactBytes: encoder.encode(JSON.stringify(engine.validateCsvBooleanLexical(source, exactReceiptRequest))).length,
  exact: capture(() => engine.validateCsvBooleanLexical(source, exactReceiptRequest)).status,
  over: capture(() => engine.validateCsvBooleanLexical(source, overReceiptRequest)),
};

const directPayload = {
  op: 'model/finishCsvBooleanLexicalVerification',
  resources,
  registry: [],
  preparedReceipt: {untrusted: true},
  source,
  csvRequest: request('true'),
};
const directResponse = JSON.parse(addon.executeRequestWire(encodeRequestWire(directPayload), 'cooperative', () => ''));
if (directResponse.status !== 'error' || directResponse.code !== 'CSV_BOOLEAN_LEXICAL') throw new Error('direct-wire forged prepared receipt was accepted');
outcomes.directWireForgedPreparedReceipt = {status: directResponse.status, code: directResponse.code, messageUnits: directResponse.messageUnits};

const sha = async path => createHash('sha256').update(await readFile(path)).digest('hex');
const packageRoot = resolve(require.resolve('@umf/core-rust-native'));
const addonPath = require.resolve('@umf/core-rust-native/umf_core_node.node');
const receipt = {
  format: 'umf-r5-csv-boolean-lexical-installed-node/1',
  runtime: {node: process.version, bun: process.versions.bun ?? null},
  packageEntry: pathToFileURL(packageRoot).href,
  nativeArtifactSha256: await sha(addonPath),
  outcomes,
};
await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify(receipt));
