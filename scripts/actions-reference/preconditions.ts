import {UmfError} from '../../src/model/types';
import {evaluateActionRule,type ActionBusinessState} from '../../src/extensions/actions/evaluation';
import type {PreparedReferenceAction} from './preparation';
import type {FrozenReferenceState} from './state';
import {ReferenceMutationGateway} from './gateway';
export type ReferencePreconditionDecision={kind:'ready';pre:ActionBusinessState}|{kind:'rejected';stage:'input'|'precondition';code:string;subject:string}|{kind:'conflict';code:string;subject:string};
/** Advisory checks and invoke use identical ordered checks; this executes no business primitive. */
export function checkReferencePreconditions(prepared:PreparedReferenceAction,state:FrozenReferenceState):ReferencePreconditionDecision{
 const {source,action,inputs}=prepared;
 if(state.missingInputs.length)return {kind:'rejected',stage:'input',code:'ENTITY_MISSING',subject:state.missingInputs[0]!};
 for(const frame of [...action.reads,...action.writes]){const assertion=prepared.expectedVersions.find(assertion=>assertion.frame===frame.id);if(assertion){const actual=state.frames.find(candidate=>candidate.id===frame.id)?.entity;if(!actual||actual.version!==assertion.version)return {kind:'conflict',code:'EXPECTED_VERSION',subject:frame.id};}}
 const pre=new ReferenceMutationGateway(source,state).ruleState('pre');
 for(const condition of action.preconditions)if(!evaluateActionRule(source,action,condition.rule,'pre',{inputs,pre}))return {kind:'rejected',stage:'precondition',code:condition.failure.code,subject:condition.id};
 return {kind:'ready',pre};
}
