// SPDX-License-Identifier: MIT OR Apache-2.0
import {importJsonSchema} from '../../../src/adapters/json-schema/index';
import {createJsonSchemaStagedImportEngine, JSON_SCHEMA_STAGED_IMPORT_PROFILE} from '../../../bindings/core/wasm/index.js';
import {boundaryCases, prepareBoundaryCase} from './json-schema-import-nonstring-boundary-cases.mjs';

function stageFromWire(wire: string): string {
  const request = JSON.parse(wire) as {members: {key: number[]; value: {kind: string; units: number[]}}[]};
  const stage = request.members.find(member => String.fromCharCode(...member.key) === 'stage');
  if (stage?.value.kind !== 'string') throw new Error('Missing tagged stage');
  return String.fromCharCode(...stage.value.units);
}

const wasm = (globalThis as any).nonStringWasmModule;
if (typeof wasm?.JsonSchemaImportSessionHandle !== 'function') throw new Error('Fresh WASM session handle is unavailable');
if (wasm.jsonSchemaImportSessionProfileVersion?.() !== JSON_SCHEMA_STAGED_IMPORT_PROFILE) {
  throw new Error('Fresh WASM staged-import profile mismatch');
}

function run(fixture: ReturnType<typeof boundaryCases>[number], side: 'typescript' | 'wasm') {
  const events: string[] = [];
  const stages: string[] = [];
  const objectSentinel = Object.assign(new Error('boundary sentinel'), {code: 'BOUNDARY_SENTINEL'});
  const primitiveSentinel = Symbol('boundary thrown sentinel');
  const input = prepareBoundaryCase(fixture, events, {object: objectSentinel, primitive: primitiveSentinel});
  try {
    if (side === 'typescript') importJsonSchema(input.source, input.options);
    else {
      const CountingSession = class extends wasm.JsonSchemaImportSessionHandle {
        executeStage(wire: string) {
          stages.push(stageFromWire(wire));
          return super.executeStage(wire);
        }
      };
      const engine = createJsonSchemaStagedImportEngine({
        JsonSchemaImportSessionHandle: CountingSession,
        jsonSchemaImportSessionProfileVersion: wasm.jsonSchemaImportSessionProfileVersion,
      });
      engine.importJsonSchemaHostCoercion(input.source, input.options);
    }
    return {events, stages, outcome: {kind: 'return' as const}};
  } catch (error: any) {
    return {events, stages, outcome: {
      kind: 'throw' as const,
      name: error?.name ?? typeof error,
      message: error?.message ?? String(error),
      code: error?.code ?? null,
      sameObject: error === objectSentinel,
      samePrimitive: error === primitiveSentinel,
    }};
  }
}

const cases = boundaryCases().map(fixture => {
  const typescript = run(fixture, 'typescript');
  const wasmResult = run(fixture, 'wasm');
  const excluded = wasmResult.outcome.code === 'JSON_SCHEMA_HOST_INPUT_PROFILE';
  return {
    id: fixture.id,
    eligible: !excluded,
    checks: {
      orderedHostEffects: JSON.stringify(typescript.events) === JSON.stringify(wasmResult.events),
      exactOutcome: JSON.stringify(typescript.outcome) === JSON.stringify(wasmResult.outcome),
    },
    typescript,
    wasm: wasmResult,
  };
});
(globalThis as any).r8NonStringChromiumResult = {
  format: 'umf.r8-json-schema-import-nonstring-chromium-bridge/1',
  profile: 'nonstring-string-source-oracle-v1',
  userAgent: navigator.userAgent,
  counts: {
    total: cases.length,
    eligible: cases.filter(item => item.eligible).length,
    eligibleEffectPass: cases.filter(item => item.eligible && item.checks.orderedHostEffects).length,
    eligibleExactOutcomePass: cases.filter(item => item.eligible && item.checks.exactOutcome).length,
    excluded: cases.filter(item => !item.eligible).length,
    excludedEffectsPass: cases.filter(item => !item.eligible && item.checks.orderedHostEffects).length,
    eligibleDifferences: cases.filter(item => item.eligible && (!item.checks.orderedHostEffects || !item.checks.exactOutcome)).map(item => item.id),
  },
  cases,
};
