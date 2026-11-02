// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError} from '../../model/errors';
import type {ActionPlanArtifact, ActionPlanAssessment, ActionPlanCapabilities, ActionPlanInspection, ActionPlanInspectionContext} from './plan-types';
import type {ActionManifestInspection} from './manifest-types';
import type {ActionManifestConstruction, ConstructedActionManifest} from './manifest-construction';

type Guard = (value: unknown) => boolean;
type Session = {run(op: string, fields?: Record<string, unknown>): unknown};
type ActionPlanApi = {
  inspectActionPlan(artifact: ActionPlanArtifact, context: ActionPlanInspectionContext): ActionPlanInspection;
  assessActionPlan(inspection: ActionPlanInspection, capabilities: ActionPlanCapabilities, context: ActionPlanInspectionContext): ActionPlanAssessment;
};
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
  if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) throw new UmfError('PAP_INVALID', 'Action Manifest members must be own data properties', '/' + name);
  return descriptor.value;
}
function contextData(context: ActionPlanInspectionContext, name: 'models'|'actions'): unknown {
  return data(context, name);
}
function nestedPlan(artifact: ActionPlanArtifact): ActionPlanArtifact {
  try {
    const source = data(artifact, 'utf8');
    if (typeof source !== 'string') return {} as ActionPlanArtifact;
    const parsed = JSON.parse(source) as Record<string, unknown>;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed.plan as ActionPlanArtifact : {} as ActionPlanArtifact;
  } catch { return {} as ActionPlanArtifact; }
}
function freshPlan(api: ActionPlanApi, artifact: ActionPlanArtifact, context: ActionPlanInspectionContext): ActionPlanInspection {
  return api.inspectActionPlan(nestedPlan(artifact), context);
}

/** Registry and selection remain explicit staged host capabilities; Rust
 * rechecks manifest semantics against the resulting fresh Action Plan. */
export function createActionManifestRustDefault(session: Session, actionPlan: ActionPlanApi, isNative: Guard) {
  const call = <T>(op: string, fields: Record<string, unknown>) => nativeCall<T>(isNative, () => session.run(op, fields) as T);
  const inspectActionManifest = (artifact: ActionPlanArtifact, context: ActionPlanInspectionContext) => {
    const plan = freshPlan(actionPlan, artifact, context);
    return call<ActionManifestInspection>('inspectManifest', {
      artifact,
      planInspection: plan,
      models: contextData(context, 'models'),
      actions: contextData(context, 'actions'),
    });
  };
  const constructActionManifest = (request: ActionManifestConstruction, context: ActionPlanInspectionContext) => {
    const plan = actionPlan.inspectActionPlan(data(request, 'plan') as ActionPlanArtifact, context);
    return call<ConstructedActionManifest>('constructManifest', {
      request,
      planInspection: plan,
      models: contextData(context, 'models'),
      actions: contextData(context, 'actions'),
    });
  };
  const assessActionManifest = (inspection: ActionManifestInspection, capabilities: ActionPlanCapabilities, context: ActionPlanInspectionContext) => {
    const suppliedPlan = data(inspection, 'plan') as ActionPlanInspection;
    const source = data(inspection, 'source') as ActionPlanArtifact;
    const fresh = inspectActionManifest(source, context);
    const planAssessment = actionPlan.assessActionPlan(suppliedPlan, capabilities, context);
    return call<ActionPlanAssessment>('assessManifest', {supplied: inspection, fresh, capabilities, planAssessment});
  };
  return Object.freeze({constructActionManifest, inspectActionManifest, assessActionManifest});
}
