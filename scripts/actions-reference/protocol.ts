import {copyJson} from '../../src/model/json';
import {UmfError} from '../../src/model/types';
import type {Action} from '../../src/extensions/actions';
import type {ActionInputs} from '../../src/extensions/actions/selector';
export interface RevisionReference {module:string;action:string;revision:string}
export interface ExpectedActionVersion {frame:string;version:string}
export interface ReferenceInvokeRequest {protocol:'umf.actions.tx/1';target:RevisionReference;inputs:ActionInputs;key?:string;expectedVersions?:ExpectedActionVersion[];correlation?:string}
const refuse=(message:string):never=>{throw new UmfError('PARAMETER',message);};
function exact(value:unknown,keys:string[],required:string[]):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))return refuse('Expected exact request object');const object=value as Record<string,unknown>;if(Object.keys(object).some(k=>!keys.includes(k))||required.some(k=>!Object.hasOwn(object,k)))refuse('Unknown/missing request member');return object;}
function text(value:unknown,max=256):void {if(typeof value!=='string'||!value||value.length>max)refuse('Invalid bounded identity');}
/** Exact transport admission is separate from original-revision typed interpretation. */
export function admitReferenceRequest(input:unknown,operation:'invoke'|'lookup'|'preview'):ReferenceInvokeRequest {
 if(!['invoke','lookup','preview'].includes(operation))refuse('Unsupported logical operation');
 const source=copyJson(input),optional=operation==='preview'?['expectedVersions']:operation==='lookup'?['key','expectedVersions']:['key','expectedVersions','correlation'];
 const object=exact(source,['protocol','target','inputs',...optional],['protocol','target','inputs',...(operation==='lookup'?['key']:[])]);
 if(object.protocol!=='umf.actions.tx/1')refuse('Unsupported exact protocol');const target=exact(object.target,['module','action','revision'],['module','action','revision']);for(const value of Object.values(target))text(value);
 if(!object.inputs||typeof object.inputs!=='object'||Array.isArray(object.inputs))refuse('Expected typed input map');
 if(Object.hasOwn(object,'key'))text(object.key,1024);if(Object.hasOwn(object,'correlation'))text(object.correlation);
 if(Object.hasOwn(object,'expectedVersions')){if(!Array.isArray(object.expectedVersions)||object.expectedVersions.length>256)refuse('Invalid concurrency assertion bound');const seen=new Set<string>();for(const entry of object.expectedVersions as unknown[]){const assertion=exact(entry,['frame','version'],['frame','version']);text(assertion.frame);text(assertion.version);if(seen.has(assertion.frame as string))refuse('Duplicate frame version assertion');seen.add(assertion.frame as string);}}
 return source as unknown as ReferenceInvokeRequest;
}
/** Request array order is nonsemantic; concurrency checks/fingerprints follow declaration order. */
export function canonicalReferenceVersions(action:Action,request:ReferenceInvokeRequest):ExpectedActionVersion[] {
 const frames=[...action.reads,...action.writes],assertions=request.expectedVersions??[];if(new Set(frames.map(f=>f.id)).size!==frames.length)refuse('Ambiguous frame identity');
 if(assertions.some(a=>!frames.some(f=>f.id===a.frame))||new Set(assertions.map(a=>a.frame)).size!==assertions.length)refuse('Unknown/duplicate asserted frame');
 return frames.flatMap(f=>{const entry=assertions.find(a=>a.frame===f.id);return entry?[{frame:entry.frame,version:entry.version}]:[];});
}
