import {copyJson} from '../model/json';
import {UmfError,pointer,type Document,type Json,type Diagnostic,type ExtensionPackage} from '../model/types';
import {parseNativeJson,renderTree,type NativeJson} from '../model/native-json';
import {importPostgresqlSql,getPostgresqlSource,getPostgresqlNode,exportPostgresqlSql,type PostgresqlBackend} from '../adapters/postgresql';
import {exportPostgresqlCatalogCapture,getPostgresqlCatalogNode} from '../adapters/postgresql/catalog';
import {validateDocument} from '../validation/document';
import {verifyCoreRelationshipOperation,lookupCoreRelationship,type CoreRelationshipDeclaration} from '../model/relationships';
import {validatePostgresqlRelationshipLayout,type PostgresqlRelationshipLayoutPolicy,type PostgresqlRelationshipLayoutResult,type PostgresqlLayoutType} from '../projections/ddd-postgresql/relationship-layout';
import {identifier,literal} from './postgresql-syntax';
import {createValidator} from '../validation/schema';
import core from '../../spec/core/schema.json';import fields from '../../spec/core/field-document.schema.json';import availability from '../../spec/core/nullability-document.schema.json';import containers from '../../spec/core/cardinality-document.schema.json';import facets from '../../spec/core/facet-document.schema.json';import keys from '../../spec/core/key-document.schema.json';import relationships from '../../spec/core/relationship-document.schema.json';import operation from '../../spec/core/relationship-operation.schema.json';import native from '../../spec/core/native-json.schema.json';import layoutSchema from '../../spec/projections/postgresql-relationship-layout.schema.json';import layoutResult from '../../spec/projections/postgresql-relationship-layout-result.schema.json';
import classificationSchema from '../../spec/core/postgresql-relationship-classification.schema.json';import projectionSchema from '../../spec/core/relationship-postgresql-projection.schema.json';import manifest from '../../spec/extensions/postgresql-relationships/package.json';
export const POSTGRESQL_RELATIONSHIPS_EXTENSION='umf.postgresql.relationships';
export const postgresqlRelationshipsPackage=manifest as unknown as ExtensionPackage;
export {default as postgresqlRelationshipClassificationSchema} from '../../spec/core/postgresql-relationship-classification.schema.json';
export {default as relationshipPostgresqlProjectionSchema} from '../../spec/core/relationship-postgresql-projection.schema.json';
const validator=createValidator(false);for(const schema of [core,fields,availability,containers,facets,keys,relationships,operation,native,layoutSchema,layoutResult])validator.addSchema(schema);
const classificationCheck=validator.compile(classificationSchema),classificationRequestCheck=validator.compile(classificationSchema.properties.request),projectionCheck=validator.compile(projectionSchema),projectionRequestCheck=validator.compile(projectionSchema.properties.request);
const binding=classificationSchema.properties.binding.const;
const canonical=(v:Json):string=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v!==null&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k]!)).join(',')+'}':JSON.stringify(v);
const same=(a:unknown,b:unknown)=>canonical(copyJson(a))===canonical(copyJson(b));
const qualified=(value:string)=>value.split('.').map(identifier).join('.');
const keyId=(r:{module:string;element:string;key:string})=>JSON.stringify([r.module,r.element,r.key]);
const relId=(r:{module:string;id:string})=>JSON.stringify([r.module,r.id]);
const view=(node:NativeJson):any=>JSON.parse(renderTree(node));
interface Residual {source:'logical'|'binding'|'policy'|'native';path:string;value:Json;outcome:'unknown'|'not-expressible'|'approximated';reason:string}
export interface PostgresqlRelationshipObservation {
 nativePath:string;nativeNode:NativeJson;origin:'ddl'|'catalog';name:string|null;sourceTable:string|null;targetTable:string|null;sourceColumns:string[];targetColumns:string[];targetKeyCandidates:string[];
 match:'simple'|'full'|'partial'|'unknown';onUpdate:'no-action'|'restrict'|'cascade'|'set-null'|'set-default'|'unknown';onDelete:PostgresqlRelationshipObservation['onUpdate'];validated:boolean|null;deferrable:boolean;initiallyDeferred:boolean;authorIntent:'unknown';enforcement:'unverified-native-observation';
}
export interface PostgresqlRelationshipRequest {profile:'raw-ddl'|'captured-catalog';mode:'strict'|'report';nativeSource:string}
export interface PostgresqlRelationshipClassification {operation:'classify-postgresql-relationships';version:'1.0.0';status:'classified'|'blocked';source:Document;target?:Document;request:PostgresqlRelationshipRequest;binding:typeof binding;observations:PostgresqlRelationshipObservation[];residuals:Residual[];diagnostics:Diagnostic[]}
function foreignNodes(root:NativeJson){const rows:{path:string;node:NativeJson;constraint:any}[]=[];function walk(n:NativeJson,path:string){if(n.kind==='object'){const c=n.members.Constraint;if(c?.kind==='object'&&c.members.contype?.kind==='string'&&c.members.contype.value==='CONSTR_FOREIGN')rows.push({path:path+'/Constraint',node:c,constraint:view(c)});for(const [key,value] of Object.entries(n.members))walk(value,path+'/'+pointer(key));}else if(n.kind==='array')n.items.forEach((v,i)=>walk(v,path+'/'+i));}walk(root,'');return rows;}
const columns=(value:any):string[]=>Array.isArray(value)?value.map(v=>v.String?.sval).filter((v:any)=>typeof v==='string'):[];
function observe(path:string,node:NativeJson,c:any,origin:'ddl'|'catalog',sourceTable:string|null,validated:boolean|null):PostgresqlRelationshipObservation {
 const actions:Record<string,PostgresqlRelationshipObservation['onUpdate']>={a:'no-action',r:'restrict',c:'cascade',n:'set-null',d:'set-default'};
 return {nativePath:path,nativeNode:copyJson(node) as unknown as NativeJson,origin,name:typeof c.conname==='string'?c.conname:null,sourceTable,targetTable:typeof c.pktable?.schemaname==='string'&&typeof c.pktable?.relname==='string'?c.pktable.schemaname+'.'+c.pktable.relname:null,sourceColumns:columns(c.fk_attrs),targetColumns:columns(c.pk_attrs),targetKeyCandidates:[],match:({s:'simple',f:'full',p:'partial'} as const)[c.fk_matchtype as 's'|'f'|'p']??'unknown',onUpdate:actions[c.fk_upd_action]??'unknown',onDelete:actions[c.fk_del_action]??'unknown',validated,deferrable:c.deferrable===true,initiallyDeferred:c.initdeferred===true,authorIntent:'unknown',enforcement:'unverified-native-observation'};
}
/** Native declarations/observations remain distinct from authored association intent. */
export async function classifyPostgresqlRelationships(input:Document,options:PostgresqlRelationshipRequest,backend:PostgresqlBackend):Promise<PostgresqlRelationshipClassification>{
 const source=copyJson(input) as unknown as Document,request=copyJson(options) as unknown as PostgresqlRelationshipRequest;
 if(!classificationRequestCheck(request))throw new UmfError('POSTGRESQL_RELATIONSHIP_REQUEST',JSON.stringify(classificationRequestCheck.errors));
 const result:PostgresqlRelationshipClassification={operation:'classify-postgresql-relationships',version:'1.0.0',status:'classified',source,request,binding,observations:[],residuals:[],diagnostics:[]};
 const loss=(path:string,value:unknown,reason:string)=>result.residuals.push({source:'native',path,value:copyJson(value),outcome:'unknown',reason});
 loss('',request.nativeSource,'Complete native source retained; FK syntax/catalog state does not establish authored stable relationships, participation, lifecycle, inverse navigation or current deployed enforcement');
 if(request.profile==='raw-ddl'){
  if(request.nativeSource!==getPostgresqlSource(source))throw new UmfError('POSTGRESQL_RELATIONSHIP_ARCHIVE','DDL text differs from original archive');
  const tree=getPostgresqlNode(source,''),parsed=parseNativeJson(JSON.stringify(await backend.parse(request.nativeSource)));
  if(!same(tree,parsed))throw new UmfError('POSTGRESQL_RELATIONSHIP_ARCHIVE','DDL AST changed from retained original source');
  for(const row of foreignNodes(tree))result.observations.push(observe(row.path,row.node,row.constraint,'ddl',null,null));
 }else{
  const archive=exportPostgresqlCatalogCapture(source),tree=getPostgresqlCatalogNode(source,''),capture=view(tree);
  if(renderTree(parseNativeJson(request.nativeSource))!==archive.json||archive.state!=='captured'||capture.serverVersion!==170004)throw new UmfError('POSTGRESQL_RELATIONSHIP_ARCHIVE','Expected exact original captured PostgreSQL 17.4 catalog text');
  const relations=capture.snapshot.relations??[],parsedKeys:{table:string;columns:string[];name:string}[]=[];
  const seen=new Set<string>();
  for(const [ri,relation] of relations.entries()){
   const table=relation.schema+'.'+relation.name;if(seen.has(table))throw new UmfError('POSTGRESQL_RELATIONSHIP_CATALOG','Duplicate qualified relation');seen.add(table);
   const names=new Set<string>();
   for(const [ci,c] of (relation.constraints??[]).entries()){
    if(names.has(c.name))throw new UmfError('POSTGRESQL_RELATIONSHIP_CATALOG','Duplicate constraint identity');names.add(c.name);
    if(!['f','p','u'].includes(c.kind))continue;
    const sql='ALTER TABLE '+identifier(relation.schema)+'.'+identifier(relation.name)+' ADD CONSTRAINT '+identifier(c.name)+' '+c.definition+';';
    const parsed=await backend.parse(sql) as any,statement=parsed?.stmts?.[0]?.stmt?.AlterTableStmt,command=statement?.cmds?.[0]?.AlterTableCmd,constraint=command?.def?.Constraint;
    const expected=c.kind==='f'?'CONSTR_FOREIGN':c.kind==='p'?'CONSTR_PRIMARY':'CONSTR_UNIQUE';
    if(parsed?.stmts?.length!==1||statement?.cmds?.length!==1||command?.subtype!=='AT_AddConstraint'||constraint?.contype!==expected||constraint.conname!==c.name||constraint.deferrable===true!==c.deferrable||constraint.initdeferred===true!==c.deferred)throw new UmfError('POSTGRESQL_RELATIONSHIP_CATALOG','Constraint definition disagrees with captured metadata');
    if(c.kind!=='f'){parsedKeys.push({table,columns:columns(constraint.keys),name:c.name});continue;}
    if((constraint.skip_validation!==true)!==c.validated)throw new UmfError('POSTGRESQL_RELATIONSHIP_CATALOG','FK definition validation state disagrees with catalog');
    const path=`/snapshot/relations/${ri}/constraints/${ci}`,node=getPostgresqlCatalogNode(source,path);
    result.observations.push(observe(path,node,constraint,'catalog',table,c.validated));
   }
  }
  for(const row of result.observations)row.targetKeyCandidates=parsedKeys.filter(k=>k.table===row.targetTable&&same(k.columns,row.targetColumns)).map(k=>k.name);
 }
 for(const row of result.observations){
  loss(row.nativePath,row.nativeNode,'Native FK details retained independently: actions, match/NULL exemption, deferral, validation and referenced Key candidates are observations, not author intent');
  if(row.targetTable===null)loss(row.nativePath,row.nativeNode,'Unqualified target table requires explicit native search-path/catalog resolution; null targetTable and empty Key candidates mean unresolved, not absence');
 }
 const conflict=source.extensions&&Object.hasOwn(source.extensions,POSTGRESQL_RELATIONSHIPS_EXTENSION),version=source.vocabularies[POSTGRESQL_RELATIONSHIPS_EXTENSION];
 if(conflict)loss('/extensions/'+POSTGRESQL_RELATIONSHIPS_EXTENSION,source.extensions![POSTGRESQL_RELATIONSHIPS_EXTENSION],'Existing classification content cannot be overwritten');
 if(version&&version.version!=='1.0.0')loss('/vocabularies/'+POSTGRESQL_RELATIONSHIPS_EXTENSION,version,'Unsupported classification vocabulary');
 if(request.mode==='strict'||conflict||version&&version.version!=='1.0.0')result.status='blocked';
 else{result.target=copyJson(source) as unknown as Document;result.target.extensions??={};result.target.vocabularies[POSTGRESQL_RELATIONSHIPS_EXTENSION]={...version,version:'1.0.0'};result.target.extensions[POSTGRESQL_RELATIONSHIPS_EXTENSION]=copyJson({origin:'classified',binding,observations:result.observations});}
 result.diagnostics=result.residuals.map(r=>({code:'POSTGRESQL_RELATIONSHIP_RESIDUAL',path:r.path,message:r.reason,severity:result.status==='blocked'?'error':'warning'}));
 if(!classificationCheck(result))throw new UmfError('POSTGRESQL_RELATIONSHIP_RESULT',JSON.stringify(classificationCheck.errors));return copyJson(result) as unknown as PostgresqlRelationshipClassification;
}
export async function verifyPostgresqlRelationshipClassification(input:PostgresqlRelationshipClassification,current:Document,backend:PostgresqlBackend){const r=copyJson(input) as unknown as PostgresqlRelationshipClassification;if(!classificationCheck(r)||r.status!=='classified'||!same(r,await classifyPostgresqlRelationships(r.source,r.request,backend))||!same(r.target,current))throw new UmfError('POSTGRESQL_RELATIONSHIP_RECEIPT','Invalid, stale or inconsistent retained classification');return r;}
export async function recoverPostgresqlRelationshipSource(input:PostgresqlRelationshipClassification,current:Document,backend:PostgresqlBackend):Promise<string>{return (await verifyPostgresqlRelationshipClassification(input,current,backend)).request.nativeSource;}

export interface RelationshipPostgresqlRequest {id:string;profile:'new-keyed-tables';mode:'strict'|'report';policy:PostgresqlRelationshipLayoutPolicy}
export interface RelationshipPostgresqlProjection {operation:'project-relationships-postgresql';version:'1.0.0';status:'projected'|'blocked';source:Document;physicalBinding:Document;authors:CoreRelationshipDeclaration[];request:RelationshipPostgresqlRequest;binding:typeof binding;layout:PostgresqlRelationshipLayoutResult;target?:Document;nativeSql?:string;mappings:{relationship:{module:string;id:string};idealPath:string;carrierTable:string;constraints:string[];targetKey:string;outcome:'approximated'}[];residuals:Residual[];diagnostics:Diagnostic[]}
/** New ordinary keyed tables, followed by ALTER TABLE FKs. This is not the full DDD generator. */
export async function projectRelationshipsToPostgresql(input:Document,physicalInput:Document,authorInput:CoreRelationshipDeclaration[],options:RelationshipPostgresqlRequest,backend:PostgresqlBackend):Promise<RelationshipPostgresqlProjection>{
 const source=copyJson(input) as unknown as Document,physicalBinding=copyJson(physicalInput) as unknown as Document,authors=copyJson(authorInput) as unknown as CoreRelationshipDeclaration[],request=copyJson(options) as unknown as RelationshipPostgresqlRequest;
 if(!projectionRequestCheck(request))throw new UmfError('RELATIONSHIP_POSTGRESQL_REQUEST',JSON.stringify(projectionRequestCheck.errors));
 if(source.umf!=='0.7.0'||!validateDocument(source).valid)throw new UmfError('RELATIONSHIP_POSTGRESQL_SOURCE','Valid authored core 0.7.0 source required');
 const layout=validatePostgresqlRelationshipLayout(source,physicalBinding,request.policy,'report'),result:RelationshipPostgresqlProjection={operation:'project-relationships-postgresql',version:'1.0.0',status:'projected',source,physicalBinding,authors,request,binding,layout,mappings:[],residuals:[],diagnostics:[]};
 const loss=(origin:Residual['source'],path:string,value:unknown,reason:string,outcome:Residual['outcome']='not-expressible')=>result.residuals.push({source:origin,path,value:copyJson(value),reason,outcome});
 const seen=new Set<string>();
 if(authors.length!==request.policy.relationshipLayouts.length)throw new UmfError('RELATIONSHIP_POSTGRESQL_AUTHORS','Exactly one verified declaration per requested relationship layout required');
 for(const author of authors){
  if(author.operation!=='declare-core-relationship')throw new UmfError('RELATIONSHIP_POSTGRESQL_AUTHORS','Explicit relationship declaration required');verifyCoreRelationshipOperation(author,author.target);
  const identity={module:author.identity.module,id:author.request.id},key=relId(identity);
  if(seen.has(key)||!request.policy.relationshipLayouts.some(l=>relId(l.relationship)===key)||author.target.id!==source.id)throw new UmfError('RELATIONSHIP_POSTGRESQL_AUTHORS','Duplicate or mismatched author declaration');seen.add(key);
  const current=lookupCoreRelationship(source,identity).relationship,prior=lookupCoreRelationship(author.target,identity).relationship;
  if(!same(current,prior))throw new UmfError('RELATIONSHIP_POSTGRESQL_STALE','Authored relationship changed since declaration');
  const locate=(d:Document,ref:{module:string;element:string})=>d.modules.find(m=>m.id===ref.module)?.elements.find(e=>e.id===ref.element);
  for(const endpoint of [...current.source,...current.target,...(current.associationRecord?[current.associationRecord]:[])]){
   const now=locate(source,endpoint),then=locate(author.target,endpoint);
   if(!now||!then||!same(now,then))throw new UmfError('RELATIONSHIP_POSTGRESQL_STALE','Endpoint Record or Key changed since declaration');
   for(const member of (now.members??[]) as {module:string;element:string}[])if(!same(locate(source,member),locate(author.target,member)))throw new UmfError('RELATIONSHIP_POSTGRESQL_STALE','Endpoint member changed since declaration');
  }
 }
 loss('logical','',source,'Only explicitly inventoried new table columns and Keys plus homogeneous FK/junction carriers are emitted. All native archives, DDD semantics, facets, other fields and unknown content remain retained; no whole-model equivalence');
 const physical=physicalBinding.extensions?.['umf.binding'] as any;
 for(const [i,row] of (physical?.indexes??[]).entries())loss('binding',`/extensions/umf.binding/indexes/${i}`,row,'Physical indexes are outside this relationship binding; no index choice silently becomes enforcement');
 for(const [i,row] of (physical?.fields??[]).entries())if(row.storage!=='column')loss('binding',`/extensions/umf.binding/fields/${i}`,row,'Embedded fields remain retained; the new scalar-keyed-table profile emits no embedded carrier');
 for(const r of layout.residuals)loss(r.source,r.path,r.value,r.reason,'unknown');
 for(const f of request.policy.fieldLayouts){const mi=source.modules.findIndex(m=>m.id===f.coreField.module),ei=source.modules[mi]?.elements.findIndex(e=>e.id===f.coreField.element)??-1,field=source.modules[mi]?.elements[ei];if(field?.facets!==undefined)loss('logical',`/modules/${mi}/elements/${ei}/facets`,field.facets,'Authored Field facets remain retained; this relationship profile does not emit facet checks');}
 let impossible=layout.status==='blocked';
 if(request.policy.targetVersion!=='17.4'){impossible=true;loss('policy','/targetVersion',request.policy.targetVersion,'Only PostgreSQL 17.4 is qualified');}
 for(const l of request.policy.relationshipLayouts){
  const module=source.modules.find(m=>m.id===l.relationship.module);
  if(!((module?.relationships??[]) as {id:string}[]).some(r=>r.id===l.relationship.id)){impossible=true;loss('policy','/relationshipLayouts',l,'Unresolved stable relationship identity');continue;}
  const rel=lookupCoreRelationship(source,l.relationship);
  for(const key of Object.keys(rel.relationship))loss('logical',rel.path+'/'+pointer(key),rel.relationship[key],'Authored obligation remains qualified: native FK existence checks do not preserve stable identity, both-end participation, ownership, inverse navigation or complete association semantics','approximated');
  if(l.storage==='edge'){impossible=true;loss('policy','/relationshipLayouts',l,'Shared edge/discriminator generation needs a separate conditioned-FK enforcement profile');}
 }
 const sql:string[]=[];
 if(!impossible){
  const policy=request.policy,tables=new Map<string,Map<string,string>>(),keyLayouts=new Map(policy.keyLayouts.map(k=>[keyId({...k.record,key:k.key}),k]));
  const column=(name:string,t:PostgresqlLayoutType)=>identifier(name)+' '+t.sqlType+(t.collation==='C'?' COLLATE pg_catalog."C"':'')+(t.nullable?'':' NOT NULL');
  for(const f of policy.fieldLayouts){if(['tableoid','xmin','cmin','xmax','cmax','ctid'].includes(f.column)){impossible=true;loss('policy','/fieldLayouts',f,'PostgreSQL system column name cannot name a user column');}const table=tables.get(f.table)??new Map();table.set(f.column,column(f.column,f));tables.set(f.table,table);}
  for(const l of policy.relationshipLayouts)if(l.storage==='junction'&&!l.associationRecord){const table=new Map<string,string>();for(const c of [...l.sourceComponents!,...l.targetComponents])table.set(c.carrierColumn,column(c.carrierColumn,c));tables.set(l.carrierTable,table);}
  for(const [table,columns] of tables){
   if(!columns.size||columns.size>1600){impossible=true;loss('policy','/fieldLayouts',{table,count:columns.size},'New PostgreSQL table requires 1..1600 explicit columns');}
   if(table.split('.')[0]!.startsWith('pg_')||table.split('.')[0]==='information_schema'){impossible=true;loss('policy','/fieldLayouts',table,'PostgreSQL system namespaces are outside the new user-table profile');}
   for(const name of columns.keys())if(['tableoid','xmin','cmin','xmax','cmax','ctid'].includes(name)){impossible=true;loss('policy','/fieldLayouts',{table,column:name},'PostgreSQL system column name cannot name a user carrier');}
  }
  for(const k of policy.keyLayouts)if(k.components.length>32){impossible=true;loss('policy','/keyLayouts',k,'Pinned PostgreSQL index Keys support at most 32 columns');}
  if(!impossible){
   for(const schema of [...new Set([...tables.keys()].map(t=>t.split('.')[0]!))].sort())sql.push('CREATE SCHEMA IF NOT EXISTS '+identifier(schema)+';');
   for(const [table,columns] of tables)sql.push('CREATE TABLE '+qualified(table)+' (\n  '+[...columns.values()].join(',\n  ')+'\n);');
   for(const k of policy.keyLayouts){const record=source.modules.find(m=>m.id===k.record.module)!.elements.find(e=>e.id===k.record.element)!,key=(record.keys as any[]).find(x=>x.id===k.key);sql.push('ALTER TABLE '+qualified(k.table)+' ADD CONSTRAINT '+identifier(k.constraint)+(key.primary?' PRIMARY KEY':' UNIQUE')+' ('+k.components.map(c=>identifier(c.column)).join(', ')+') NOT DEFERRABLE;');}
   for(const l of policy.relationshipLayouts){
    const constraints:string[]=[];
    const fk=(name:string,ref:{module:string;element:string;key:string},components:NonNullable<typeof l.sourceComponents>)=>{const k=keyLayouts.get(keyId(ref))!;sql.push('ALTER TABLE '+qualified(l.carrierTable)+' ADD CONSTRAINT '+identifier(name)+' FOREIGN KEY ('+components.map(c=>identifier(c.carrierColumn)).join(', ')+') REFERENCES '+qualified(k.table)+' ('+k.components.map(c=>identifier(c.column)).join(', ')+') MATCH SIMPLE ON UPDATE NO ACTION ON DELETE NO ACTION NOT DEFERRABLE;');constraints.push(name);};
    if(l.storage==='junction')fk(l.sourceConstraint!,l.sourceKey!,l.sourceComponents!);fk(l.targetConstraint,l.targetKey,l.targetComponents);
    result.mappings.push({relationship:l.relationship,idealPath:lookupCoreRelationship(source,l.relationship).path,carrierTable:l.carrierTable,constraints,targetKey:l.targetKey.key,outcome:'approximated'});
   }
  }
 }
 if(impossible||request.mode==='strict'){result.status='blocked';result.mappings=[];}
 else{
  const nativeSql=sql.join('\n')+'\n';
  try{const target=await importPostgresqlSql(nativeSql,backend,{id:request.id});await exportPostgresqlSql(target,backend);result.nativeSql=nativeSql;result.target=target;}
  catch(error){result.status='blocked';result.mappings=[];loss('policy','',request.policy,'Generated SQL failed pinned parser/deparser/codec verification: '+String(error));}
 }
 result.diagnostics=[...layout.diagnostics,...result.residuals.map(r=>({code:'RELATIONSHIP_POSTGRESQL_RESIDUAL',path:r.path,message:r.reason,severity:result.status==='blocked'?'error' as const:'warning' as const}))];
 if(!projectionCheck(result))throw new UmfError('RELATIONSHIP_POSTGRESQL_RESULT',JSON.stringify(projectionCheck.errors));return copyJson(result) as unknown as RelationshipPostgresqlProjection;
}
export async function verifyRelationshipPostgresqlProjection(input:RelationshipPostgresqlProjection,current:Document,backend:PostgresqlBackend):Promise<RelationshipPostgresqlProjection>{
 const r=copyJson(input) as unknown as RelationshipPostgresqlProjection;if(!projectionCheck(r)||r.status!=='projected')throw new UmfError('RELATIONSHIP_POSTGRESQL_RECEIPT','Complete successful receipt required');
 if(!same(r,await projectRelationshipsToPostgresql(r.source,r.physicalBinding,r.authors,r.request,backend)))throw new UmfError('RELATIONSHIP_POSTGRESQL_RECEIPT','Inconsistent or forged receipt');
 if(getPostgresqlSource(current)!==r.nativeSql||!same(getPostgresqlNode(current,''),getPostgresqlNode(r.target!,'')))throw new UmfError('RELATIONSHIP_POSTGRESQL_STALE','Native text or tree differs from emitted archive');return r;
}
export async function recoverRelationshipPostgresqlIdeal(input:RelationshipPostgresqlProjection,current:Document,backend:PostgresqlBackend):Promise<Document>{return copyJson((await verifyRelationshipPostgresqlProjection(input,current,backend)).source) as unknown as Document;}
export async function recoverRelationshipPostgresqlNative(input:RelationshipPostgresqlProjection,current:Document,backend:PostgresqlBackend):Promise<string>{return (await verifyRelationshipPostgresqlProjection(input,current,backend)).nativeSql!;}
