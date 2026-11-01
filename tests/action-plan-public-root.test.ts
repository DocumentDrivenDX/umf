// SPDX-License-Identifier: MIT OR Apache-2.0
import {test, expect} from 'bun:test';
import {createHash} from 'node:crypto';
import fixture from '../docs/helix/03-test/fixtures/bulk-update/model.json';
import {CURRENT_CORE_VERSION} from '../src/generated/core-model';
import {createUmfRegistry, prepareActionPlanModel, inspectActionPlan, assessActionPlan, inspectActions, prepareCoreKeyTuples, constructActionManifest, inspectActionManifest, assessActionManifest} from '../src/index-node-v4';
import {createActionPlanSessionEngine} from '../bindings/core/node/index.js';
import type {ActionPlanArtifact, ActionPlanInspectionContext, ActionPlanCapabilities, PortableActionPlan} from '../src/extensions/actions/plan-types';
import type {Document} from '../src/model/types';

const artifact = (value: unknown): ActionPlanArtifact => {
  const utf8 = JSON.stringify(value);
  return {mediaType: 'application/json', utf8, sha256: createHash('sha256').update(utf8).digest('hex')};
};

function manifestCall<T>(operation: string, run: () => T): T {
  try { return run(); }
  catch (value) {
    const error = value as {code?: unknown; path?: unknown; message?: unknown};
    throw new Error(`${operation} failed [${String(error?.code ?? 'unknown')}] ${String(error?.path ?? '')}: ${String(error?.message ?? value)}`);
  }
}

function setup() {
  const document = structuredClone(fixture) as unknown as Document;
  const model = artifact(document);
  const pin = {documentId: document.id, revision: 'native1', umfVersion: CURRENT_CORE_VERSION, sha256: model.sha256};
  const action = {identity: {module: 'sales', action: 'set-active'}, documentSha256: model.sha256, invocation: {id: 'umf.actions.tx', version: '1'}};
  const field = {module: 'sales', element: 'last-seen'};
  const context: ActionPlanInspectionContext = {
    registry: createUmfRegistry(),
    models: [{pin, artifact: model}],
    actions: [{pin: action, artifact: model}],
    selections: [{profile: {id: 'test.selection', version: '1'}, inspect: () => ({eligible: true, dependencies: [field], diagnostics: []})}],
  };
  const plan: PortableActionPlan = {
    protocol: 'umf.actions.plan/1', model: pin, action,
    source: artifact({sql: 'UPDATE Customer SET active=FALSE WHERE last_seen<100'}),
    selection: {profile: {id: 'test.selection', version: '1'}, artifact: artifact({field, value: {integerToken: '100'}}), dependencies: [field]},
    target: {module: 'sales', element: 'customer', key: 'pk'},
    inputs: {entityParameter: 'customer', assignments: [{input: 'active-value', field: {module: 'sales', element: 'active'}, value: {boolean: false}}]},
    execution: {selection: 'frozen', atomicity: 'batch', conflict: 'stop', partition: 'manifest-order', batchSize: 2},
    limits: {maxItems: 10000, maxManifestBytes: 16777216},
  };
  return {pin, action, context, plan};
}

function capabilities(value: ReturnType<typeof setup>): ActionPlanCapabilities {
  const claims: Record<string, string[]> = {
    plan: ['integrity', 'actionBinding'], selection: ['interpretation', 'completeRead'],
    manifest: ['partition', 'sealCustody'], guard: ['identityVersion'],
    snapshot: ['coherentCut'], bulk: ['atomicBatch', 'replay', 'principal', 'recovery', 'cancel', 'retention'],
  };
  const profiles: Record<string, {id: string; version: string}> = {
    plan: {id:'umf.actions.plan',version:'1'}, selection: value.plan.selection.profile,
    manifest: {id:'umf.actions.manifest',version:'1'}, bulk: {id:'umf.actions.bulk',version:'1'},
    guard: {id:'test.guard',version:'1'}, snapshot: {id:'test.snapshot',version:'1'},
  };
  const result: Record<string, unknown> = {};
  for (const [family, ids] of Object.entries(claims)) {
    result[family] = {profile:profiles[family],claims:ids.map(id=>({id:`${family}.${id}`,status:'supported',evidence:['fixture://declaration-only']}))};
  }
  result.action = {
    id:'test.executor',version:'1',coreVersion:CURRENT_CORE_VERSION,actionVersion:'0.1.0',
    source: structuredClone(fixture),identity:value.action.identity,
    claims:inspectActions(structuredClone(fixture) as unknown as Document,value.context.registry).actions[0]!.obligations.map(item=>({obligation:item.id,status:'supported',evidence:['fixture://declaration-only']})),
  };
  return result as unknown as ActionPlanCapabilities;
}

test('Node V4 Action Plan public root prepares and inspects through the Rust session', () => {
  const value = setup();
  const prepared = prepareActionPlanModel(value.pin, value.action, value.context);
  expect(JSON.parse(prepared.utf8).frames).toEqual(['customer-write']);
  expect(JSON.parse(prepared.utf8).obligations).toContainEqual({id:'/modules/0/elements/2',status:'checked'});
  const inspected = inspectActionPlan(artifact(value.plan), value.context);
  expect(inspected.eligible).toBe(true);
  expect(inspected.plan?.selection.dependencies).toEqual([{module: 'sales', element: 'last-seen'}]);
  const assessment = assessActionPlan(inspected, capabilities(value), value.context);
  expect(assessment.compatible).toBe(true);
  expect(assessment.executionVerified).toBe(false);
},60_000);

test('Node V4 Action Plan public root refuses a mismatched selection dependency', () => {
  const value = setup();
  value.plan.selection.dependencies = [{module: 'sales', element: 'active'}];
  const inspected = inspectActionPlan(artifact(value.plan), value.context);
  expect(inspected.eligible).toBe(false);
  expect(inspected.source.utf8).toBe(artifact(value.plan).utf8);
  expect(inspected.diagnostics.some(item => item.code === 'PAP_ACTION')).toBe(true);
});

test('Node V4 Action Manifest public root constructs, inspects, and assesses through Rust', () => {
  const value = setup();
  const document = value.context.models[0]!.artifact.utf8;
  const source = JSON.parse(document) as Document;
  const entity = {key: value.plan.target, components: [{string: 'customer-17'}]};
  const keyReceipt = prepareCoreKeyTuples(source).encode(entity.key, entity.components);
  const construction = {
    plan: artifact(value.plan),
    action: {target: {module: 'sales', action: 'set-active', revision: 'native1'}, documentSha256: value.action.documentSha256, invocation: value.action.invocation},
    basis: {profile: {id: 'test.snapshot', version: '1'}, store: 'store-a', epoch: 'epoch-a', cut: 'cut-a', selectionSha256: value.plan.selection.artifact.sha256},
    rows: [{entity, guard: {profile: {id: 'test.guard', version: '1'}, store: 'store-a', epoch: 'epoch-a', identity: 'customer-17', version: 'version-1'}, keyReceipt}],
  };
  const constructed = manifestCall('constructActionManifest', () => constructActionManifest(construction, value.context));
  expect(constructed.sealed).toBe(false);
  const inspected = inspectActionManifest(constructed.artifact, value.context);
  expect(inspected.eligible).toBe(true);
  expect(inspected.manifest?.batches).toEqual([{ordinal: 0, start: 0, count: 1}]);
  expect(inspected.manifest?.items[0]?.expectedVersions).toEqual([{frame: 'customer-write', version: 'version-1'}]);
  expect(assessActionManifest(inspected, capabilities(value), value.context).compatible).toBe(true);
},120_000);

test('Node V4 Action Manifest public root refuses a caller-tampered inspection', () => {
  const value = setup();
  const entity = {key: value.plan.target, components: [{string: 'customer-17'}]};
  const source = JSON.parse(value.context.models[0]!.artifact.utf8) as Document;
  const constructed = manifestCall('constructActionManifest', () => constructActionManifest({
    plan: artifact(value.plan),
    action: {target: {module: 'sales', action: 'set-active', revision: 'native1'}, documentSha256: value.action.documentSha256, invocation: value.action.invocation},
    basis: {profile: {id: 'test.snapshot', version: '1'}, store: 'store-a', epoch: 'epoch-a', cut: 'cut-a', selectionSha256: value.plan.selection.artifact.sha256},
    rows: [{entity, guard: {profile: {id: 'test.guard', version: '1'}, store: 'store-a', epoch: 'epoch-a', identity: 'customer-17', version: 'version-1'}, keyReceipt: prepareCoreKeyTuples(source).encode(entity.key, entity.components)}],
  }, value.context));
  const inspected = inspectActionManifest(constructed.artifact, value.context);
  const forged = {...inspected, eligible: false};
  expect(assessActionManifest(forged, capabilities(value), value.context).compatible).toBe(false);
},120_000);

test('Rust Action Plan session refuses a forged compatible manifest assessment', () => {
  const session = createActionPlanSessionEngine();
  const result = session.run('assessManifest', {
    supplied: {}, fresh: {}, capabilities: {},
    planAssessment: {compatible: true, executionVerified: false, obligations: [], diagnostics: []},
  }) as {compatible?: boolean; diagnostics?: {code?: string}[]};
  expect(result.compatible).toBe(false);
  expect(result.diagnostics?.some(item => item.code === 'PAP_ACTION')).toBe(true);
});

test('Rust Action Plan session rejects schema-invalid manifest inspection and construction claims', () => {
  const session = createActionPlanSessionEngine();
  const utf8 = '{}';
  const artifact = {mediaType: 'application/json', utf8, sha256: createHash('sha256').update(utf8).digest('hex')};
  expect(() => session.run('inspectManifest', {
    artifact, planInspection: {eligible: true}, models: [], actions: [],
  })).toThrow('Value does not match its pinned schema');
  expect(() => session.run('constructManifest', {
    request: {}, planInspection: {eligible: true}, models: [], actions: [],
  })).toThrow('Fresh Rust Action Plan inspection receipt required');
});
