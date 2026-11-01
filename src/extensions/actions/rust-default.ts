// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError} from '../../model/errors';
import type {Document} from '../../model/types';
import {copyJson} from '../../model/json';
import {validateDocument} from '../../validation/document';
import {actionCallerSemanticValidator} from './native-semantic-owner';
import {Registry, type SemanticValidator} from '../../registry/registry';
import type {
  ActionPlanArtifact,
  ActionPlanAssessment,
  ActionPlanCapabilities,
  ActionPlanInspection,
  ActionPlanInspectionContext,
  ActionPlanModelPin,
  ActionPlanSelectionInspector,
  PortableActionPin,
} from './plan-types';

type Guard = (value: unknown) => boolean;
export type ActionPlanSessionEngine = {run(op: string, fields?: Record<string, unknown>): unknown};
type Session = ActionPlanSessionEngine;
const CONTROL = new Set(['RESOURCE_LIMIT','CANCELLED','METER_FAILURE','CANCELLATION_CHECK_FAILURE','CLOCK_CAPABILITY_REQUIRED','DEADLINE','DEADLINE_EXCEEDED']);

function nativeCall<T>(isNative: Guard, operation: () => T): T {
  try { return operation(); }
  catch (value) {
    if (!isNative(value)) throw value;
    const error = value as {code?: unknown; message?: unknown; path?: unknown};
    if (typeof error.code === 'string' && !CONTROL.has(error.code) && (error.code.startsWith('PAP_') || error.code === 'REQUEST' || error.code === 'LIMIT')) {
      throw new UmfError(error.code, String(error.message ?? ''), typeof error.path === 'string' ? error.path : '');
    }
    throw value;
  }
}
function data(value: object, name: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, name);
  if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
    throw new UmfError('PAP_INVALID', 'Action Plan context members must be own data properties', `/context/${name}`);
  }
  return descriptor.value;
}
function list<T>(value: unknown, name: string, maximum: number): T[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum) {
    throw new UmfError('PAP_LIMIT', `Bounded plain ${name} array required`, `/context/${name}`);
  }
  const result: T[] = [];
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      throw new UmfError('PAP_INVALID', `${name} entries must be own data properties`, `/context/${name}/${index}`);
    }
    result.push(descriptor.value as T);
  }
  return result;
}

function registryDiagnostics(document: Document, registry: Registry) {
  if (!(registry instanceof Registry)) throw new UmfError('PAP_INVALID', 'Explicit original Registry required', '/context/registry');
  const validationRegistry = new Registry(registry.kindRuntime);
  for (const registration of registry.registrations()) {
    validationRegistry.register(
      registration.manifest,
      actionCallerSemanticValidator(registration.semantics,registration.manifest) as SemanticValidator | undefined,
      registration.kinds === undefined ? {} : {kinds: registration.kinds},
    );
  }
  return validateDocument(document, validationRegistry).diagnostics.map(({code, path, message, severity}) => ({code, path, message, severity}));
}
function registryResponse(prepared: Record<string, unknown>, registry: Registry) {
  return {
    source: prepared.document,
    diagnostics: registryDiagnostics(prepared.document as Document, registry),
    actionSemantics: !!registry.get('umf.actions', '0.1.0')?.semantics,
    dddSemantics: !!registry.get('umf.ddd', '0.1.0')?.semantics,
  };
}
function selectResponse(stage: Record<string, unknown>, context: ActionPlanInspectionContext) {
  const profile = stage.profile as ActionPlanSelectionInspector['profile'];
  const selections = list<ActionPlanSelectionInspector>(data(context, 'selections'), 'selections', 64);
  const matches = selections.filter(entry => {
    const candidate = copyJson(data(entry, 'profile')) as ActionPlanSelectionInspector['profile'];
    return candidate.id === profile.id && candidate.version === profile.version;
  });
  const inspect = matches.length === 1 ? data(matches[0]!, 'inspect') : undefined;
  if (typeof inspect !== 'function') {
    return {eligible: false, dependencies: [], diagnostics: [{code:'PAP_PROFILE',path:'/selection/profile',message:'One exact installed selection interpreter required'}]};
  }
  return copyJson(inspect.call(matches[0],
    copyJson(stage.artifact) as ActionPlanArtifact,
    copyJson(stage.model) as Document,
    copyJson(stage.target) as Parameters<ActionPlanSelectionInspector['inspect']>[2],
  ));
}

/** Public Action Plan surface over Rust-owned model, plan, and assessment semantics. */
export function createActionPlanRustDefault(session: Session, isNative: Guard) {
  const call = <T>(op: string, fields: Record<string, unknown>) => nativeCall<T>(isNative, () => session.run(op, fields) as T);
  const cancel = (stage: Record<string, unknown>) => { try { session.run('cancel', {token: stage.token}); } catch {} };
  const completeRegistry = (stage: Record<string, unknown>, registry: Registry) => {
    let response: ReturnType<typeof registryResponse>;
    try { response = registryResponse(stage, registry); }
    catch (error) { cancel(stage); throw error; }
    try { return call<Record<string, unknown>>('completeRegistry', {token: stage.token, response}); }
    catch (error) { cancel(stage); throw error; }
  };
  const completeSelection = (stage: Record<string, unknown>, context: ActionPlanInspectionContext) => {
    let response: ReturnType<typeof selectResponse>;
    try { response = selectResponse(stage, context); }
    catch (error) { cancel(stage); throw error; }
    try { return call<Record<string, unknown>>('completeSelection', {token: stage.token, response}); }
    catch (error) { cancel(stage); throw error; }
  };

  return Object.freeze({
    prepareActionPlanModel: (model: ActionPlanModelPin, action: PortableActionPin, context: ActionPlanInspectionContext) => {
      const stage = call<Record<string, unknown>>('prepareModel', {modelPin: model, actionPin: action, models: data(context, 'models'), actions: data(context, 'actions')});
      return completeRegistry(stage, data(context, 'registry') as Registry) as unknown as ActionPlanArtifact;
    },
    inspectActionPlan: (artifact: ActionPlanArtifact, context: ActionPlanInspectionContext) => {
      const selections = list<ActionPlanSelectionInspector>(data(context, 'selections'), 'selections', 64);
      const stage = call<Record<string, unknown>>('prepareInspect', {artifact, models: data(context, 'models'), actions: data(context, 'actions'), selections: selections.map(entry => ({profile: copyJson(data(entry, 'profile'))}))});
      const registered = Object.prototype.hasOwnProperty.call(stage, 'stage')
        ? completeRegistry(stage, data(context, 'registry') as Registry)
        : stage;
      return (Object.prototype.hasOwnProperty.call(registered, 'stage') ? completeSelection(registered, context) : registered) as unknown as ActionPlanInspection;
    },
    assessActionPlan: (inspection: ActionPlanInspection, capabilities: ActionPlanCapabilities, context: ActionPlanInspectionContext) => {
      const selections = list<ActionPlanSelectionInspector>(data(context, 'selections'), 'selections', 64);
      const stage = call<Record<string, unknown>>('prepareAssess', {inspection, capabilities, models: data(context, 'models'), actions: data(context, 'actions'), selections: selections.map(entry => ({profile: copyJson(data(entry, 'profile'))}))});
      const registered = Object.prototype.hasOwnProperty.call(stage, 'stage')
        ? completeRegistry(stage, data(context, 'registry') as Registry)
        : stage;
      return (Object.prototype.hasOwnProperty.call(registered, 'stage') ? completeSelection(registered, context) : registered) as unknown as ActionPlanAssessment;
    },
  });
}
