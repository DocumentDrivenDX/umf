import type {CoreKeyDefinition} from '../validation/keys';
import {copyJson} from './json';
import {UmfError,type Document,type Element,type CoreItemTypeReference,type Validation} from './types';
import {validateDocument} from '../validation/document';
import {Registry} from '../registry/registry';
export interface CoreElementQuery {references:'none'|'transitive';modules?:string[];namespaces?:string[];names?:string[];scalarTypes?:string[];cardinalities?:string[];identities?:{module:string;element:string}[];}
export interface CoreElementSelectionEntry {module:string;namespace:string;path:string;element:Element;includedBy:'match'|'reference';}
export interface CoreElementSelection {scope:'core-elements';referenceScope:'explicit-core-references'|'explicit-core-references-and-item-types'|'explicit-core-references-item-types-members-and-keys';source:Document;query:CoreElementQuery;sourceValidation:Validation;selection:CoreElementSelectionEntry[];boundaryReferences:{from:{module:string;element:string};reference:NonNullable<Element['references']>[number];targetPath:string}[];boundaryMembers?:{from:{module:string;element:string};reference:CoreItemTypeReference;path:string;targetPath:string}[];boundaryKeyFields?:{from:{module:string;element:string};key:string;reference:CoreItemTypeReference;path:string;targetPath:string}[];boundaryItemTypes?:{from:{module:string;element:string};reference:CoreItemTypeReference;path:string;targetPath:string}[];}
/** Select core metadata with full source context and explicitly scoped reference traversal. */
export function selectCoreElements(input:Document,queryInput:CoreElementQuery,registry=new Registry()):CoreElementSelection{
 const source=copyJson(input) as unknown as Document,query=copyJson(queryInput) as unknown as CoreElementQuery;
 const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
 const filters=['modules','namespaces','names','scalarTypes','cardinalities'] as const;
 if(!object(query)||!['none','transitive'].includes(query.references)||Object.keys(query).some(k=>!['references',...filters,'identities'].includes(k))||filters.some(k=>query[k]!==undefined&&(!Array.isArray(query[k])||query[k]!.some(v=>typeof v!=='string'||(k==='scalarTypes'||k==='cardinalities')&&!v)))||query.identities!==undefined&&(!Array.isArray(query.identities)||query.identities.some(v=>!object(v)||typeof v.module!=='string'||!v.module||typeof v.element!=='string'||!v.element||Object.keys(v).some(k=>!['module','element'].includes(k)))))throw new UmfError('CORE_SELECTION_QUERY','Expected exact core filters and explicit reference traversal policy');
 const sourceValidation=validateDocument(source,registry);if(!sourceValidation.valid)throw new UmfError('CORE_SELECTION_SOURCE',JSON.stringify(sourceValidation.diagnostics));
 const keyProfile=source.umf==='0.6.0'||source.umf==='0.7.0',cardinalityProfile=source.umf==='0.4.0'||source.umf==='0.5.0'||keyProfile;
 if(query.cardinalities!==undefined&&!cardinalityProfile)throw new UmfError('CORE_SELECTION_PROFILE','Cardinality filtering requires an explicit 0.4.0, 0.5.0, 0.6.0 or 0.7.0 envelope; older lookalike members are opaque');
 const key=(module:string,element:string)=>JSON.stringify([module,element]),entries:CoreElementSelectionEntry[]=[],index=new Map<string,CoreElementSelectionEntry>(),matched=new Set<string>();
 const identities=query.identities===undefined?undefined:new Set(query.identities.map(v=>key(v.module,v.element)));
 const sets=Object.fromEntries(filters.map(k=>[k,query[k]===undefined?undefined:new Set(query[k])])) as Record<typeof filters[number],Set<string>|undefined>;
 const matches=(filter:typeof filters[number],value:string|undefined)=>sets[filter]===undefined||value!==undefined&&sets[filter]!.has(value);
 source.modules.forEach((m,mi)=>m.elements.forEach((e,ei)=>{
  const id=key(m.id,e.id),entry:CoreElementSelectionEntry={module:m.id,namespace:m.namespace,path:'/modules/'+mi+'/elements/'+ei,element:copyJson(e) as unknown as Element,includedBy:'reference'};entries.push(entry);index.set(id,entry);
  if(matches('modules',m.id)&&matches('namespaces',m.namespace)&&matches('names',e.name)&&matches('scalarTypes',e.scalarType)&&matches('cardinalities',cardinalityProfile&&typeof e.cardinality==='string'?e.cardinality:undefined)&&(identities===undefined||identities.has(id))){matched.add(id);entry.includedBy='match';}
 }));
 const itemType=(e:Element)=>cardinalityProfile&&Object.hasOwn(e,'itemType')?e.itemType as CoreItemTypeReference:undefined;
 const members=(e:Element)=>keyProfile?(e.members??[]) as CoreItemTypeReference[]:[];
 const keyFields=(e:Element)=>keyProfile?((e.keys??[]) as CoreKeyDefinition[]).flatMap((k,ki)=>k.fields.map((reference,fi)=>({key:k.id,ki,fi,reference}))):[];
 const outgoing=(e:Element)=>[...(e.references??[]),...(itemType(e)?[itemType(e)!]:[]),...members(e),...keyFields(e).map(f=>f.reference)];
 const included=new Set(matched),queue=[...matched];
 if(query.references==='transitive')for(let next=0;next<queue.length;next++)for(const ref of outgoing(index.get(queue[next]!)!.element)){const id=key(ref.module,ref.element);if(!included.has(id)){included.add(id);queue.push(id);}}
 const selection=entries.filter(e=>included.has(key(e.module,e.element.id))),boundaryReferences:CoreElementSelection['boundaryReferences']=[];
 for(const e of selection)for(const ref of e.element.references??[])if(!included.has(key(ref.module,ref.element)))boundaryReferences.push({from:{module:e.module,element:e.element.id},reference:copyJson(ref) as NonNullable<Element['references']>[number],targetPath:index.get(key(ref.module,ref.element))!.path});
 const boundaryItemTypes:NonNullable<CoreElementSelection['boundaryItemTypes']>=[];
 if(cardinalityProfile)for(const e of selection){const ref=itemType(e.element);if(ref&&!included.has(key(ref.module,ref.element)))boundaryItemTypes.push({from:{module:e.module,element:e.element.id},reference:copyJson(ref) as unknown as CoreItemTypeReference,path:e.path+'/itemType',targetPath:index.get(key(ref.module,ref.element))!.path});}
 const boundaryMembers:NonNullable<CoreElementSelection['boundaryMembers']>=[],boundaryKeyFields:NonNullable<CoreElementSelection['boundaryKeyFields']>=[];
 if(keyProfile)for(const e of selection){
  members(e.element).forEach((ref,i)=>{if(!included.has(key(ref.module,ref.element)))boundaryMembers.push({from:{module:e.module,element:e.element.id},reference:copyJson(ref) as unknown as CoreItemTypeReference,path:e.path+'/members/'+i,targetPath:index.get(key(ref.module,ref.element))!.path});});
  for(const f of keyFields(e.element))if(!included.has(key(f.reference.module,f.reference.element)))boundaryKeyFields.push({from:{module:e.module,element:e.element.id},key:f.key,reference:copyJson(f.reference) as unknown as CoreItemTypeReference,path:e.path+`/keys/${f.ki}/fields/${f.fi}`,targetPath:index.get(key(f.reference.module,f.reference.element))!.path});
 }
 return copyJson({scope:'core-elements',referenceScope:keyProfile?'explicit-core-references-item-types-members-and-keys':cardinalityProfile?'explicit-core-references-and-item-types':'explicit-core-references',source,query,sourceValidation,selection,boundaryReferences,...(cardinalityProfile?{boundaryItemTypes}:{}),...(keyProfile?{boundaryMembers,boundaryKeyFields}:{})}) as unknown as CoreElementSelection;
}
