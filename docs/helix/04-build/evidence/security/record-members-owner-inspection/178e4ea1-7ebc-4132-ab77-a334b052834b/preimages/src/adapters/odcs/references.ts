import {getOdcsDocumentNode,inspectOdcsDocument} from './index';
import {copyJson} from '../../model/json';
import {UmfError,type Document,type Diagnostic} from '../../model/types';
import type {NativeJson} from '../../model/native-json';
export interface OdcsReferenceResult {
 source:Document;reference:string;usage:'element'|'foreignKey';status:'resolved'|'blocked';complete:false;
 target?:{path:string;notation:'id'|'name';node:NativeJson};diagnostics:Diagnostic[];
}
/** Resolve local ODCS identifiers/names. These are not JSON Pointer array indexes. */
export function resolveOdcsReference(document:Document,options:{reference:string;usage:'element'|'foreignKey'}):OdcsReferenceResult {
 if(!options||typeof options.reference!=='string'||options.reference.length<1||options.reference.length>4096||!['element','foreignKey'].includes(options.usage))throw new UmfError('ODCS_REFERENCE_OPTIONS','Expected bounded reference and explicit element/foreignKey usage');
 const source=copyJson(document) as unknown as Document,root=getOdcsDocumentNode(source,''),diagnostics=[...inspectOdcsDocument(source).diagnostics];
 const result:OdcsReferenceResult={source,reference:options.reference,usage:options.usage,status:'blocked',complete:false,diagnostics};
 const block=(code:string,path:string,message:string)=>{diagnostics.push({code,path,message,severity:'error'});return result;};
 if(root.kind!=='object'||root.members.apiVersion?.kind!=='string'||root.members.apiVersion.value!=='v3.2.0')return block('ODCS_REFERENCE_VERSION','/apiVersion','Reference interpretation is pinned to ODCS v3.2.0');
 let ref=options.reference;const hash=ref.indexOf('#');
 if(hash>0)return block('ODCS_REFERENCE_EXTERNAL','','External contract must be supplied through a future explicit resource API; no fetch performed');
 if(hash===0)ref=ref.slice(1);
 if(ref.startsWith('/'))ref=ref.slice(1);
 let notation:'id'|'name',keys:string[];
 if(ref.startsWith('schema/')){
  const parts=ref.split('/');if(parts.length%2!==0||parts.some((p,i)=>i%2===0?p!==(i===0?'schema':'properties'):!p||/[\s.#/\\@!%&^]/u.test(p)))return block('ODCS_REFERENCE_SYNTAX','','Expected schema/id followed by properties/id pairs');
  notation='id';keys=parts.filter((_,i)=>i%2===1);
 }else{
  if(options.usage!=='foreignKey')return block('ODCS_REFERENCE_USAGE','','Name shorthand is only interpreted for foreign-key references');
  if(!/^[A-Za-z_][A-Za-z0-9_\-]*(\.[A-Za-z_][A-Za-z0-9_\-]*)+$/.test(ref))return block('ODCS_REFERENCE_SYNTAX','','Expected foreign-key name shorthand');
  notation='name';keys=ref.split('.');
 }
 if(options.usage==='foreignKey'&&keys.length<2)return block('ODCS_REFERENCE_TARGET','','Foreign-key references must select a property');
 let parent:NativeJson=root,path='';
 for(const [depth,key] of keys.entries()){
  const collection=depth===0?'schema':'properties',collectionPath=path+'/'+collection;
  if(parent.kind!=='object'||parent.members[collection]?.kind!=='array')return block('ODCS_REFERENCE_STRUCTURE',collectionPath,'Expected an array of schema elements');
  const array:Extract<NativeJson,{kind:'array'}>=parent.members[collection];const matches:{node:NativeJson;index:number}[]=array.items.flatMap((n,i)=>{const identity=n.kind==='object'?n.members[notation]:undefined;return identity?.kind==='string'&&identity.value===key?[{node:n,index:i}]:[];});
  if(matches.length===0)return block('ODCS_REFERENCE_MISSING',collectionPath,'No element with '+notation+' '+JSON.stringify(key));
  if(matches.length!==1)return block('ODCS_REFERENCE_AMBIGUOUS',collectionPath,'Multiple elements with '+notation+' '+JSON.stringify(key));
  parent=matches[0]!.node;path=collectionPath+'/'+matches[0]!.index;
 }
 result.status='resolved';result.target={path,notation,node:copyJson(parent) as unknown as NativeJson};
 diagnostics.push({code:'ODCS_REFERENCE_CONTEXT',path,severity:'warning',message:'Local element lookup only; does not validate foreign-key uniqueness, types, composite cardinality or data constraints'});
 return result;
}
