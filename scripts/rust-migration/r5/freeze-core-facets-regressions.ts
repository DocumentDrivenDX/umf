// SPDX-License-Identifier: MIT OR Apache-2.0
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { declareCoreFacets, historicalCoreFacetPatch, inspectCoreFacets, verifyCoreFacetDeclaration, type CoreFacetIdentity } from '../../../src/model/facets';
import type { Document } from '../../../src/model/types';

const source = {
  umf: '0.10.0', id: 'facet-regression', vocabularies: {}, extensions: {},
  modules: [{ id: 'm', namespace: '', elements: [{
    id: 'v', extensions: {}, kind: 'field', scalarType: 'string',
    facets: { length: { min: 2, unit: 'unicode-scalar', future: 'opaque' } },
  }] }],
} as Document;
const identity: CoreFacetIdentity = { module: 'm', element: 'v' };
const declaration = declareCoreFacets(source, identity, {
  length: { max: 8, unit: 'unicode-scalar' },
});
const unicodeSource = structuredClone(source);
unicodeSource.modules[0]!.elements[0]!.scalarType = 'integer';
unicodeSource.modules[0]!.elements[0]!.id = 'element\ud800';
unicodeSource.modules[0]!.elements[0]!.facets = {
  integerWidth: { bits: 8, signed: true, ['future\ud800']: 'opaque' },
};
const unicodeIdentity = { module: 'm', element: 'element\ud800' };
const inspection = inspectCoreFacets(unicodeSource, unicodeIdentity);
const unsafeCurrent = Number('9007199254740992');
const malformedReceipt = { operation: 'declare-core-facets', version: '3.0.0' };
const malformedReceiptOutcome = (() => {
  try { return { ok: verifyCoreFacetDeclaration(malformedReceipt as never, unsafeCurrent as never) }; }
  catch (error) {
    const e = error as { name?: string; code?: string; message?: string; path?: string };
    return { error: { name: e.name ?? 'Error', code: e.code, message: e.message, path: e.path ?? '' } };
  }
})();
const forgedReceipt = structuredClone(declaration) as any;
forgedReceipt.target.id = 'forged-target';
const forgedReceiptOutcome = (() => {
  try { return { ok: verifyCoreFacetDeclaration(forgedReceipt, unsafeCurrent as never) }; }
  catch (error) {
    const e = error as { name?: string; code?: string; message?: string; path?: string };
    return { error: { name: e.name ?? 'Error', code: e.code, message: e.message, path: e.path ?? '' } };
  }
})();
const historicalInputs = [
  { length: { min: 1, max: 8, unit: 'byte', future: true } },
  { integerWidth: { bits: 8, signed: true, future: true } },
  { collectionSize: null },
  { range: { min: { integerToken: '1' }, future: true } },
  { collectionSize: { min: 1.5 } },
  { collectionSize: { min: 1 } },
];
const historicalOutcomes = historicalInputs.map(input => {
  try { return { ok: historicalCoreFacetPatch(input as never) }; }
  catch (error) {
    const e = error as { name?: string; code?: string; message?: string; path?: string };
    return { error: { name: e.name ?? 'Error', code: e.code, message: e.message, path: e.path ?? '' } };
  }
});
const capture = (operation: () => unknown) => {
  try { return { ok: true, value: operation() }; }
  catch (error) {
    const e = error as { name?: string; code?: string; message?: string; path?: string };
    return { ok: false, error: { name: e.name ?? 'Error', code: e.code ?? '', message: e.message ?? String(error), path: e.path ?? '' } };
  }
};
let identityGetterCalls = 0;
const accessorIdentity = { get module() { identityGetterCalls++; return 'm'; }, get element() { identityGetterCalls++; return 'v'; } };
const sourceGetter = { get future() { throw new Error('source getter should be rejected by copy admission'); } };
const invalidRequest = { precision: 2 };
let requestSourceGetterCalls = 0;
const requestOrderSource = { get future() { requestSourceGetterCalls++; return true; } };
const identityInputs = {
  nullIdentity: capture(() => inspectCoreFacets(source, null as never)),
  extraIdentity: capture(() => inspectCoreFacets(source, { module: 'm', element: 'v', future: true } as never)),
  accessorIdentity: capture(() => inspectCoreFacets(source, accessorIdentity as never)),
  accessorGetterCalls: identityGetterCalls,
  sourceAccessorBeforeIdentity: capture(() => inspectCoreFacets(sourceGetter as never, null as never)),
};
const declarationOrder = {
  invalidRequestBeforeSourceCopy: capture(() => declareCoreFacets(requestOrderSource as never, null as never, invalidRequest as never)),
  sourceGetterCalls: requestSourceGetterCalls,
};
const unsafeInteger = { bitsLexeme: '9007199254740992' };
let unsafeIntegerOutcome;
try { unsafeIntegerOutcome = { ok: historicalCoreFacetPatch({ integerWidth: { bits: Number(unsafeInteger.bitsLexeme), signed: true } }) }; }
catch (error) {
  const e = error as { name?: string; code?: string; message?: string; path?: string };
  unsafeIntegerOutcome = { error: { name: e.name ?? 'Error', code: e.code, message: e.message, path: e.path ?? '' } };
}
const sha256 = async (path: string) => createHash('sha256').update(await readFile(path)).digest('hex');
const packet = {
  typescriptSourceSha256: await sha256('src/model/facets.ts'),
  testSourceSha256: await sha256('tests/core/facet-authoring.test.ts'),
  cases: {
    lengthMerge: { source, identity, request: { length: { max: 8, unit: 'unicode-scalar' } }, outcome: declaration },
    historical: historicalInputs.map((input, index) => ({ input, outcome: historicalOutcomes[index] })),
    unsafeIntegerCopyRefusal: { bitsLexeme: unsafeInteger.bitsLexeme, outcome: unsafeIntegerOutcome },
    verifyMalformedBeforeCurrentCopy: { receipt: malformedReceipt, currentNumberLexeme: '9007199254740992', outcome: malformedReceiptOutcome },
    verifyForgedBeforeCurrentCopy: { receipt: forgedReceipt, currentNumberLexeme: '9007199254740992', outcome: forgedReceiptOutcome },
    loneSurrogateQualifier: { source: unicodeSource, identity: unicodeIdentity, outcome: inspection },
    identityInputs,
    declarationOrder,
  },
};
await writeFile('/private/tmp/r5-core-facets-regression-cases.json', JSON.stringify(packet) + '\n');
