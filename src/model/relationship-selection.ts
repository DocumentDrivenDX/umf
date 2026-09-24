import {copyJson} from './json';
import {UmfError,type Document,type Diagnostic,type Json} from './types';
import type {CoreRelationshipIdentity} from './relationships';
import type {CoreRelationship,RelationshipEndpoint,RelationshipTarget,RelationshipCandidate} from '../validation/relationships';
import {validateDocument} from '../validation/document';
import {Registry} from '../registry/registry';
import {createValidator} from '../validation/schema';
import core from '../../spec/core/relationship-document.schema.json';
import schema from '../../spec/core/relationship-metadata-selection.schema.json';
export interface CoreRelationshipQuery {modules?:string[];names?:string[];identities?:CoreRelationshipIdentity[];sources?:RelationshipEndpoint[];targets?:RelationshipEndpoint[]}
interface Navigation {name:string|null;from:RelationshipEndpoint[];to:RelationshipEndpoint[]}
export interface CoreRelationshipSelectionEntry {identity:CoreRelationshipIdentity;path:string;relationship:CoreRelationship;sources:{reference:RelationshipEndpoint;recordPath:string}[];targets:{reference:RelationshipTarget;recordPath:string;keyPath:string}[];associationRecord?:{reference:RelationshipEndpoint;recordPath:string};navigation:{forward:Navigation;reverse?:Navigation};uninterpretedPaths:string[]}
export interface CoreRelationshipSelection {operation:'select-core-relationships';version:'1.0.0';source:RelationshipCandidate;query:CoreRelationshipQuery;selection:CoreRelationshipSelectionEntry[];diagnostics:Diagnostic[];residuals:[];provenance:'unverified';navigationScope:'authored-presentation-only'}
const validator=createValidator();validator.addSchema(core);const check=validator.compile(schema),queryCheck=validator.compile(schema.$defs.query);
const refId=(r:RelationshipEndpoint)=>JSON.stringify([r.module,r.element]);
const canonical=(v:Json):string=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v!==null&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k]!)).join(',')+'}':JSON.stringify(v);

export function selectCoreRelationships(input:Document,queryInput:CoreRelationshipQuery,registry=new Registry()):CoreRelationshipSelection {
 const source=copyJson(input) as unknown as RelationshipCandidate,query=copyJson(queryInput) as unknown as CoreRelationshipQuery;
 if(!queryCheck(query))throw new UmfError('RELATIONSHIP_SELECTION_QUERY','Expected exact relationship metadata filters');
 const validation=validateDocument(source,registry);if(source.umf!=='0.7.0'||!validation.valid)throw new UmfError('RELATIONSHIP_SELECTION_SOURCE','Expected valid explicit 0.7.0 document: '+JSON.stringify(validation.diagnostics));
 const records=new Map<string,{path:string;element:Document['modules'][number]['elements'][number]}>();
 source.modules.forEach((m,mi)=>m.elements.forEach((e,ei)=>records.set(refId({module:m.id,element:e.id}),{path:`/modules/${mi}/elements/${ei}`,element:e})));
 const endpoint=(reference:RelationshipEndpoint)=>({reference,recordPath:records.get(refId(reference))!.path});
 const matchesEnd=(filter:RelationshipEndpoint[]|undefined,values:RelationshipEndpoint[])=>filter===undefined||filter.some(f=>values.some(v=>refId(f)===refId(v)));
 const selection:CoreRelationshipSelectionEntry[]=[];
 source.modules.forEach((module,mi)=>(module.relationships??[]).forEach((relationship,ri)=>{
  if(query.modules&&!query.modules.includes(module.id)||query.names&&!query.names.includes(relationship.name)||query.identities&&!query.identities.some(i=>i.module===module.id&&i.id===relationship.id)||!matchesEnd(query.sources,relationship.source)||!matchesEnd(query.targets,relationship.target))return;
  const path=`/modules/${mi}/relationships/${ri}`,bare=(r:RelationshipEndpoint)=>({module:r.module,element:r.element});
  const forward={name:relationship.name,from:relationship.source.map(bare),to:relationship.target.map(bare)};
  const reverse=relationship.inverse!==undefined||!relationship.directed?{name:relationship.inverse??null,from:relationship.target.map(bare),to:relationship.source.map(bare)}:undefined;
  selection.push({identity:{module:module.id,id:relationship.id},path,relationship,sources:relationship.source.map(endpoint),targets:relationship.target.map(reference=>{
   const record=records.get(refId(reference))!,keys=record.element.keys as {id:string}[];
   return {...endpoint(reference),reference,keyPath:record.path+'/keys/'+keys.findIndex(k=>k.id===reference.key)};
  }),...(relationship.associationRecord?{associationRecord:endpoint(relationship.associationRecord)}:{}),navigation:{forward,...(reverse?{reverse}:{})},uninterpretedPaths:validation.diagnostics.filter(d=>d.code.startsWith('UNKNOWN_RELATIONSHIP_')&&d.path.startsWith(path+'/')).map(d=>d.path)});
 }));
 const result=copyJson({operation:'select-core-relationships',version:'1.0.0',source,query,selection,diagnostics:validation.diagnostics,residuals:[],provenance:'unverified',navigationScope:'authored-presentation-only'});
 if(!check(result))throw new UmfError('RELATIONSHIP_SELECTION_RESULT',JSON.stringify(check.errors));return result as unknown as CoreRelationshipSelection;
}
export function verifyCoreRelationshipSelection(input:CoreRelationshipSelection,registry=new Registry()):CoreRelationshipSelection {
 const receipt=copyJson(input) as unknown as CoreRelationshipSelection;if(!check(receipt))throw new UmfError('RELATIONSHIP_SELECTION_RECEIPT','Malformed relationship selection');
 const expected=selectCoreRelationships(receipt.source,receipt.query,registry);
 if(canonical(copyJson(expected))!==canonical(copyJson(receipt)))throw new UmfError('RELATIONSHIP_SELECTION_RECEIPT','Selection differs from retained context');return expected;
}
