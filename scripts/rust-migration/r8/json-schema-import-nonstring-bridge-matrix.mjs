// SPDX-License-Identifier: MIT OR Apache-2.0
import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
import {importJsonSchema} from '../../../src/adapters/json-schema/index.ts';
import {createJsonSchemaStagedImportSession} from '../../../bindings/core/node/src/json-schema-import-session.js';
import {boundaryCases, prepareBoundaryCase} from './json-schema-import-nonstring-boundary-cases.mjs';

const addonPath = process.env.UMF_NODE_ADDON_PATH;
if (!addonPath) throw new Error('UMF_NODE_ADDON_PATH is required');
const addon = createRequire(import.meta.url)(addonPath);
const stagedApi = createJsonSchemaStagedImportSession(addon);
const cases = [];

function run(fixture, mode) {
  const events = [];
  const objectSentinel = Object.assign(new Error('boundary sentinel'), {code: 'BOUNDARY_SENTINEL'});
  const primitiveSentinel = Symbol('boundary thrown sentinel');
  const input = prepareBoundaryCase(fixture, events, {object: objectSentinel, primitive: primitiveSentinel});
  try {
    if (mode === 'typescript') importJsonSchema(input.source, input.options);
    else stagedApi.importJsonSchemaHostCoercion(input.source, input.options);
    return {events, outcome: {kind: 'return'}};
  } catch (error) {
    return {events, outcome: {
      kind: 'throw', name: error?.name ?? typeof error,
      message: error?.message ?? String(error), code: error?.code ?? null,
      sameObject: error === objectSentinel, samePrimitive: error === primitiveSentinel,
    }};
  }
}

for (const fixture of boundaryCases()) {
  const typescript = run(fixture, 'typescript');
  const rust = run(fixture, 'rust');
  const excluded = rust.outcome.code === 'JSON_SCHEMA_HOST_INPUT_PROFILE';
  cases.push({id: fixture.id, checks: {
    orderedHostEffects: JSON.stringify(typescript.events) === JSON.stringify(rust.events),
    exactOutcome: JSON.stringify(typescript.outcome) === JSON.stringify(rust.outcome),
    eligible: !excluded,
  }, excludedByProfile: excluded, typescript, rust});
}

const receipt = {
  format: 'umf.r8-json-schema-import-nonstring-bridge-matrix/1',
  status: cases.filter(item => !item.excludedByProfile).every(item => item.checks.orderedHostEffects && item.checks.exactOutcome) ? 'pass' : 'mismatch',
  profile: 'nonstring-string-source-oracle-v1',
  note: 'Only non-string sources whose effective ToString is exactly "{}" (Rust JSON parser success then source TypeError) or "{" (Rust syntax refusal) are eligible; all other successful coercion texts and over-limit observations fail closed with JSON_SCHEMA_HOST_INPUT_PROFILE.',
  runtime: {bun: globalThis.Bun?.version ?? null, node: process.version, nodeAddon: addonPath},
  counts: {
    total: cases.length,
    eligible: cases.filter(item => !item.excludedByProfile).length,
    eligibleEffectsPass: cases.filter(item => !item.excludedByProfile && item.checks.orderedHostEffects).length,
    eligibleOutcomesPass: cases.filter(item => !item.excludedByProfile && item.checks.exactOutcome).length,
    excluded: cases.filter(item => item.excludedByProfile).length,
    excludedEffectsPass: cases.filter(item => item.excludedByProfile && item.checks.orderedHostEffects).length,
    eligibleSourceDifferences: cases.filter(item => !item.excludedByProfile && (!item.checks.orderedHostEffects || !item.checks.exactOutcome)).map(item => item.id),
  },
  cases,
};
if (process.argv[2]) await writeFile(process.argv[2], JSON.stringify(receipt, null, 2) + '\n');
else process.stdout.write(JSON.stringify(receipt));
