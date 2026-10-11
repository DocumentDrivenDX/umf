import { type Document } from '../../model/types';
import { Registry } from '../../registry/registry';
import type { Action, ActionIdentity, ActionInspection, ActionExecutorProfile, ActionAssessment } from './types';
export * from './types';
export { actionsPackage } from './structure';
/** Extends the caller's registry without discarding any installed callback. */
export declare function registerActions(registry: Registry): Registry;
export declare function inspectActions(sourceInput: Document, registry: Registry): ActionInspection;
export declare function declareAction(sourceInput: Document, moduleId: string, actionInput: Action, registry: Registry): Document;
export declare function editAction(sourceInput: Document, identity: ActionIdentity, replacementInput: Action, registry: Registry): Document;
export declare function assessAction(sourceInput: Document, identityInput: ActionIdentity, profileInput: ActionExecutorProfile, registry: Registry): ActionAssessment;
