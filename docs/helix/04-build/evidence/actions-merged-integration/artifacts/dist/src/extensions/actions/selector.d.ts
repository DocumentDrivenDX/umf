import { type CoreLiteral } from '../../model/schema-literals';
import type { Document } from '../../model/types';
import type { Action, ActionFrame, ActionKeyReference } from './types';
export interface ActionEntityInput {
    key: ActionKeyReference;
    components: CoreLiteral[];
}
export type ActionInputs = Record<string, CoreLiteral | ActionEntityInput>;
export interface CompiledActionSelector {
    language: 'umf.actions.keys';
    version: '1';
    expression: string;
    frame: string;
    ast: {
        entity: string;
    } | {
        key: string;
        components: ({
            input: string;
        } | {
            literal: CoreLiteral;
        })[];
    };
}
export interface SelectedActionIdentity {
    entity: ActionEntityInput;
    tupleHex: string;
}
/** Typed admission, without store lookup or entity existence checks. */
export declare function admitActionInputs(documentInput: Document, actionInput: Action, inputsInput: ActionInputs, outputs?: boolean): ActionInputs;
export declare function compileActionSelector(documentInput: Document, actionInput: Action, frameInput: ActionFrame): CompiledActionSelector;
export declare function selectActionIdentity(document: Document, action: Action, frame: ActionFrame, inputsInput: ActionInputs): SelectedActionIdentity;
