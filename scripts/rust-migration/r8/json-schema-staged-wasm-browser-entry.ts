// SPDX-License-Identifier: MIT OR Apache-2.0
import {createJsonSchemaStagedImportEngine, JSON_SCHEMA_STAGED_IMPORT_PROFILE} from '../../../bindings/core/wasm/index.js';

function stageFromWire(wire: string): string {
  const request = JSON.parse(wire) as {members: {key: number[]; value: {kind: string; units: number[]}}[]};
  const stage = request.members.find(member => String.fromCharCode(...member.key) === 'stage');
  if (stage?.value.kind !== 'string') throw new Error('Missing tagged stage');
  return String.fromCharCode(...stage.value.units);
}

const observations: any[] = [];
function runCase(id: string, make: (stages: string[]) => {source: any; options: any}, expected?: object) {
  const stages: string[] = [];
  const events: string[] = [];
  (globalThis as any).events = events;
  const module = (globalThis as any).stagedWasmModule;
  const CountingSession = class extends module.JsonSchemaImportSessionHandle {
    executeStage(wire: string) {
      stages.push(stageFromWire(wire));
      return super.executeStage(wire);
    }
  };
  const engine = createJsonSchemaStagedImportEngine({
    JsonSchemaImportSessionHandle: CountingSession,
    jsonSchemaImportSessionProfileVersion: () => JSON_SCHEMA_STAGED_IMPORT_PROFILE,
  });
  const {source, options} = make(stages);
  try {
    const doc: any = engine.importJsonSchema(source, options);
    const payload = doc.modules[0].elements[0].extensions['umf.json-schema'];
    observations.push({id, stages, events, outcome: {kind: 'return', id: doc.id, namespace: doc.modules[0].namespace, baseUri: payload.baseUri}});
  } catch (error: any) {
    observations.push({id, stages, events, outcome: {kind: 'throw', name: error?.name, message: error?.message, code: error?.code ?? null, sameObject: expected ? error === expected : undefined}});
  }
}

let baseRead = 0;
const ordered: any = {};
Object.defineProperties(ordered, {
  baseUri: {get() { (globalThis as any).events.push(`baseUri#${++baseRead}`); return `https://example.test/read-${baseRead}`; }},
  resources: {get() { (globalThis as any).events.push('resources'); return {get 'https://example.test/dep'() { (globalThis as any).events.push('resource:get'); return '{}'; }}; }},
  id: {get() { (globalThis as any).events.push('id'); return 'staged-doc'; }},
});
runCase('success-preserves-three-uri-reads-and-resource-getter-order', () => ({source: '{}', options: ordered}));

const sentinel = Object.assign(new Error('host getter sentinel'), {code: 'HOST_SENTINEL'});
runCase('base-uri-getter-throw-stops-before-wasm-dispatch', () => ({source: '{', options: Object.defineProperty({}, 'baseUri', {get() { throw sentinel; }})}), sentinel);
runCase('resources-getter-throw-stops-before-root-stage', () => ({source: '{', options: Object.defineProperties({}, {
  baseUri: {get() { return 'https://example.test/root'; }}, resources: {get() { throw sentinel; }},
})}), sentinel);
runCase('resource-ownKeys-proxy-throw-stops-before-resource-root-stages', () => ({source: '{', options: {
  baseUri: 'https://example.test/root', resources: new Proxy({}, {ownKeys() { throw sentinel; }}),
}}), sentinel);
runCase('resource-parse-refusal-precedes-payload-and-root-stages', () => ({source: '{', options: {
  baseUri: 'https://example.test/root', resources: {'https://example.test/bad': '{'}, id: 'never-read',
}}));
runCase('root-parse-refusal-precedes-id-and-third-uri-read', () => {
  let reads = 0;
  return {source: '{', options: {get baseUri() { reads++; return 'https://example.test/root'; }, resources: {}, get id() { throw new Error('id should not be observed'); }}};
});

(globalThis as any).stagedImportResult = observations;
