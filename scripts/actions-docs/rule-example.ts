// SPDX-License-Identifier: MIT OR Apache-2.0
import {createUmfRegistry,readDocument,inspectActions,compileActionRule,evaluateActionRule,actionFieldValueKey} from '../../src/index-node-v4';
import fixture from '../../fixtures/actions/tutorial-postcondition.json';
const document=readDocument(JSON.stringify(fixture),'json');
const inspection=inspectActions(document,createUmfRegistry());
// Generic inspection does not claim complete extension semantics. The exact
// warning must remain visible; the native rule compiler/evaluator checks the
// explicitly supplied rule and state below.
const diagnostics=inspection.validation.diagnostics;
if(!inspection.validation.valid||inspection.validation.complete||diagnostics.length!==1||diagnostics[0]!.code!=='SEMANTICS_UNCHECKED'||diagnostics[0]!.path!=='/modules/0/extensions/umf.actions'||diagnostics[0]!.severity!=='warning')throw Error('Tutorial inspection contract differs');
const action=inspection.actions[0]!.action,rule=action.postconditions[0]!.rule;
const compiled=compileActionRule(document,action,rule,'post');
const inputs={order:{key:{module:'sales',element:'order',key:'pk'},components:[{string:'order-1'}]}};
const frame=(status:string)=>({frames:{'order-read':{exists:true,values:{[actionFieldValueKey({module:'sales',element:'status'})]:{string:status}}}},links:[]});
const pre=frame('pending');
const satisfied=evaluateActionRule(document,action,rule,'post',{inputs,pre,post:frame('approved')});
const unsatisfied=evaluateActionRule(document,action,rule,'post',{inputs,pre,post:frame('pending')});
if(!satisfied||unsatisfied)throw Error('Postcondition example mismatch');
console.log(JSON.stringify({complete:inspection.validation.complete,compiledType:compiled.type,satisfied,unsatisfied,businessWrites:0,stateSource:'explicitly supplied illustrative state; not authenticated store state'},null,2));
