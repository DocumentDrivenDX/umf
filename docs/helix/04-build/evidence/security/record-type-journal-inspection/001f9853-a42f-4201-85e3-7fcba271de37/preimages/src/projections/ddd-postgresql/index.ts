import {copyJson} from '../../model/json';
import {UmfError,pointer,type Document,type Json,type Diagnostic} from '../../model/types';
import {renderTree} from '../../model/native-json';
import {validateDocument} from '../../validation/document';
import {inspectBinding,type BindingPayload} from '../../extensions/binding';
import {inspectDdd} from '../../extensions/ddd';
import {importPostgresqlSql,exportPostgresqlSql,getPostgresqlSource,getPostgresqlNode,proposePostgresqlNodeEdit,type PostgresqlBackend} from '../../adapters/postgresql';
import {getPostgresqlDdlDeclarations} from '../../adapters/postgresql/declarations';
import {identifier,literal} from '../../core-ideals/postgresql-syntax';
import {projectDddTablesToPostgresql,type DddPostgresqlTablePolicy} from './tables';
import {projectBindingIndexesToPostgresql} from '../binding-postgresql/indexes';
import {validatePostgresqlRelationshipLayout,type PostgresqlRelationshipLayoutPolicy,type PostgresqlLayoutType} from './relationship-layout';
import {createValidator} from '../../validation/schema';
import core from '../../../spec/core/schema.json';import fields from '../../../spec/core/field-document.schema.json';import availability from '../../../spec/core/nullability-document.schema.json';import containers from '../../../spec/core/cardinality-document.schema.json';import facets from '../../../spec/core/facet-document.schema.json';import keys from '../../../spec/core/key-document.schema.json';import relationships from '../../../spec/core/relationship-document.schema.json';import layoutSchema from '../../../spec/projections/postgresql-relationship-layout.schema.json';
import policySchema from '../../../spec/projections/ddd-postgresql-policy.schema.json';import resultSchema from '../../../spec/projections/ddd-postgresql-projection.schema.json';
export {default as dddPostgresqlPolicySchema} from '../../../spec/projections/ddd-postgresql-policy.schema.json';
export {default as dddPostgresqlProjectionSchema} from '../../../spec/projections/ddd-postgresql-projection.schema.json';
export interface DddPostgresqlPolicy {profile:'ddd-postgresql-1';version:'1.0.0';targetVersion:'17.4';mode:'strict'|'report';objectCheckNaming:'ck-table-column-object-v1';tablePolicy:DddPostgresqlTablePolicy;layoutPolicy:PostgresqlRelationshipLayoutPolicy}
export interface DddPostgresqlProjection {
 operation:'project-ddd-postgresql';version:'1.0.0';status:'projected'|'blocked';source:Document;binding:Document;policy:DddPostgresqlPolicy;nativeVersion:'17.4';
 mappings:{source:'logical'|'binding'|'policy';path:string;statement:number;kind:'schema'|'table'|'column'|'embedded-check'|'partition'|'key'|'relationship'|'index';target:string;outcome:'exact'|'approximated'}[];
 residuals:{source:'logical'|'binding'|'policy';path:string;value:Json;outcome:'unknown'|'not-expressible'|'approximated';reason:string}[];diagnostics:Diagnostic[];nativeSource?:string;targetArchive?:Document;
}
const v=createValidator(false);for(const s of [core,fields,availability,containers,facets,keys,relationships,layoutSchema,policySchema])v.addSchema(s);const policyCheck=v.compile(policySchema),resultCheck=v.compile(resultSchema);
const canonical=(value:Json):string=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value!==null&&typeof value==='object'?'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k]!)).join(',')+'}':JSON.stringify(value);
const equal=(a:unknown,b:unknown)=>canonical(copyJson(a))===canonical(copyJson(b));
const identity=(r:{module:string;element:string})=>JSON.stringify([r.module,r.element]);
const boundIdentity=(r:{module:string;element:string;field?:string})=>JSON.stringify([r.module,r.element,r.field??null]);
const keyIdentity=(r:{module:string;element:string;key:string})=>JSON.stringify([r.module,r.element,r.key]);
const qtable=(name:string)=>name.split('.').map(identifier).join('.');
const systemColumn=(name:string)=>['tableoid','xmin','cmin','xmax','cmax','ctid'].includes(name);
const typedColumn=(name:string,type:PostgresqlLayoutType)=>identifier(name)+' '+type.sqlType+(type.collation==='C'?' COLLATE pg_catalog."C"':'')+(type.nullable?'':' NOT NULL');

/** Whole authored graph projection; portable library never deploys or queries a database. */
export async function projectDddToPostgresql(logicalInput:Document,bindingInput:Document,policyInput:DddPostgresqlPolicy,backend:PostgresqlBackend):Promise<DddPostgresqlProjection>{
 const source=copyJson(logicalInput) as unknown as Document,binding=copyJson(bindingInput) as unknown as Document,policy=copyJson(policyInput) as unknown as DddPostgresqlPolicy;
 if(!policyCheck(policy))throw new UmfError('DDD_POSTGRESQL_POLICY',JSON.stringify(policyCheck.errors));
 if(source.umf!=='0.7.0'||!validateDocument(source).valid)throw new UmfError('DDD_POSTGRESQL_SOURCE','Valid core 0.7.0 authored graph required');
 const r:DddPostgresqlProjection={operation:'project-ddd-postgresql',version:'1.0.0',status:'projected',source,binding,policy,nativeVersion:'17.4',mappings:[],residuals:[],diagnostics:[]};
 const loss=(origin:'logical'|'binding'|'policy',path:string,value:unknown,reason:string,outcome:'unknown'|'not-expressible'|'approximated'='not-expressible')=>r.residuals.push({source:origin,path,value:copyJson(value),reason,outcome});
 const block=(path:string,message:string)=>{r.status='blocked';r.diagnostics.push({code:'DDD_POSTGRESQL_BLOCK',path,message,severity:'error'});};
 const finish=()=>{r.diagnostics.push(...r.residuals.map(x=>({code:'DDD_POSTGRESQL_LOSS',path:x.path,message:x.reason,severity:r.status==='blocked'?'error' as const:'warning' as const})));if(r.status==='blocked'){delete r.nativeSource;delete r.targetArchive;r.mappings=[];}if(!resultCheck(r))throw new UmfError('DDD_POSTGRESQL_RESULT',JSON.stringify(resultCheck.errors));return copyJson(r) as unknown as DddPostgresqlProjection;};
 const checked=inspectBinding(binding,source),ddd=inspectDdd(source);
 if(!checked.valid||checked.diagnostics.some(d=>d.code==='BINDING_UNKNOWN')||!ddd.valid||ddd.diagnostics.some(d=>d.code==='DDD_UNKNOWN')){block('/binding','Invalid or uninterpreted DDD/binding content');return finish();}
 const payload=binding.extensions!['umf.binding'] as unknown as BindingPayload;
 if(payload.profile!=='umf-binding-2'||payload.target.system!=='postgresql'||payload.target.version!=='17.4'||payload.target.subset!=='ddd-tables-jsonb-list-partition'||policy.layoutPolicy.targetVersion!=='17.4'){block('/binding','Expected exact PostgreSQL17.4 stable-ID DDD table binding and layout profile');return finish();}
 const lp=policy.layoutPolicy,tableByRecord=new Map(payload.elements.map(e=>[identity(e),e.table!])),recordByTable=new Map(payload.elements.map(e=>[e.table!,e])),constraintNames=new Set<string>(),relationNames=new Set<string>();
 const locate=(ref:{module:string;element:string})=>{const mi=source.modules.findIndex(m=>m.id===ref.module),ei=source.modules[mi]?.elements.findIndex(e=>e.id===ref.element)??-1;return {element:source.modules[mi]?.elements[ei],path:`/modules/${mi}/elements/${ei}`};};
 const bindPath=(e:{module:string;element:string})=>'/extensions/umf.binding/elements/'+payload.elements.findIndex(x=>identity(x)===identity(e));
 const constraint=(table:string,name:string,path:string)=>{identifier(name);const id=JSON.stringify([table,name]);if(constraintNames.has(id))block(path,'Native constraint name collision: '+name);constraintNames.add(id);};
 for(const e of payload.elements){const definition=locate(e).element;if(definition?.kind!=='record'||(definition.extensions['umf.ddd'] as any)?.kind!=='entity')block(bindPath(e),'Every bound table must be an explicit DDD entity/core Record');if(!e.table||e.table.split('.').length!==2||e.table.split('.')[0]!.startsWith('pg_')||e.table.split('.')[0]==='information_schema')block(bindPath(e),'Explicit user schema.table required');relationNames.add(e.table!);}
 for(const f of lp.fieldLayouts){const t=policy.tablePolicy.fieldTypes.find(t=>boundIdentity(t)===boundIdentity(f.boundField));if(!t||t.sqlType!==f.sqlType)block('/policy/tablePolicy/fieldTypes','Scalar table policy differs from the exact relationship Field inventory');if(systemColumn(f.column))block('/policy/layoutPolicy/fieldLayouts','System column name cannot name an emitted Field');}
 for(const t of policy.tablePolicy.fieldTypes)if(!lp.fieldLayouts.some(f=>boundIdentity(f.boundField)===boundIdentity(t)))block('/policy/tablePolicy/fieldTypes','Stale extra scalar type policy');
 // Explicitly validate partitioned uniqueness before checking the unpartitioned layout view.
 const layoutBinding=copyJson(binding) as unknown as Document,layoutPayload=layoutBinding.extensions!['umf.binding'] as any;
 for(const [i,e] of payload.elements.entries())if(e.partition!=null){
  const family=policy.tablePolicy.partitionFamilies.find(f=>f.name===e.partition),ownKeys=lp.keyLayouts.filter(k=>identity(k.record)===identity(e));
  if(!family||!ownKeys.length||ownKeys.some(k=>!k.components.some(c=>c.column===family.column)))block(bindPath(e)+'/partition','Every exact authored Key must include the LIST partition column; Keys are never widened');
  if(family){const child=e.table!.split('.')[0]+'.'+family.defaultTable;if(relationNames.has(child))block(bindPath(e)+'/partition','Default partition relation collides');relationNames.add(child);}
  layoutPayload.elements[i].partition=null;
 }
 for(const k of lp.keyLayouts){const relation=k.table.split('.')[0]+'.'+k.constraint;if(relationNames.has(relation))block('/policy/layoutPolicy/keyLayouts','Key backing index collides with table/partition relation');}
 for(const index of payload.indexes){const first=index.on[0];const owner=first?tableByRecord.get(identity('field' in first ? first.field : first.documentPath.field)):undefined;if(owner&&relationNames.has(owner.split('.')[0]+'.'+index.name))block('/binding/extensions/umf.binding/indexes','Index collides with table/partition relation');}
 for(const l of lp.relationshipLayouts)if(!l.associationRecord&&l.storage!=='foreign_key'&&relationNames.has(l.carrierTable))block('/policy/layoutPolicy/relationshipLayouts','Anonymous carrier collides with table/partition relation');
 const layout=validatePostgresqlRelationshipLayout(source,layoutBinding,lp,'report');
 if(layout.status==='blocked'){for(const d of layout.diagnostics)if(d.severity==='error')block(d.path,d.message);return finish();}
 for(const l of layout.residuals)loss(l.source,l.source==='policy'?'/layoutPolicy'+l.path:l.path,l.value,l.reason,'unknown');
 for(const k of lp.keyLayouts){constraint(k.table,k.constraint,'/policy/layoutPolicy/keyLayouts');if(k.components.length>32)block('/policy/layoutPolicy/keyLayouts','PostgreSQL Key column limit exceeded');}
 for(const l of lp.relationshipLayouts){if(l.storage==='edge'&&l.associationRecord)block('/policy/layoutPolicy/relationshipLayouts','Edge association Record discriminator mapping is outside this profile');constraint(l.carrierTable,l.targetConstraint,'/policy/layoutPolicy/relationshipLayouts');if(l.sourceConstraint)constraint(l.carrierTable,l.sourceConstraint,'/policy/layoutPolicy/relationshipLayouts');}
 for(const [i,index] of payload.indexes.entries()){
  if(index.predicate&&(/;|--|\/\*|\\/.test(index.predicate.expression)||index.predicate.expression.trim()===''||index.predicate.language!=='postgresql'||!/^17(?:\.[0-9]+)*(?![\s\S])/.test(index.predicate.version)))block(`/binding/extensions/umf.binding/indexes/${i}`,'Unsafe or mismatched predicate syntax blocks both loss modes');
 }
 if(r.diagnostics.some(d=>d.severity==='error'))return finish();
 let tableSource:string,tableArchive:Document;
 try{
  const tables=await projectDddTablesToPostgresql(source,binding,backend,policy.tablePolicy,'report');
  if(!tables.candidate||!tables.targetArchive){block('/binding','No complete DDD table candidate');return finish();}
  tableSource=tables.candidate;tableArchive=tables.targetArchive;
 }catch(error){block('/policy/tablePolicy',String(error));return finish();}
 let declarations=getPostgresqlDdlDeclarations(tableArchive);if(declarations.status==='blocked'){block('/binding','Table declaration inventory unavailable');return finish();}
 const tableDeclarations=new Map<string,(typeof declarations.declarations)[number]>();
 for(const d of declarations.declarations.filter(d=>d.kind==='create-table')){const relation=JSON.parse(renderTree(d.relation));tableDeclarations.set(relation.schemaname+'.'+relation.relname,d);}
 // All bound table/column choices must survive; report mode never emits an incomplete graph.
 for(const [i,e] of payload.elements.entries())if(!tableDeclarations.has(e.table!))block(`/binding/extensions/umf.binding/elements/${i}`,'Bound table missing from complete DDD candidate');
 for(const [i,f] of payload.fields.entries()){
  const table=tableByRecord.get(identity(f)),d=table?tableDeclarations.get(table):undefined,column=f.storage==='column'?f.column:f.documentColumn;
  if(!d?.columns.some(c=>c.element.name===column))block(`/binding/extensions/umf.binding/fields/${i}`,'Bound scalar or embedded column missing from complete DDD candidate');
  if(f.storage==='embedded'){
   loss('binding',`/extensions/umf.binding/fields/${i}`,f,'JSONB object storage normalizes documents; the authored embedded path/value constraints remain unenforced','approximated');
   const name='ck_'+table!.split('.')[1]+'_'+f.documentColumn+'_object';
   // One object CHECK per shared document carrier, not per embedded path.
   const id=JSON.stringify([table,name]);if(!r.mappings.some(m=>m.kind==='embedded-check'&&m.target===table+'.'+name)){constraint(table!,name,`/binding/extensions/umf.binding/fields/${i}`);r.mappings.push({source:'binding',path:`/extensions/umf.binding/fields/${i}`,statement:d?.statementIndex??0,kind:'embedded-check',target:table+'.'+name,outcome:'approximated'});}
  }
 }
 // Key comparators use explicit C collation; non-Key text follows the table stage and is reported.
 let edited=false;
 for(const f of lp.fieldLayouts){const selected=lp.keyLayouts.some(k=>k.table===f.table&&k.components.some(c=>c.column===f.column))||lp.relationshipLayouts.some(l=>l.carrierTable===f.table&&[...(l.sourceComponents??[]),...l.targetComponents].some(c=>c.carrierColumn===f.column));if(f.collation==='C'&&selected){const column=tableDeclarations.get(f.table)?.columns.find(c=>c.element.name===f.column);if(!column){block('/policy/layoutPolicy/fieldLayouts','Key column missing');continue;}const node=JSON.parse(renderTree(column.nativeColumn));node.collClause={collname:[{String:{sval:'pg_catalog'}},{String:{sval:'C'}}],location:-1};tableArchive=proposePostgresqlNodeEdit(tableArchive,column.path,JSON.stringify(node)).document;edited=true;}else if(f.collation==='C')loss('policy','/layoutPolicy/fieldLayouts/'+lp.fieldLayouts.indexOf(f),f,'Non-Key text keeps the table-stage default collation; no ideal/default comparator equivalence is claimed','unknown');}
 if(edited){try{tableSource=await exportPostgresqlSql(tableArchive,backend);tableArchive=await importPostgresqlSql(tableSource,backend,{id:'ddd-postgresql-tables-final'});}catch(error){block('/policy/layoutPolicy/fieldLayouts','Explicit Key collation failed parser/codec: '+String(error));}}
 if(r.diagnostics.some(d=>d.severity==='error'))return finish();
 const statements:string[]=[];const initialTree=await backend.parse(tableSource) as any;let statementCount=initialTree.stmts.length;
 const mapping=(origin:'logical'|'binding'|'policy',path:string,kind:DddPostgresqlProjection['mappings'][number]['kind'],target:string,statement:number,outcome:'exact'|'approximated'='approximated')=>r.mappings.push({source:origin,path,kind,target,statement,outcome});
 // Every initial statement has explicit provenance, including schema and partition declarations.
 for(const [i,row] of initialTree.stmts.entries()){
  const s=row.stmt;if(s.CreateSchemaStmt){mapping('binding','/extensions/umf.binding/elements','schema',s.CreateSchemaStmt.schemaname,i);continue;}
  const table=s.CreateStmt?.relation&&s.CreateStmt.relation.schemaname+'.'+s.CreateStmt.relation.relname;if(!table)continue;
  const e=recordByTable.get(table);if(e){mapping('binding',bindPath(e),'table',table,i);for(const [fi,f] of payload.fields.entries())if(identity(f)===identity(e))mapping('binding',`/extensions/umf.binding/fields/${fi}`,'column',table+'.'+(f.column??f.documentColumn),i);}
  else{const family=policy.tablePolicy.partitionFamilies.find(f=>payload.elements.some(e=>e.partition===f.name&&e.table!.split('.')[0]+'.'+f.defaultTable===table));mapping('policy','/tablePolicy/partitionFamilies/'+policy.tablePolicy.partitionFamilies.indexOf(family!),'partition',table,i);}
 }
 const edgeGroups=new Map<string,typeof lp.relationshipLayouts>();
 for(const l of lp.relationshipLayouts)if(l.storage==='edge'){const group=edgeGroups.get(l.carrierTable)??[];group.push(l);edgeGroups.set(l.carrierTable,group);}
 const nativeSchemas=new Set(payload.elements.map(e=>e.table!.split('.')[0]!));
 const extraTable=(table:string,columns:string[],path:string)=>{const schema=table.split('.')[0]!;if(!nativeSchemas.has(schema)){statements.push('CREATE SCHEMA IF NOT EXISTS '+identifier(schema)+';');mapping('policy',path,'schema',schema,statementCount++);nativeSchemas.add(schema);}if(columns.length>1600||columns.length===0){block(path,'Invalid native table column count');return;}statements.push('CREATE TABLE '+qtable(table)+' (\n  '+columns.join(',\n  ')+'\n);');mapping('policy',path,'table',table,statementCount++);};
 for(const [i,l] of lp.relationshipLayouts.entries())if(l.storage==='junction'&&!l.associationRecord){const components=[...l.sourceComponents!,...l.targetComponents];if(components.some(c=>systemColumn(c.carrierColumn)))block('/policy/layoutPolicy/relationshipLayouts/'+i,'System column in anonymous junction');extraTable(l.carrierTable,components.map(c=>typedColumn(c.carrierColumn,c)),'/layoutPolicy/relationshipLayouts/'+i);}
 for(const [table,group] of edgeGroups){const first=group[0]!,d=first.discriminator!,components=[...first.sourceComponents!,...first.targetComponents];if(components.some(c=>systemColumn(c.carrierColumn))||systemColumn(d.column))block('/policy/layoutPolicy/relationshipLayouts','System column in edge carrier');const checkName='ck_'+table.split('.')[1]+'_'+d.column+'_values';constraint(table,checkName,'/policy/layoutPolicy/relationshipLayouts');const cols=[typedColumn(d.column,d),...components.map(c=>typedColumn(c.carrierColumn,c)),`CONSTRAINT ${identifier(checkName)} CHECK (${identifier(d.column)} IN (${group.map(l=>literal(l.discriminator!.value)).join(', ')}))`];extraTable(table,cols,'/layoutPolicy/relationshipLayouts/'+lp.relationshipLayouts.indexOf(first));}
 for(const [i,k] of lp.keyLayouts.entries()){const record=locate(k.record),key=(record.element!.keys as any[]).find(x=>x.id===k.key);statements.push(`ALTER TABLE ${qtable(k.table)} ADD CONSTRAINT ${identifier(k.constraint)} ${key.primary?'PRIMARY KEY':'UNIQUE'} (${k.components.map(c=>identifier(c.column)).join(', ')});`);mapping('logical',record.path+'/keys/'+(record.element!.keys as any[]).indexOf(key),'key',k.table+'.'+k.constraint,statementCount++);}
 const keyMap=new Map(lp.keyLayouts.map(k=>[keyIdentity({...k.record,key:k.key}),k]));
 for(const [i,l] of lp.relationshipLayouts.entries()){
  const mi=source.modules.findIndex(m=>m.id===l.relationship.module),ri=(source.modules[mi]!.relationships as {id:string}[]).findIndex(x=>x.id===l.relationship.id),path=`/modules/${mi}/relationships/${ri}`;
  const fk=(constraint:string,key:{module:string;element:string;key:string},components:NonNullable<typeof l.sourceComponents>)=>{const k=keyMap.get(keyIdentity(key))!;statements.push(`ALTER TABLE ${qtable(l.carrierTable)} ADD CONSTRAINT ${identifier(constraint)} FOREIGN KEY (${components.map(c=>identifier(c.carrierColumn)).join(', ')}) REFERENCES ${qtable(k.table)} (${k.components.map(c=>identifier(c.column)).join(', ')});`);mapping('logical',path,'relationship',l.carrierTable+'.'+constraint,statementCount++);};
  if(l.storage!=='foreign_key')fk(l.sourceConstraint!,l.sourceKey!,l.sourceComponents!);fk(l.targetConstraint,l.targetKey,l.targetComponents);
  const rel=(source.modules[mi]!.relationships as any[])[ri];for(const key of Object.keys(rel))loss('logical',path+'/'+pointer(key),rel[key],'FK/edge syntax does not establish stable ideal identity, both-end participation, lifecycle, inverse navigation or complete association semantics','approximated');
  if(l.storage==='edge')loss('policy','/layoutPolicy/relationshipLayouts/'+i,l,'Discriminator classifies identical endpoint-Key carriers only; heterogeneous endpoint type cannot be enforced by a discriminator alone','not-expressible');
 }
 for(const [i,choice] of payload.relationships.entries())if(choice.storage==='inline')loss('binding','/extensions/umf.binding/relationships/'+i,choice,'PostgreSQL17 inline relationship storage has no supported carrier');
 // Preserve complete logical meaning, including DDD aggregates/invariants and Field facets.
 source.modules.forEach((m,mi)=>m.elements.forEach((e,ei)=>{const path=`/modules/${mi}/elements/${ei}`;if(e.extensions['umf.ddd'])loss('logical',path+'/extensions/umf.ddd',e.extensions['umf.ddd'],'DDD identity/equality, aggregate/repository/lifecycle and opaque invariants are not established by SQL structure');if(e.kind==='field')loss('logical',path,e,'Native column widths, input coercion, NULL/domain differences, facets and unknown qualifiers remain qualified rather than exact ideal equivalence','unknown');}));
 loss('logical','',source,'Complete original logical/native context retained; target-only reimport cannot recover authored DDD/binding intent','unknown');
 if(r.diagnostics.some(d=>d.severity==='error'))return finish();
 let nativeSource=tableSource.trimEnd().replace(/;?$/,';')+'\n'+statements.join('\n')+'\n';
 try{
  const archive=await importPostgresqlSql(nativeSource,backend,{id:'ddd-postgresql-before-indexes'}),indexes=await projectBindingIndexesToPostgresql(source,binding,archive,backend,'report');
  for(const residual of indexes.residuals){loss('binding',residual.path,residual.choice,residual.reason);if(/fails pinned|absent from native|single-expression/.test(residual.reason))block(residual.path,'Unsafe/incomplete requested index: '+residual.reason);}
  if(indexes.candidate){const tree=await backend.parse(indexes.candidate) as any;for(const row of tree.stmts){const name=row.stmt.IndexStmt.idxname,index=payload.indexes.findIndex(x=>x.name===name);mapping('binding','/extensions/umf.binding/indexes/'+index,'index',name,statementCount++);}nativeSource+=indexes.candidate;}
  if(r.diagnostics.some(d=>d.severity==='error'))return finish();
  const targetArchive=await importPostgresqlSql(nativeSource,backend,{id:'ddd-postgresql-target'});await exportPostgresqlSql(targetArchive,backend);
  if(policy.mode==='strict'&&r.residuals.length){r.status='blocked';return finish();}
  r.nativeSource=nativeSource;r.targetArchive=targetArchive;
 }catch(error){block('/policy','Complete DDL failed parser/deparser/codec: '+String(error));}
 return finish();
}
export async function verifyDddPostgresqlProjection(input:DddPostgresqlProjection,current:Document,backend:PostgresqlBackend):Promise<DddPostgresqlProjection>{const r=copyJson(input) as unknown as DddPostgresqlProjection;if(!resultCheck(r)||r.status!=='projected')throw new UmfError('DDD_POSTGRESQL_RECEIPT','Complete successful receipt required');if(!equal(r,await projectDddToPostgresql(r.source,r.binding,r.policy,backend)))throw new UmfError('DDD_POSTGRESQL_RECEIPT','Receipt differs from retained inputs');if(getPostgresqlSource(current)!==r.nativeSource||!equal(getPostgresqlNode(current,''),getPostgresqlNode(r.targetArchive!,'')))throw new UmfError('DDD_POSTGRESQL_STALE','Native source or tree changed');return r;}
export async function recoverDddPostgresqlIdeal(input:DddPostgresqlProjection,current:Document,backend:PostgresqlBackend):Promise<{logical:Document;binding:Document;policy:DddPostgresqlPolicy}>{const r=await verifyDddPostgresqlProjection(input,current,backend);return copyJson({logical:r.source,binding:r.binding,policy:r.policy}) as unknown as {logical:Document;binding:Document;policy:DddPostgresqlPolicy};}
export async function recoverDddPostgresqlNative(input:DddPostgresqlProjection,current:Document,backend:PostgresqlBackend):Promise<string>{return (await verifyDddPostgresqlProjection(input,current,backend)).nativeSource!;}
