import type { Action } from './types';
export interface ActionReferencePosition {
    value: unknown;
    keys: string[];
    path: string;
}
/** Only schema-defined reference slots have reference semantics; opaque content is inert. */
export declare function actionReferencePositions(action: Action, path?: string): ActionReferencePosition[];
