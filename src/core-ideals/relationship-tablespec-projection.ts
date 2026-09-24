import {copyJson} from '../model/json';
import {UmfError,type Document,type Json,type Diagnostic} from '../model/types';
import {lookupCoreRelationship,verifyCoreRelationshipOperation,type CoreRelationshipDeclaration,type CoreRelationshipIdentity} from '../model/relationships';
import type {RelationshipEndpoint} from '../validation/relationships';
import type {CoreKeyDefinition} from '../validation/keys';
import {validateDocument} from '../validation/document';
import {getTableSpecTable,exportTableSpec,exportTableSpecBundle,editTableSpecTable,TABLESPEC_EXTENSION} from '../adapters/tablespec';
import {parseNativeJson,renderTree,type NativeJson} from '../model/native-json';
import {createValidator} from '../validation/schema';
import legacy from '../../spec/core/schema.json';import fields from '../../spec/core/field-document.schema.json';import nullability from '../../spec/core/nullability-document.schema.json';import cardinality from '../../spec/core/cardinality-document.schema.json';import facets from '../../spec/core/facet-document.schema.json';import keys from '../../spec/core/key-document.schema.json';import relationships from '../../spec/core/relationship-document.schema.json';import authorSchema from '../../spec/core/relationship-operation.schema.json';
import nativeSchema from '../../native/tablespec/sources/src/tablespec/schemas/umf.schema.json';
import schema from '../../spec/core/relationship-tablespec-projection.schema.json';
export {default as relationshipTableSpecProjectionSchema} from '../../spec/core/relationship-tablespec-projection.schema.json';
export interface RelationshipTableSpecRequest {profile:'outgoing-metadata';relationship:CoreRelationshipIdentity;mode:'strict'|'report';columns:{sourceColumn:string;targetField:{module:string;element:string};targetColumn:string}[]}
const binding=schema.properties.binding.const;
const recovery='Retained receipt recovers authored meaning and original native sources; native-only import does not establish authored intent' as const;
export interface RelationshipTableSpecProjection {
 operation:'project-relationship-tablespec';version:'1.0.0';status:'projected'|'blocked';outcome:'approximated'|'not-expressible'|'unknown';
 source:Document;author:CoreRelationshipDeclaration;nativeSource:Document;nativeTarget:Document;request:RelationshipTableSpecRequest;binding:typeof binding;target?:Document;
 mappings:{idealPath:string;nativePath:string;outcome:'approximated';sourceColumns:string[];targetColumns:string[];targetKey:string}[];
 residuals:{path:string;value:Json;outcome:'unknown'|'not-expressible'|'approximated';reason:string;recovery:typeof recovery}[];diagnostics:Diagnostic[];
}
const validator=createValidator(false);for(const s of [legacy,fields,nullability,cardinality,facets,keys,relationships,authorSchema])validator.addSchema(s);
const check=validator.compile(schema),requestCheck=validator.compile(schema.properties.request),nativeCheck=createValidator(false).compile(nativeSchema);
const canonical=(v:Json):string=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v!==null&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k]!)).join(',')+'}':JSON.stringify(v);
const same=(a:unknown,b:unknown)=>canonical(copyJson(a))===canonical(copyJson(b));
const id=(r:RelationshipEndpoint)=>JSON.stringify([r.module,r.element]);
const text=(n:NativeJson|undefined)=>n?.kind==='string'?n.value:null;
function archive(d:Document):string|Record<string,string>{const p=d.extensions?.[TABLESPEC_EXTENSION];return p&&typeof p==='object'&&!Array.isArray(p)&&Object.hasOwn(p,'splitFiles')?exportTableSpecBundle(d):exportTableSpec(d);}
function locate(d:Document,ref:RelationshipEndpoint){const m=d.modules.find(x=>x.id===ref.module),e=m?.elements.find(x=>x.id===ref.element);if(!e)throw new UmfError('RELATIONSHIP_TABLESPEC_REFERENCE','Unresolved logical element');return e;}
/** Explicit metadata lowering; no native execution or author-intent inference. */
export function projectRelationshipToTableSpec(input:Document,authorInput:CoreRelationshipDeclaration,nativeSourceInput:Document,nativeTargetInput:Document,options:RelationshipTableSpecRequest):RelationshipTableSpecProjection {
 const source=copyJson(input) as unknown as Document,author=copyJson(authorInput) as unknown as CoreRelationshipDeclaration,nativeSource=copyJson(nativeSourceInput) as unknown as Document,nativeTarget=copyJson(nativeTargetInput) as unknown as Document,request=copyJson(options) as unknown as RelationshipTableSpecRequest;
 if(!requestCheck(request))throw new UmfError('RELATIONSHIP_TABLESPEC_REQUEST',JSON.stringify(requestCheck.errors));
 if(source.umf!=='0.7.0'||!validateDocument(source).valid)throw new UmfError('RELATIONSHIP_TABLESPEC_SOURCE','Valid core 0.7.0 required');
 if(author.operation!=='declare-core-relationship')throw new UmfError('RELATIONSHIP_TABLESPEC_AUTHOR','Expected explicit relationship declaration');
 verifyCoreRelationshipOperation(author,author.target);
 if(author.target.id!==source.id||author.identity.module!==request.relationship.module||author.request.id!==request.relationship.id)throw new UmfError('RELATIONSHIP_TABLESPEC_AUTHOR','Mismatched author identity');
 const current=lookupCoreRelationship(source,request.relationship),prior=lookupCoreRelationship(author.target,request.relationship),rel=current.relationship;
 if(!same(rel,prior.relationship))throw new UmfError('RELATIONSHIP_TABLESPEC_STALE','Relationship changed since authoring');
 for(const endpoint of [...rel.source,...rel.target,...(rel.associationRecord?[rel.associationRecord]:[])]){
  const e=locate(source,endpoint),old=locate(author.target,endpoint);
  if(!same(e,old))throw new UmfError('RELATIONSHIP_TABLESPEC_STALE','Endpoint Record or Key changed since authoring');
  for(const member of (e.members??[]) as RelationshipEndpoint[])if(!same(locate(source,member),locate(author.target,member)))throw new UmfError('RELATIONSHIP_TABLESPEC_STALE','Endpoint component changed since authoring');
 }
 archive(nativeSource);archive(nativeTarget);
 const from=getTableSpecTable(nativeSource),to=getTableSpecTable(nativeTarget);
 if(from.kind!=='object'||to.kind!=='object')throw new UmfError('RELATIONSHIP_TABLESPEC_NATIVE','Expected native table objects');
 const r:RelationshipTableSpecProjection={operation:'project-relationship-tablespec',version:'1.0.0',status:'projected',outcome:'approximated',source,author,nativeSource,nativeTarget,request,binding,mappings:[],residuals:[],diagnostics:[]};
 let impossible=false;
 const loss=(path:string,value:unknown,reason:string,outcome:'unknown'|'not-expressible'|'approximated'='not-expressible')=>r.residuals.push({path,value:copyJson(value),reason,outcome,recovery});
 const block=(path:string,value:unknown,reason:string)=>{impossible=true;loss(path,value,reason);};
 loss('/',source,'Only the selected relationship metadata is emitted; the complete logical model and unknown content recover from this retained source');
 for(const key of ['id','name','source','target','sourceMultiplicity','targetMultiplicity','targetLifecycle','directed','inverse','associationRecord'])if(Object.hasOwn(rel,key))loss(current.path+'/'+key,rel[key],'Native outgoing metadata does not establish this authored obligation; stable identity, Key semantics, checked participation, lifecycle and presentation intent require the retained receipt');
 for(const path of current.uninterpretedPaths){
  let value:unknown=source;for(const part of path.slice(1).split('/').map(p=>p.replace(/~1/g,'/').replace(/~0/g,'~'))){
   if(value===null||typeof value!=='object'||!Object.hasOwn(value,part))throw new UmfError('RELATIONSHIP_TABLESPEC_PATH','Unresolved qualifier diagnostic path');
   value=(value as Record<string,unknown>)[part];
  }
  loss(path,value,'Unknown relationship qualifier remains uninterpreted','unknown');
 }
 if(rel.source.length!==1||rel.target.length!==1)block(current.path,rel,'This outgoing-metadata profile cannot emit heterogeneous endpoint sets');
 if(rel.associationRecord)block(current.path+'/associationRecord',rel.associationRecord,'A separately keyed association Record requires an explicit physical layout; no attributes or identity may be discarded');
 for(const [label,node] of [['nativeSource',from],['nativeTarget',to]] as const){
  if(!nativeCheck(JSON.parse(renderTree(node))))block('/'+label,node,'Pinned native JSON Schema rejects the supplied table; original archive remains retained');
  const nativeColumns=node.members.columns?.kind==='array'?node.members.columns.items:[];
  const columnNames=new Set(nativeColumns.map(c=>c.kind==='object'?text(c.members.name):null));
  const primary=node.members.primary_key;
  if(primary?.kind==='array'&&primary.items.some(c=>c.kind==='string'&&!c.value.startsWith('meta_')&&!columnNames.has(c.value)))block('/'+label+'/primary_key',primary,'Pinned native model rejects primary-key columns absent from the supplied table');
  const context=node.members.context_column;
  if(context?.kind==='string'&&!columnNames.has(context.value))block('/'+label+'/context_column',context,'Pinned native model requires context_column to resolve locally');
  for(const [i,c] of nativeColumns.entries())if(c.kind==='object'){
   const embedding=text(c.members.data_type)?.toUpperCase()==='EMBEDDING',dimension=c.members.dimension;
   if(embedding?dimension===undefined||dimension.kind==='null':dimension!==undefined&&dimension.kind!=='null')block('/'+label+'/columns/'+i,c,'Pinned native model requires dimension for EMBEDDING and forbids it on other native types');
  }
  const names=[text(node.members.table_name),...(node.members.columns?.kind==='array'?node.members.columns.items.map(c=>c.kind==='object'?text(c.members.name):null):[])];
  if(names.some(n=>n===null||n.length>128||!/^[A-Za-z][A-Za-z0-9_]*(?![\s\S])/.test(n)))block('/'+label,node,'Pinned native model requires ASCII identifiers of at most 128 characters; no normalization is allowed');
 }
 const targetName=text(to.members.table_name)!;
 if(rel.source.length===1&&rel.target.length===1){
  const self=id(rel.source[0]!)===id(rel.target[0]!);
  if(self?!same(from,to):text(from.members.table_name)===targetName)block('/nativeTarget',to,'Self relationships require the same native table; distinct Records require distinct native table names in this profile');
 }
 const key=rel.target.length===1?(locate(source,rel.target[0]!).keys as CoreKeyDefinition[]).find(k=>k.id===rel.target[0]!.key):undefined;
 if(key&&(request.columns.length!==key.fields.length||request.columns.some((c,i)=>id(c.targetField)!==id(key.fields[i]!))))block('/request/columns',request.columns,'Ordered column pairs must cover the selected target Key Fields exactly once in Key order');
 if(new Set(request.columns.map(c=>c.sourceColumn)).size!==request.columns.length||new Set(request.columns.map(c=>c.targetColumn)).size!==request.columns.length)block('/request/columns',request.columns,'Native columns must be unique on each side');
 const column=(table:typeof from,name:string)=>table.members.columns?.kind==='array'?table.members.columns.items.find(c=>c.kind==='object'&&text(c.members.name)===name):undefined;
 const families:Record<string,string>={INTEGER:'integer',BOOLEAN:'boolean',TEXT:'string',VARCHAR:'string',CHAR:'string',FLOAT:'float',DECIMAL:'decimal',DATE:'date',DATETIME:'timestamp',TIMESTAMP:'timestamp'};
 for(const [i,c] of request.columns.entries()){
  const a=column(from,c.sourceColumn),b=column(to,c.targetColumn),logical=key?.fields.find(f=>id(f)===id(c.targetField));
  if(a?.kind!=='object'||b?.kind!=='object'){block('/request/columns/'+i,c,'A native column does not resolve');continue;}
  const at=text(a.members.data_type),bt=text(b.members.data_type),field=logical?locate(source,logical):undefined;
  if(!at||!bt||at!==bt||!Object.hasOwn(families,bt)||field?.scalarType!==families[bt]||field?.cardinality!=='one')block('/request/columns/'+i,c,'Selected native scalar carriers must match each other and the logical target Key Field');
  loss('/request/columns/'+i,c,'Column pairing is an explicit physical choice; comparators, native domains and row-level enforcement remain unproved','unknown');
 }
 const old=from.members.relationships;
 if(old&&old.kind!=='null'&&old.kind!=='object')block('/nativeSource/relationships',old,'Existing relationship metadata is not an object');
 const outgoing=old?.kind==='object'?old.members.outgoing:undefined;
 if(outgoing&&outgoing.kind!=='null'&&outgoing.kind!=='array')block('/nativeSource/relationships/outgoing',outgoing,'Existing outgoing metadata is not an array');
 if(outgoing?.kind==='array'&&outgoing.items.some(x=>x.kind!=='object'||text(x.members.target_table)===targetName))block('/nativeSource/relationships/outgoing',outgoing,'Existing outgoing metadata conflicts with or cannot be distinguished from the requested target; no overwrite or implicit join merge');
 if(impossible||request.mode==='strict'){r.status='blocked';r.outcome=impossible?'not-expressible':'unknown';}
 else{
  const bound=(m:typeof rel.sourceMultiplicity)=>m.min===m.max?String(m.min):`${m.min}..${m.max}`;
  const many=(m:typeof rel.sourceMultiplicity)=>m.max==='*'||m.max>1;
  const first=request.columns[0]!,entry={target_table:targetName,source_column:first.sourceColumn,target_column:first.targetColumn,type:'reference',confidence:1,
   reasoning:'Explicit UMF metadata projection; confidence does not assert referential enforcement',cardinality:{type:`${many(rel.sourceMultiplicity)?'many':'one'}_to_${many(rel.targetMultiplicity)?'many':'one'}`,notation:`${many(rel.sourceMultiplicity)?'N':'1'}:${many(rel.targetMultiplicity)?'N':'1'}`,source_multiplicity:bound(rel.sourceMultiplicity),target_multiplicity:bound(rel.targetMultiplicity),mandatory:rel.targetMultiplicity.min>0,composite_key:request.columns.length>1},
   ...(request.columns.length>1?{join_conditions:request.columns.slice(1).map(c=>({source_column:c.sourceColumn,target_column:c.targetColumn}))}:{})};
  const metadata:Extract<NativeJson,{kind:'object'}>=old?.kind==='object'?copyJson(old) as typeof metadata:{kind:'object',members:{}};
  const items=outgoing?.kind==='array'?copyJson(outgoing.items) as NativeJson[]:[];const index=items.length;items.push(parseNativeJson(JSON.stringify(entry)));metadata.members.outgoing={kind:'array',items};
  const candidate=editTableSpecTable(nativeSource,{relationships:metadata});
  if(!nativeCheck(JSON.parse(renderTree(getTableSpecTable(candidate))))){r.status='blocked';r.outcome='not-expressible';loss('/nativeSource',from,'Emitted carrier failed pinned native structural validation');}
  else {r.target=candidate;r.mappings.push({idealPath:current.path,nativePath:`/extensions/umf.tablespec/root/members/relationships/members/outgoing/items/${index}`,outcome:'approximated',sourceColumns:request.columns.map(c=>c.sourceColumn),targetColumns:request.columns.map(c=>c.targetColumn),targetKey:rel.target[0]!.key});}
 }
 r.diagnostics=r.residuals.map(x=>({code:'RELATIONSHIP_TABLESPEC_LOSS',path:x.path,message:x.reason,severity:r.status==='blocked'?'error':'warning'}));
 const result=copyJson(r);if(!check(result))throw new UmfError('RELATIONSHIP_TABLESPEC_RESULT',JSON.stringify(check.errors));return result as unknown as RelationshipTableSpecProjection;
}
/** Recomputes retained consistency; does not authenticate authors or native execution. */
export function verifyRelationshipTableSpecProjection(input:RelationshipTableSpecProjection,current:Document):RelationshipTableSpecProjection {
 const r=copyJson(input) as unknown as RelationshipTableSpecProjection;if(!check(r)||r.status!=='projected')throw new UmfError('RELATIONSHIP_TABLESPEC_RECEIPT','Expected successful projection receipt');
 if(!same(r,projectRelationshipToTableSpec(r.source,r.author,r.nativeSource,r.nativeTarget,r.request)))throw new UmfError('RELATIONSHIP_TABLESPEC_RECEIPT','Forged or inconsistent retained projection');
 if(!same(getTableSpecTable(current),getTableSpecTable(r.target!))||!same(archive(current),archive(r.target!)))throw new UmfError('RELATIONSHIP_TABLESPEC_STALE','Emitted native representation changed');return r;
}
export function recoverRelationshipTableSpecIdeal(input:RelationshipTableSpecProjection,current:Document):Document{return copyJson(verifyRelationshipTableSpecProjection(input,current).source) as unknown as Document;}
export function recoverRelationshipTableSpecNativeSources(input:RelationshipTableSpecProjection,current:Document){const r=verifyRelationshipTableSpecProjection(input,current);return {source:archive(r.nativeSource),target:archive(r.nativeTarget)};}
