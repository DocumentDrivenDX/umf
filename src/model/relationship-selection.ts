import {CURRENT_CORE_VERSION} from '../generated/core-model';
import {snapshotSchema} from '../validation/internal-schema';
import currentCore from '../../spec/core/schema.json';
import selectionSchema from '../../spec/core/relationship-metadata-selection-v2.schema.json';
import {copyJson} from './json';
import {UmfError,type Document,type Diagnostic} from './types';
import type {CoreRelationshipIdentity} from './relationships';
import type {CoreRelationship,RelationshipEndpoint,RelationshipTarget} from '../validation/relationships';
import {validateDocument} from '../validation/document';
import {Registry} from '../registry/registry';
import {createValidator} from '../validation/schema';
export interface CoreRelationshipQuery {modules?:string[];names?:string[];identities?:CoreRelationshipIdentity[];sources?:RelationshipEndpoint[];targets?:RelationshipEndpoint[]}
type SelectionSource=Document&{modules:(Document['modules'][number]&{relationships?:CoreRelationship[]})[]};
interface Navigation {name:string|null;from:RelationshipEndpoint[];to:RelationshipEndpoint[]}
export interface CoreRelationshipSelectionEntry {identity:CoreRelationshipIdentity;path:string;relationship:CoreRelationship;sources:{reference:RelationshipEndpoint;recordPath:string}[];targets:{reference:RelationshipTarget;recordPath:string;keyPath:string}[];associationRecord?:{reference:RelationshipEndpoint;recordPath:string};navigation:{forward:Navigation;reverse?:Navigation};uninterpretedPaths:string[]}
export interface CoreRelationshipSelection {operation:'select-core-relationships';version:'2.0.0';source:SelectionSource;query:CoreRelationshipQuery;selection:CoreRelationshipSelectionEntry[];diagnostics:Diagnostic[];residuals:[];provenance:'unverified';navigationScope:'authored-presentation-only'}
const validator=createValidator();validator.addSchema(snapshotSchema(currentCore));const checkSelection=validator.compile(snapshotSchema(selectionSchema));const queryCheck=validator.compile(selectionSchema.$defs.query);
const refId=(r:RelationshipEndpoint)=>JSON.stringify([r.module,r.element]);

export function selectCoreRelationships(input:Document,queryInput:CoreRelationshipQuery,registry=new Registry()):CoreRelationshipSelection {
 const source=copyJson(input) as unknown as SelectionSource,query=copyJson(queryInput) as unknown as CoreRelationshipQuery;
 if(!queryCheck(query))throw new UmfError('RELATIONSHIP_SELECTION_QUERY','Expected exact relationship metadata filters');
 const validation=validateDocument(source,registry);if(source.umf!==CURRENT_CORE_VERSION||!validation.valid)throw new UmfError('RELATIONSHIP_SELECTION_SOURCE','Expected valid current core 0.10.0 document: '+JSON.stringify(validation.diagnostics));
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
 const result=copyJson({operation:'select-core-relationships',version:'2.0.0',source,query,selection,diagnostics:validation.diagnostics,residuals:[],provenance:'unverified',navigationScope:'authored-presentation-only'});
 const resultCheck=checkSelection;
 if(!resultCheck(result))throw new UmfError('RELATIONSHIP_SELECTION_RESULT',JSON.stringify(resultCheck.errors));return result as unknown as CoreRelationshipSelection;
}
