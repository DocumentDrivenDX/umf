/** Private shared immutable core source; semantic custody only, never authenticity. */
import {copyJson} from '../../model/json';
import {validateDocument} from '../../validation/document';
const sources=new WeakMap<object,unknown>();
function freeze(value:any):any{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
export function captureCandidateCoreSource(input:unknown):unknown{
 const source=copyJson(input),checked=validateDocument(source);
 if(!checked.valid||!checked.complete)throw Error('SECURITY_CANDIDATE_CORE_SOURCE_UNRESOLVED');
 const handle=Object.freeze({kind:'candidate-core-source/0.1'});sources.set(handle,freeze(source));return handle;
}
export function isIssuedCandidateCoreSource(input:unknown):boolean{return input!==null&&typeof input==='object'&&sources.has(input);}
/** Plain JSON keeps its original detached snapshot behavior. Only an issued handle shares storage. */
export function readCandidateCoreSource(input:unknown):any{
 return isIssuedCandidateCoreSource(input)?sources.get(input as object):copyJson(input);
}
