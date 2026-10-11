import { type Document, type Element } from '../../model/types';
import { type CoreLiteral } from '../../model/schema-literals';
import type { Action, ActionReference, ActionRule } from './types';
export type ActionRulePhase = 'pre' | 'post';
export type ActionExpression = {
    literal: CoreLiteral;
} | {
    input: string;
} | {
    output: string;
} | {
    state: ActionRulePhase;
    frame: string;
    field: ActionReference;
} | {
    exists: {
        state: ActionRulePhase;
        frame: string;
    };
} | {
    linked: {
        state: ActionRulePhase;
        relationship: {
            module: string;
            relationship: string;
        };
        sourceFrame: string;
        targetFrame: string;
    };
} | {
    op: 'present' | 'eq' | 'lt' | 'le' | 'gt' | 'ge' | 'add' | 'sub' | 'and' | 'or' | 'not';
    args: ActionExpression[];
};
export interface CompiledActionRule {
    language: 'umf.actions.rules';
    version: '1';
    phase: ActionRulePhase;
    expression: string;
    ast: ActionExpression;
    type: 'boolean';
    dependencies: ActionRule['references'];
}
export interface ActionExpressionType {
    family: 'boolean' | 'integer' | 'string' | 'null';
    nullable: boolean;
}
export declare const actionExpressionLimits: {
    readonly depth: 32;
    readonly nodes: 512;
    readonly text: 65536;
};
export declare function actionExpressionError(code: string, message: string, path?: string): never;
export declare const sameActionReference: (a: ActionReference, b: ActionReference) => boolean;
export declare function actionModelField(document: Document, reference: ActionReference): Element;
export declare function actionFieldType(document: Document, reference: ActionReference): ActionExpressionType;
export declare function exactActionObject(value: unknown, keys: string[], required?: string[], path?: string): Record<string, unknown>;
/** Strict consumers never drop qualifiers on any declared local model reference. */
export declare function exactActionReferences(action: Action): void;
export declare function actionExpressionText(text: string): unknown;
export declare function compileActionRule(documentInput: Document, actionInput: Action, ruleInput: ActionRule, phase: ActionRulePhase): CompiledActionRule;
