// SPDX-License-Identifier: MIT OR Apache-2.0
import {encodeWire,toWire,fromWire,resultError} from './wire.js';

export const SECURITY_CANDIDATE_CONDITION_PROFILE='umf.security-candidate-condition/0.1';

export function createSecurityCandidateConditionOperations(invoke,ErrorType=Error){
 function callWire(requestWire,dispatch){
  if(typeof dispatch!=='function')throw new TypeError('Condition callback must be callable');
  let callbackFailed=false,callbackError;
  const callback=wire=>{
   try{return encodeWire(dispatch(fromWire(JSON.parse(wire))));}
   catch(error){callbackFailed=true;callbackError=error;throw error;}
  };
  let responseText;
  try{responseText=invoke(requestWire,callback);}
  catch(error){throw callbackFailed?callbackError:error;}
  if(callbackFailed)throw callbackError;
  const response=JSON.parse(responseText),failure=resultError(response);
  if(failure)throw new ErrorType(failure.code,failure.message,failure.path);
  return fromWire(JSON.parse(response.wire));
 }
 function call(request,dispatch){
  if(typeof dispatch!=='function')throw new TypeError('Condition callback must be callable');
  return callWire(encodeWire({profile:SECURITY_CANDIDATE_CONDITION_PROFILE,...request}),dispatch);
 }
 return Object.freeze({
  prepareCandidateCondition(expression){
   // Admit the complete original request before retaining a detached snapshot.
   // The template never escapes; every invocation still crosses the complete
   // original native decoder and evaluator with its live callback and limits.
   const template=JSON.parse(encodeWire({profile:SECURITY_CANDIDATE_CONDITION_PROFILE,expression,resourceIndex:0}));
   const expressionWire=template.members[1].value,indexMember=template.members[2];
   return Object.freeze((resourceIndex,dispatch)=>{
    if(typeof dispatch!=='function')throw new TypeError('Condition callback must be callable');
    // Preserve ordinary admission and diagnostics for invalid nonnumeric input.
    if(typeof resourceIndex!=='number')return call({expression:fromWire(expressionWire),resourceIndex},dispatch);
    indexMember.value=toWire(resourceIndex);
    return callWire(JSON.stringify(template),dispatch);
   });
  },
  evaluateCandidateCondition(expression,resourceIndex,dispatch){
   return call({expression,resourceIndex},dispatch);
  },
  preflightCandidateCondition(expression,target,dispatch,associations){
   return call({mode:'preflight',expression,target,...(associations===undefined?{}:{associations})},dispatch);
  },
  normalizeCandidateCondition(expression,dispatch){
   return call({mode:'normalize',expression},dispatch);
  },
 });
}
