// SPDX-License-Identifier: MIT OR Apache-2.0
// Native Node replay of the retained R5 Kind/Nullability success and refusal packets.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createCoreKindNullabilityHostInputEngine} from '../../../../bindings/core/node/index.js';

const read = async path => JSON.parse(await readFile(path, 'utf8'));
const normalize = value => JSON.parse(JSON.stringify(value));
const capture = run => {
  try { return {ok: true, value: run()}; }
  catch (error) {
    return {ok: false, error: {code: error?.code ?? '', message: error?.message ?? String(error), path: error?.path ?? ''}};
  }
};
const [source, surrogate, successOracle, refusalOracle, coreSchema, referenceSchema, packageSchema, constraints, domainPolicy] = await Promise.all([
  read('scripts/rust-migration/r5/kind-nullability/input.json'),
  read('scripts/rust-migration/r5/kind-nullability/surrogate-input.json'),
  read('scripts/rust-migration/r5/kind-nullability/frozen-typescript.json'),
  read('scripts/rust-migration/r5/kind-nullability/frozen-refusals.json'),
  read('spec/core/schema.json'),
  read('spec/core/semantic-type-reference.schema.json'),
  read('spec/core/extension-package.schema.json'),
  read('spec/metamodel/generated/core-constraints.json'),
  read('spec/metamodel/generated/domain-policy.json'),
]);
const engine = createCoreKindNullabilityHostInputEngine({coreSchema, referenceSchema, packageSchema, constraints, domainPolicy});
const kindReceipt = engine.declareCoreElementKind(source, {module: 'm', element: 'missing'}, 'field');
const nullReceipt = engine.declareCoreNullability(source, {module: 'm', element: 'missing'}, 'absent-allowed');
const successes = {
  kind_inspect_known: capture(() => engine.inspectCoreElementKind(source, {module: 'm', element: 'known'})),
  kind_inspect_unspecified: capture(() => engine.inspectCoreElementKind(source, {module: 'm', element: 'kindless'})),
  kind_declare: capture(() => kindReceipt),
  kind_verify: capture(() => engine.verifyCoreKindDeclaration(kindReceipt, kindReceipt.target)),
  nullability_inspect_missing: capture(() => engine.inspectCoreNullability(source, {module: 'm', element: 'missing'})),
  nullability_inspect_known: capture(() => engine.inspectCoreNullability(source, {module: 'm', element: 'known'})),
  nullability_inspect_inapplicable: capture(() => engine.inspectCoreNullability(source, {module: 'm', element: 'record'})),
  nullability_declare: capture(() => nullReceipt),
  nullability_verify: capture(() => engine.verifyCoreNullabilityDeclaration(nullReceipt, nullReceipt.target)),
  kind_surrogate_identity_inspect: capture(() => engine.inspectCoreElementKind(surrogate, {module: '\ud800', element: '\ud800'})),
  nullability_surrogate_identity_inspect: capture(() => engine.inspectCoreNullability(surrogate, {module: '\ud800', element: '\ud800'})),
};
assert.deepEqual(Object.fromEntries(Object.entries(successes).map(([name, result]) => [name, result.ok ? normalize(result.value) : result])), successOracle, 'all frozen success envelopes');

const invalid = structuredClone(source);
invalid.modules[0].elements[0].id = '';
invalid.modules.push(structuredClone(invalid.modules[0]));
const conflict = structuredClone(source);
conflict.modules[0].elements[0].scalarType = 'integer';
const forgedKind = structuredClone(kindReceipt); delete forgedKind.identity;
const forgedNullability = structuredClone(nullReceipt); delete forgedNullability.identity;
const invalidKindSource = structuredClone(kindReceipt); invalidKindSource.source = {};
const invalidKindTarget = structuredClone(kindReceipt); invalidKindTarget.target = {};
const invalidNullabilitySource = structuredClone(nullReceipt); invalidNullabilitySource.source = {};
const invalidNullabilityTarget = structuredClone(nullReceipt); invalidNullabilityTarget.target = {};
const staleKind = structuredClone(kindReceipt); staleKind.target.id = 'stale';
const staleNullability = structuredClone(nullReceipt); staleNullability.target.id = 'stale';
const refusals = {
  sourceInvalidKind: capture(() => engine.inspectCoreElementKind(invalid, {module: 'm', element: 'known'})),
  sourceInvalidNullability: capture(() => engine.inspectCoreNullability(invalid, {module: 'm', element: 'known'})),
  kindConflict: capture(() => engine.declareCoreElementKind(conflict, {module: 'm', element: 'known'}, 'record')),
  malformedKindReceipt: capture(() => engine.verifyCoreKindDeclaration(forgedKind, kindReceipt.target)),
  malformedNullabilityReceipt: capture(() => engine.verifyCoreNullabilityDeclaration(forgedNullability, nullReceipt.target)),
  invalidKindReceiptSource: capture(() => engine.verifyCoreKindDeclaration(invalidKindSource, kindReceipt.target)),
  invalidKindReceiptTarget: capture(() => engine.verifyCoreKindDeclaration(invalidKindTarget, kindReceipt.target)),
  invalidNullabilityReceiptSource: capture(() => engine.verifyCoreNullabilityDeclaration(invalidNullabilitySource, nullReceipt.target)),
  invalidNullabilityReceiptTarget: capture(() => engine.verifyCoreNullabilityDeclaration(invalidNullabilityTarget, nullReceipt.target)),
  staleKindReceipt: capture(() => engine.verifyCoreKindDeclaration(kindReceipt, staleKind.target)),
  staleNullabilityReceipt: capture(() => engine.verifyCoreNullabilityDeclaration(nullReceipt, staleNullability.target)),
  nullabilityRole: capture(() => engine.declareCoreNullability(source, {module: 'm', element: 'record'}, 'required')),
  missingIdentity: capture(() => engine.inspectCoreElementKind(source, {module: 'absent', element: 'absent'})),
};
assert.deepEqual(normalize(refusals), refusalOracle, 'all frozen refusal envelopes');
console.log(JSON.stringify({status: 'node-frozen-parity-passed', successes: Object.keys(successes).length, refusals: Object.keys(refusals).length, runtime: process.version, platform: process.platform, arch: process.arch}));
