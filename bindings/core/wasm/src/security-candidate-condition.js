// SPDX-License-Identifier: MIT OR Apache-2.0
import {encodeWire,fromWire,resultError} from './wire.js';

export const SECURITY_CANDIDATE_CONDITION_PROFILE='umf.security-candidate-condition/0.1';

export function createSecurityCandidateConditionOperations(invoke,ErrorType=Error){
 function call(request,dispatch){
  if(typeof dispatch!=='function')throw new TypeError('Condition callback must be callable');
  let callbackFailed=false,callbackError;
  const callback=wire=>{
   try{return encodeWire(dispatch(fromWire(JSON.parse(wire))));}
   catch(error){callbackFailed=true;callbackError=error;throw error;}
  };
  let responseText;
  try{responseText=invoke(encodeWire({profile:SECURITY_CANDIDATE_CONDITION_PROFILE,...request}),callback);}
  catch(error){throw callbackFailed?callbackError:error;}
  if(callbackFailed)throw callbackError;
  const response=JSON.parse(responseText),failure=resultError(response);
  if(failure)throw new ErrorType(failure.code,failure.message,failure.path);
  return fromWire(JSON.parse(response.wire));
 }
 return Object.freeze({
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
