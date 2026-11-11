// SPDX-License-Identifier: MIT OR Apache-2.0
/** Static contracts for the Rust-owned Action rule and selector operations. */
import type {Document} from '../../model/types';
import type {CoreLiteral} from '../../model/schema-literals';
import type {Action,ActionKeyReference,ActionReference,ActionRule} from './types';
export type ActionRulePhase='pre'|'post';
export type ActionExpression = {literal:CoreLiteral}|{input:string}|{output:string}|{state:ActionRulePhase;frame:string;field:ActionReference}|{exists:{state:ActionRulePhase;frame:string}}|{linked:{state:ActionRulePhase;relationship:{module:string;relationship:string};sourceFrame:string;targetFrame:string}}|{op:'present'|'eq'|'lt'|'le'|'gt'|'ge'|'add'|'sub'|'and'|'or'|'not';args:ActionExpression[]};
export interface CompiledActionRule {language:'umf.actions.rules';version:'1';phase:ActionRulePhase;expression:string;ast:ActionExpression;type:'boolean';dependencies:ActionRule['references']}
export interface ActionExpressionType {family:'boolean'|'integer'|'string'|'null';nullable:boolean}
export interface ActionEntityInput {key:ActionKeyReference;components:CoreLiteral[]}
export type ActionInputs=Record<string,CoreLiteral|ActionEntityInput>;
export interface CompiledActionSelector {language:'umf.actions.keys';version:'1';expression:string;frame:string;ast:{entity:string}|{key:string;components:({input:string}|{literal:CoreLiteral})[]}}
export interface SelectedActionIdentity {entity:ActionEntityInput;tupleHex:string}
export interface PreparedActionIdentities {
 readonly profile:'umf.actions.keys.prepared/1';
 readonly source:Document;
 readonly action:Action;
 admitInputs(inputs:ActionInputs,outputs?:boolean):ActionInputs;
 select(frameId:string,inputs:ActionInputs):SelectedActionIdentity;
}
export interface ActionFrameState {exists:boolean;values:Record<string,CoreLiteral>}
export interface ActionBusinessState {frames:Record<string,ActionFrameState>;links:{relationship:{module:string;relationship:string};sourceFrame:string;targetFrame:string}[]}
export interface ActionRuleState {inputs:ActionInputs;outputs?:ActionInputs;pre:ActionBusinessState;post?:ActionBusinessState}
