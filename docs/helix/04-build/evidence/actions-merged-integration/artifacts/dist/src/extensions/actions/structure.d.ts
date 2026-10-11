import { type ExtensionPackage } from '../../model/types';
import type { Action } from './types';
export declare const actionsPackage: ExtensionPackage;
export declare const checkActionsStructure: import("ajv").ValidateFunction<{
    [x: string]: {};
}>;
export declare const checkActionLiteral: import("ajv").ValidateFunction<unknown>;
/** JSON admission precedes compiled validation; hostile accessors are never invoked. */
export declare function admitAction(input: unknown): Action;
