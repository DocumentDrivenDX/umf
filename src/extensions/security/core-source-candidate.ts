// SPDX-License-Identifier: MIT OR Apache-2.0
/** Private shared immutable core source; semantic custody only, never authenticity. */
import {copyJson} from '../../model/json';
import {validateDocument} from '../../validation/document';
import type {Validation} from '../../model/types';
import {requireCandidateCoreExtensionRegistry} from './core-extension-closure-candidate';
const sources=new WeakMap<object,unknown>();
function freeze(value:any):any{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
/** The selected envelope warning is advisory; unresolved semantics remain a refusal.
 * The validator result and its original diagnostics are never changed. */
export function candidateCoreSourceComplete(source:any,checked:Validation):boolean{
 return source?.umf==='0.10.0'&&checked.valid&&checked.diagnostics.every(d=>d.code==='EXPERIMENTAL_CORE_SEMANTIC_TYPES'&&d.path==='/umf'&&d.severity==='warning');
}
export function captureCandidateCoreSource(input:unknown,extensionClosure?:unknown):unknown{
 const source=copyJson(input),checked=extensionClosure===undefined?validateDocument(source):validateDocument(source,requireCandidateCoreExtensionRegistry(extensionClosure));
 if(!candidateCoreSourceComplete(source,checked))throw Error('SECURITY_CANDIDATE_CORE_SOURCE_UNRESOLVED');
 const handle=Object.freeze({kind:'candidate-core-source/0.1'});sources.set(handle,freeze(source));return handle;
}
export function isIssuedCandidateCoreSource(input:unknown):boolean{return input!==null&&typeof input==='object'&&sources.has(input);}
/** Plain JSON keeps its original detached snapshot behavior. Only an issued handle shares storage. */
export function readCandidateCoreSource(input:unknown):any{
 return isIssuedCandidateCoreSource(input)?sources.get(input as object):copyJson(input);
}
