import { type CoreLiteral } from '../../model/schema-literals';
import type { Document } from '../../model/types';
import type { Action, ActionRule, ActionReference } from './types';
import { type ActionRulePhase } from './expression';
import { type ActionInputs } from './selector';
export interface ActionFrameState {
    exists: boolean;
    values: Record<string, CoreLiteral>;
}
export interface ActionBusinessState {
    frames: Record<string, ActionFrameState>;
    links: {
        relationship: {
            module: string;
            relationship: string;
        };
        sourceFrame: string;
        targetFrame: string;
    }[];
}
export interface ActionRuleState {
    inputs: ActionInputs;
    outputs?: ActionInputs;
    pre: ActionBusinessState;
    post?: ActionBusinessState;
}
export declare const actionFieldValueKey: (reference: ActionReference) => string;
/** Recompiles from declaration text before evaluation; callers cannot forge a compiled-plan certificate. */
export declare function evaluateActionRule(document: Document, action: Action, rule: ActionRule, phase: ActionRulePhase, stateInput: ActionRuleState): boolean;
