// SPDX-License-Identifier: MIT OR Apache-2.0
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  declareCoreRelationship,
  inspectCoreRelationships,
  lookupCoreRelationship,
  verifyCoreRelationshipOperation,
} from '../../../src/model/relationships';
import { readJsonValue, writeJsonValue } from '../../../src/model/serialization';
import { relationshipCandidate } from '../../core-relationship-cases';
import { relationshipRequest } from '../../core-relationship-operation-cases';

const root = resolve(import.meta.dir, '../../..');
const closure = [
  'src/model/relationships.ts',
  'src/model/json.ts',
  'src/model/errors.ts',
  'src/model/serialization.ts',
  'src/model/types.ts',
  'src/validation/relationships.ts',
  'src/validation/document.ts',
  'src/validation/schema.ts',
  'src/validation/internal-schema.ts',
  'src/generated/core-model.ts',
  'src/generated/core-validators.ts',
  'spec/core/schema.json',
  'spec/core/relationship-operation.schema.json',
  'spec/core/relationship-operation-v3.schema.json',
  'spec/metamodel/generated/core-constraints.json',
  'spec/metamodel/generated/domain-policy.json',
  'scripts/core-relationship-cases.ts',
  'scripts/core-relationship-operation-cases.ts',
];
const hashes = Object.fromEntries(await Promise.all(closure.map(async path => [
  path,
  createHash('sha256').update(await readFile(resolve(root, path))).digest('hex'),
])));
const canonical = (value: unknown): string => Array.isArray(value)
  ? '[' + value.map(canonical).join(',') + ']'
  : value !== null && typeof value === 'object'
    ? '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical((value as Record<string, unknown>)[key])).join(',') + '}'
    : JSON.stringify(value);
const record = { module: 'm', element: 'Order' };
const base = relationshipCandidate();
const old = base.modules[0]!.relationships![0]!;
const request = relationshipRequest(old);
const known = structuredClone(base);
const noRelationships = structuredClone(base);
delete noRelationships.modules[0]!.relationships;
const future = structuredClone(base);
(future.modules[0]!.relationships![0] as any)['a/b~c'] = { retained: true };
(future.modules[0]!.relationships![0]!.sourceMultiplicity as any).future = 'retain';
(future.modules[0]!.relationships![0]!.target[0] as any)['a/b~c😀'] = { opaque: ['retain', 1] };
const futureLifecycle = structuredClone(future);
(futureLifecycle.modules[0]!.relationships![0] as any).targetLifecycle = 'future-lifecycle';
const futurePath = '/modules/0/relationships/0/target/0/a~1b~0c😀';
const unknownUpdate = structuredClone(future.modules[0]!.relationships![0]!);
const presentationRequest = relationshipRequest(unknownUpdate);
presentationRequest.name = 'Renamed 😀';
presentationRequest.inverse = null;
const changedMeaningRequest = relationshipRequest(unknownUpdate);
changedMeaningRequest.targetMultiplicity.min = 0;
const conflictRequest = relationshipRequest(old);
conflictRequest.target[0]!.key = 'account-number';
const newRequest = relationshipRequest({
  ...old,
  id: 'new-relationship',
  name: 'New relationship 😀',
  source: [{ module: 'm', element: 'Order' }],
  target: [{ module: 'm', element: 'Product', key: 'identity' }],
  targetLifecycle: 'independent',
  inverse: undefined,
  associationRecord: undefined,
});
const aggregateOutputSource = structuredClone(noRelationships) as any;
aggregateOutputSource.unknownPayload = Array.from({ length: 60_000 }, () => null);

const cases: Record<string, () => unknown> = {
  inspect_known: () => inspectCoreRelationships(known, { module: 'm' }),
  inspect_missing: () => inspectCoreRelationships(noRelationships, { module: 'm' }),
  lookup_stable_id: () => lookupCoreRelationship(known, { module: 'm', id: old.id }),
  inspect_unknown_meaning: () => inspectCoreRelationships(future, { module: 'm' }),
  lookup_unknown_meaning: () => lookupCoreRelationship(future, { module: 'm', id: old.id }),
  author_new_relationship: () => declareCoreRelationship(noRelationships, { module: 'm' }, newRequest),
  aggregate_output_limit_refusal: () => declareCoreRelationship(aggregateOutputSource, { module: 'm' }, newRequest),
  presentation_edit_preserves_unknowns: () => declareCoreRelationship(future, { module: 'm' }, presentationRequest),
  unknown_meaning_edit_refused: () => declareCoreRelationship(future, { module: 'm' }, changedMeaningRequest),
  stable_id_endpoint_change_refused: () => declareCoreRelationship(known, { module: 'm' }, conflictRequest),
  lookup_absent_id: () => lookupCoreRelationship(known, { module: 'm', id: 'missing' }),
  invalid_identity_before_invalid_source: () => inspectCoreRelationships({ umf: 'bad' } as never, { module: '' }),
  invalid_lookup_identity_before_invalid_source: () => lookupCoreRelationship({ umf: 'bad' } as never, { module: 'm', id: 7 } as never),
  invalid_request_before_invalid_source: () => declareCoreRelationship({ umf: 'bad' } as never, { module: 'm' }, { id: '', name: '' } as never),
  old_core_version_refused: () => inspectCoreRelationships({ ...known, umf: '0.7.0' } as never, { module: 'm' }),
  future_lifecycle_edit_refused: () => declareCoreRelationship(futureLifecycle, { module: 'm' }, request),
  unknown_path_utf16_and_pointer_escape: () => ({
    view: lookupCoreRelationship(future, { module: 'm', id: old.id }),
    expectedPath: futurePath,
  }),
};

const inputs: Record<string, unknown> = {
  inspect_known: { source: known, identity: { module: 'm' } },
  inspect_missing: { source: noRelationships, identity: { module: 'm' } },
  lookup_stable_id: { source: known, identity: { module: 'm', id: old.id } },
  inspect_unknown_meaning: { source: future, identity: { module: 'm' } },
  lookup_unknown_meaning: { source: future, identity: { module: 'm', id: old.id } },
  author_new_relationship: { source: noRelationships, identity: { module: 'm' }, request: newRequest },
  aggregate_output_limit_refusal: { source: aggregateOutputSource, identity: { module: 'm' }, request: newRequest },
  presentation_edit_preserves_unknowns: { source: future, identity: { module: 'm' }, request: presentationRequest },
  unknown_meaning_edit_refused: { source: future, identity: { module: 'm' }, request: changedMeaningRequest },
  stable_id_endpoint_change_refused: { source: known, identity: { module: 'm' }, request: conflictRequest },
  lookup_absent_id: { source: known, identity: { module: 'm', id: 'missing' } },
  invalid_identity_before_invalid_source: { source: { umf: 'bad' }, identity: { module: '' } },
  invalid_lookup_identity_before_invalid_source: { source: { umf: 'bad' }, identity: { module: 'm', id: 7 } },
  invalid_request_before_invalid_source: { source: { umf: 'bad' }, identity: { module: 'm' }, request: { id: '', name: '' } },
  old_core_version_refused: { source: { ...known, umf: '0.7.0' }, identity: { module: 'm' } },
  future_lifecycle_edit_refused: { source: futureLifecycle, identity: { module: 'm' }, request },
  unknown_path_utf16_and_pointer_escape: { source: future, identity: { module: 'm', id: old.id }, expectedPath: futurePath },
};

const outcomes: Record<string, unknown> = Object.fromEntries(Object.entries(cases).map(([name, run]) => {
  try { return [name, { ok: true, value: run() }]; }
  catch (error) {
    const e = error as { code?: string; message?: string; path?: string };
    return [name, { ok: false, error: { code: e.code ?? '', message: e.message ?? String(error), path: e.path ?? '' } }];
  }
}));

const declaration = declareCoreRelationship(noRelationships, { module: 'm' }, newRequest);
for (const format of ['json', 'yaml'] as const) {
  const saved = readJsonValue(writeJsonValue(declaration, format), format) as never;
  outcomes[`verify_roundtrip_${format}`] = { ok: true, value: verifyCoreRelationshipOperation(saved, declaration.target) };
}
const beforeCopy = canonical(noRelationships);
const isolated = declareCoreRelationship(noRelationships, { module: 'm' }, newRequest);
isolated.target.modules[0]!.relationships![0]!.name = 'mutated output';
outcomes.copy_isolation = { sourceUnchanged: canonical(noRelationships) === beforeCopy };
const aggregateBefore = canonical(aggregateOutputSource);
try {
  declareCoreRelationship(aggregateOutputSource, { module: 'm' }, newRequest);
  outcomes.aggregate_output_source_unchanged = { sourceUnchanged: canonical(aggregateOutputSource) === aggregateBefore };
} catch {
  outcomes.aggregate_output_source_unchanged = { sourceUnchanged: canonical(aggregateOutputSource) === aggregateBefore };
}
const forged = structuredClone(declaration);
forged.provenance.idealPath = '/wrong';
try {
  verifyCoreRelationshipOperation(forged, declaration.target);
  outcomes.verify_forged_receipt = { ok: true, value: 'unexpected acceptance' };
} catch (error) {
  const e = error as { code?: string; message?: string; path?: string };
  outcomes.verify_forged_receipt = { ok: false, error: { code: e.code ?? '', message: e.message ?? String(error), path: e.path ?? '' } };
}
const oversized = structuredClone(noRelationships) as any;
oversized.unknownPayload = Array.from({ length: 100_001 }, (_, index) => index);
try {
  inspectCoreRelationships(oversized, { module: 'm' });
  outcomes.value_limit_refusal = { ok: true, value: 'unexpected acceptance' };
} catch (error) {
  const e = error as { code?: string; message?: string; path?: string };
  outcomes.value_limit_refusal = { ok: false, error: { code: e.code ?? '', message: e.message ?? String(error), path: e.path ?? '' } };
}
const tooDeep = structuredClone(noRelationships) as any;
let cursor = tooDeep;
for (let index = 0; index < 129; index++) { cursor.n = {}; cursor = cursor.n; }
try {
  inspectCoreRelationships(tooDeep, { module: 'm' });
  outcomes.depth_limit_refusal = { ok: true, value: 'unexpected acceptance' };
} catch (error) {
  const e = error as { code?: string; message?: string; path?: string };
  outcomes.depth_limit_refusal = { ok: false, error: { code: e.code ?? '', message: e.message ?? String(error), path: e.path ?? '' } };
}

const path = 'docs/helix/04-build/evidence/rust-migration/r5-core-relationships/frozen-typescript.json';
await mkdir(dirname(resolve(root, path)), { recursive: true });
await writeFile(resolve(root, path), JSON.stringify({
  profile: 'core-relationships/1.0.0+3.0.0/core-0.10.0',
  predecessor: 'src/model/relationships.ts',
  coreVersion: '0.10.0',
  sourceClosureSha256: hashes,
  cases: inputs,
  outcomes,
}, null, 2) + '\n');
console.log(path);
