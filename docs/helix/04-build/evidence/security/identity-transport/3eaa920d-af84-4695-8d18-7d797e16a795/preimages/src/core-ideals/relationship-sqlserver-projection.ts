import {copyJson} from '../model/json';
import {UmfError,type Document,type Json,type Diagnostic} from '../model/types';
import {lookupCoreRelationship,verifyCoreRelationshipOperation,type CoreRelationshipDeclaration,type CoreRelationshipIdentity} from '../model/relationships';
import type {RelationshipEndpoint} from '../validation/relationships';
import type {CoreKeyDefinition} from '../validation/keys';
import {validateDocument} from '../validation/document';
import {getBinding} from '../extensions/binding';
import {sqlServerIdentifier as quote} from './sqlserver-syntax';
import {createValidator} from '../validation/schema';
import legacy from '../../spec/core/schema.json';import fields from '../../spec/core/field-document.schema.json';import nullability from '../../spec/core/nullability-document.schema.json';import cardinality from '../../spec/core/cardinality-document.schema.json';import facets from '../../spec/core/facet-document.schema.json';import keys from '../../spec/core/key-document.schema.json';import relationships from '../../spec/core/relationship-document.schema.json';import authorSchema from '../../spec/core/relationship-operation.schema.json';
import schema from '../../spec/core/relationship-sqlserver-projection.schema.json';
export {default as relationshipSqlServerProjectionSchema} from '../../spec/core/relationship-sqlserver-projection.schema.json';
export interface SqlServerRelationshipKey {keyId:string;constraintName:string;columns:{field:RelationshipEndpoint;name:string;nativeType:'bit'|'tinyint'|'smallint'|'int'|'bigint'}[]}
export interface RelationshipSqlServerRequest {id:string;relationship:CoreRelationshipIdentity;profile:'new-key-tables';mode:'strict'|'report';namespace:string;sourceKey:SqlServerRelationshipKey;targetKey:SqlServerRelationshipKey;referenceColumns:string[];constraintName:string;deleteAction:'NO_ACTION'|'CASCADE'|'SET_NULL';updateAction:'NO_ACTION'|'CASCADE'|'SET_NULL';junction?:{tableName:string;sourceColumns:string[];sourceConstraintName:string;pairConstraintName:string}}
const binding=schema.properties.binding.const;
export interface RelationshipSqlServerProjection {operation:'project-relationship-sqlserver';version:'1.0.0';status:'projected'|'blocked';source:Document;author:CoreRelationshipDeclaration;bindingSource:Document;request:RelationshipSqlServerRequest;binding:typeof binding;target?:{format:'sqlserver-ddl';sql:string};mappings:{idealPath:string;nativePath:string;storage:'foreign_key'|'junction';targetKey:string;sourceKey:string;enforcement:'enabled-trusted-stored-values';outcome:'approximated'}[];residuals:{path:string;value:Json;reason:string;outcome:'unknown'|'not-expressible'|'approximated';recovery:string}[];diagnostics:Diagnostic[]}
const validator=createValidator(false);for(const s of [legacy,fields,nullability,cardinality,facets,keys,relationships,authorSchema])validator.addSchema(s);const check=validator.compile(schema),requestCheck=validator.compile(schema.properties.request);
const canonical=(v:Json):string=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v!==null&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k]!)).join(',')+'}':JSON.stringify(v);
const same=(a:unknown,b:unknown)=>canonical(copyJson(a))===canonical(copyJson(b));const identity=(r:{module:string;element:string})=>JSON.stringify([r.module,r.element]);
function locate(d:Document,ref:RelationshipEndpoint){const mi=d.modules.findIndex(x=>x.id===ref.module),ei=d.modules[mi]?.elements.findIndex(x=>x.id===ref.element)??-1;if(mi<0||ei<0)throw new UmfError('RELATIONSHIP_SQLSERVER_REFERENCE','Unresolved logical element');return {element:d.modules[mi]!.elements[ei]!,path:`/modules/${mi}/elements/${ei}`};}
/** New endpoint-key tables plus declared FK/junction; never mutates existing tables. */
export function projectRelationshipToSqlServer(input:Document,authorInput:CoreRelationshipDeclaration,bindingInput:Document,options:RelationshipSqlServerRequest):RelationshipSqlServerProjection {
 const source=copyJson(input) as unknown as Document,author=copyJson(authorInput) as unknown as CoreRelationshipDeclaration,bindingSource=copyJson(bindingInput) as unknown as Document,request=copyJson(options) as unknown as RelationshipSqlServerRequest;
 if(!requestCheck(request))throw new UmfError('RELATIONSHIP_SQLSERVER_REQUEST',JSON.stringify(requestCheck.errors));
 if(source.umf!=='0.7.0'||!validateDocument(source).valid)throw new UmfError('RELATIONSHIP_SQLSERVER_SOURCE','Valid core 0.7.0 required');
 if(author.operation!=='declare-core-relationship')throw new UmfError('RELATIONSHIP_SQLSERVER_AUTHOR','Explicit relationship declaration required');verifyCoreRelationshipOperation(author,author.target);
 if(author.target.id!==source.id||author.identity.module!==request.relationship.module||author.request.id!==request.relationship.id)throw new UmfError('RELATIONSHIP_SQLSERVER_AUTHOR','Mismatched author identity');
 const current=lookupCoreRelationship(source,request.relationship),prior=lookupCoreRelationship(author.target,request.relationship),rel=current.relationship;
 if(!same(rel,prior.relationship))throw new UmfError('RELATIONSHIP_SQLSERVER_STALE','Relationship changed since authoring');
 for(const endpoint of [...rel.source,...rel.target,...(rel.associationRecord?[rel.associationRecord]:[])]){const now=locate(source,endpoint).element,old=locate(author.target,endpoint).element;if(!same(now,old))throw new UmfError('RELATIONSHIP_SQLSERVER_STALE','Endpoint changed since authoring');for(const member of (now.members??[]) as RelationshipEndpoint[])if(!same(locate(source,member).element,locate(author.target,member).element))throw new UmfError('RELATIONSHIP_SQLSERVER_STALE','Endpoint component changed');}
 const physical=getBinding(bindingSource,source);
 if(bindingSource.vocabularies['umf.binding']?.version!=='0.2.0'||physical.profile!=='umf-binding-2'||physical.target.system!=='sqlserver'||physical.target.version!==binding.nativeVersion)throw new UmfError('RELATIONSHIP_SQLSERVER_BINDING','Explicit stable SQL Server 16.0.4295.3 binding required');
 const layout=physical.relationships.find(r=>'id'in r&&r.module===request.relationship.module&&r.id===request.relationship.id);
 if(!layout)throw new UmfError('RELATIONSHIP_SQLSERVER_BINDING','Missing exact stable relationship storage choice');
 const r:RelationshipSqlServerProjection={operation:'project-relationship-sqlserver',version:'1.0.0',status:'projected',source,author,bindingSource,request,binding,mappings:[],residuals:[],diagnostics:[]};let impossible=false;
 const loss=(path:string,value:unknown,reason:string,outcome:'unknown'|'not-expressible'|'approximated'='not-expressible')=>r.residuals.push({path,value:copyJson(value),reason,outcome,recovery:'Verified retained receipt recovers logical and physical authoring and emitted SQL; native import does not infer intent'});
 const block=(path:string,value:unknown,reason:string)=>{impossible=true;loss(path,value,reason);};
 for(const [i,index] of physical.indexes.entries())loss('/bindingSource/extensions/umf.binding/indexes/'+i,index,'Index declaration is outside this relationship-only generator');
 loss('/source',source,'Only selected endpoint-key tables and relationship storage are emitted; other Fields, Keys, relationships and unknown native content remain retained');loss('/bindingSource',bindingSource,'Only selected table/Key-column names and relationship storage are interpreted; all other indexes, layout choices and unknown qualifiers remain retained');
 for(const key of ['id','name','source','target','sourceMultiplicity','targetMultiplicity','targetLifecycle','directed','inverse','associationRecord'])if(Object.hasOwn(rel,key))loss(current.path+'/'+key,rel[key],'Stored-value constraints only approximate authored record participation; native naming, lifecycle, minimum participation and presentation never establish complete authored meaning');
 for(const path of current.uninterpretedPaths){let value:unknown=source;for(const part of path.slice(1).split('/').map(p=>p.replace(/~1/g,'/').replace(/~0/g,'~')))value=(value as Record<string,unknown>)[part];loss(path,value,'Unknown logical qualifier remains uninterpreted','unknown');}
 if(rel.source.length!==1||rel.target.length!==1)block(current.path,rel,'Heterogeneous endpoint sets need an explicit discriminator profile');
 if(rel.associationRecord)block(current.path+'/associationRecord',rel.associationRecord,'Separately keyed association attributes and identity require an explicit association layout; bare junction is refused');
 if(!['foreign_key','junction'].includes(layout.storage))block('/bindingSource/relationships',layout,'Only FK and junction storage are qualified');
 if(layout.storage==='foreign_key'&&rel.targetMultiplicity.max!==1)block(current.path+'/targetMultiplicity',rel.targetMultiplicity,'One FK tuple cannot carry multiple distinct targets');
 if(layout.storage==='junction'&&!request.junction||layout.storage!=='junction'&&request.junction)block('/request/junction',request,'Junction policy must match declared storage');
 const sourceEndpoint=rel.source[0]!,targetEndpoint=rel.target[0]!,self=identity(sourceEndpoint)===identity(targetEndpoint);
 const nativeTable=(endpoint:RelationshipEndpoint)=>{const row=physical.elements.find(x=>identity(x)===identity(endpoint));if(!row?.table)throw new UmfError('RELATIONSHIP_SQLSERVER_BINDING','Every endpoint needs an explicit table name');return row.table;};
 const sourceTable=nativeTable(sourceEndpoint),targetTable=nativeTable(targetEndpoint),qualified=(name:string)=>quote(request.namespace)+'.'+quote(name);
 const fold=(s:string)=>s.normalize('NFKC').toUpperCase();
 for(const name of [request.namespace,sourceTable,targetTable,request.constraintName,request.sourceKey.constraintName,request.targetKey.constraintName])quote(name);
 if(!self&&fold(sourceTable)===fold(targetTable))block('/bindingSource/elements',physical.elements,'Different endpoint Records cannot share this new-table profile');
 if(self&&!same(request.sourceKey,request.targetKey))block('/request',request,'Self-reference requires the same explicitly mapped source/target Key');
 const validateKey=(endpoint:RelationshipEndpoint,k:SqlServerRelationshipKey,expected?:string)=>{
  const record=locate(source,endpoint),key=(record.element.keys as CoreKeyDefinition[]).find(x=>x.id===k.keyId);
  if(!key||expected!==undefined&&k.keyId!==expected||!same(key.fields,k.columns.map(x=>x.field))){block('/request',k,'Ordered Key components must match the selected stable Key ID');return;}
  const names=new Set<string>();for(const c of k.columns){quote(c.name);if(names.has(fold(c.name)))block('/request',k,'Duplicate physical component names');names.add(fold(c.name));
   const field=locate(source,c.field),e=field.element,b=physical.fields.find(f=>identity(f)===identity(c.field));
   if(!b||b.storage!=='column'||b.column!==c.name||b.field!==undefined)block('/bindingSource/fields',c,'Key component needs the same explicit direct-column binding');
   if(e.kind!=='field'||e.cardinality!=='one'||e.nullability!=='required'||e.scalarType!==(c.nativeType==='bit'?'boolean':'integer')||e.itemType!==undefined||e.references?.some(x=>x.role==='record-type'))block(field.path,e,'This profile qualifies required scalar integral/boolean Key Fields only');
   loss(field.path,e,'Native type has finite range and input coercions; facets and unknown domain refinements remain retained','unknown');
  }
 };
 validateKey(sourceEndpoint,request.sourceKey);validateKey(targetEndpoint,request.targetKey,targetEndpoint.key);
 const namesUnique=(names:string[])=>{const seen=new Set<string>();for(const n of names){quote(n);if(seen.has(fold(n)))block('/request',request,'Physical names collide');seen.add(fold(n));}};
 const refs=request.referenceColumns;namesUnique(refs);if(refs.length!==request.targetKey.columns.length)block('/request/referenceColumns',refs,'One reference column per target Key component required');
 const constraints=[request.sourceKey.constraintName,...(self?[]:[request.targetKey.constraintName]),request.constraintName];
 if(request.junction)constraints.push(request.junction.sourceConstraintName,request.junction.pairConstraintName);
 namesUnique(constraints);
 for(const name of constraints)if([sourceTable,targetTable,...(request.junction?[request.junction.tableName]:[])].some(t=>fold(t)===fold(name)))block('/request',request,'Constraint and table names share the schema object namespace');
 if(layout.storage==='foreign_key'&&rel.sourceMultiplicity.max===1){quote(request.constraintName+'_reverse');if(fold(request.constraintName+'_reverse')===fold(request.sourceKey.constraintName))block('/request',request,'Generated reverse index collides with the source Key index');}
 const tuple=(names:string[])=>names.map(quote).join(', '),keyNames=(k:SqlServerRelationshipKey)=>k.columns.map(c=>c.name),columns=(k:SqlServerRelationshipKey,names=keyNames(k),nullable=false)=>k.columns.map((c,i)=>quote(names[i]??("__unmapped_"+i))+` ${c.nativeType} ${nullable?'NULL':'NOT NULL'}`);
 const create=(name:string,defs:string[])=>`CREATE TABLE ${qualified(name)} (\n  ${defs.join(',\n  ')}\n);`;
 const keyConstraint=(k:SqlServerRelationshipKey,endpoint:RelationshipEndpoint)=>{const key=(locate(source,endpoint).element.keys as CoreKeyDefinition[]).find(x=>x.id===k.keyId);return `CONSTRAINT ${quote(k.constraintName)} ${key?.primary?'PRIMARY KEY':'UNIQUE'} (${tuple(keyNames(k))})`;};
 const ddl:string[]=[];const nullable=rel.targetMultiplicity.min===0;
 const action=(value:string)=>value.replaceAll('_',' ');
 if((request.deleteAction==='SET_NULL'||request.updateAction==='SET_NULL')&&(layout.storage!=='foreign_key'||!nullable))block('/request',request,'SET NULL requires an optional FK tuple');
 if(self&&(request.deleteAction!=='NO_ACTION'||request.updateAction!=='NO_ACTION'))block('/request',request,'Self cascades are outside this qualified profile');
 const fk=(name:string,from:string[],to:string,key:SqlServerRelationshipKey,actions=false)=>`CONSTRAINT ${quote(name)} FOREIGN KEY (${tuple(from)}) REFERENCES ${qualified(to)} (${tuple(keyNames(key))})${actions?` ON DELETE ${action(request.deleteAction)} ON UPDATE ${action(request.updateAction)}`:''}`;
 if(!self)ddl.push(create(targetTable,[...columns(request.targetKey),keyConstraint(request.targetKey,targetEndpoint)]));
 const sourceDefs=[...columns(request.sourceKey),keyConstraint(request.sourceKey,sourceEndpoint)];
 if(layout.storage==='foreign_key'){
  namesUnique([...keyNames(request.sourceKey),...refs]);sourceDefs.push(...columns(request.targetKey,refs,nullable),fk(request.constraintName,refs,targetTable,request.targetKey,true));
  if(nullable&&refs.length>1)sourceDefs.push(`CHECK ((${refs.map(x=>quote(x)+' IS NULL').join(' AND ')}) OR (${refs.map(x=>quote(x)+' IS NOT NULL').join(' AND ')}))`);
  ddl.push(create(sourceTable,sourceDefs));
  if(rel.sourceMultiplicity.max===1)ddl.push(`CREATE UNIQUE INDEX ${quote(request.constraintName+'_reverse')} ON ${qualified(sourceTable)} (${tuple(refs)})${nullable?' WHERE '+quote(refs[0]!)+' IS NOT NULL':''};`);
 }else if(layout.storage==='junction'&&request.junction){
  const j=request.junction;quote(j.tableName);if([sourceTable,targetTable].some(n=>fold(n)===fold(j.tableName)))block('/request/junction',j,'Junction table must be separate from endpoints');
  if(j.sourceColumns.length!==request.sourceKey.columns.length)block('/request/junction',j,'One source join column per source Key component required');namesUnique([...j.sourceColumns,...refs]);
  if(request.deleteAction!=='NO_ACTION'||request.updateAction!=='NO_ACTION')block('/request',request,'Junction cascades require a separately qualified multiple-path policy');
  ddl.push(create(sourceTable,sourceDefs));
  const defs=[...columns(request.sourceKey,j.sourceColumns),...columns(request.targetKey,refs),`CONSTRAINT ${quote(j.pairConstraintName)} PRIMARY KEY (${tuple([...j.sourceColumns,...refs])})`,fk(j.sourceConstraintName,j.sourceColumns,sourceTable,request.sourceKey),fk(request.constraintName,refs,targetTable,request.targetKey)];
  if(rel.targetMultiplicity.max===1)defs.push(`UNIQUE (${tuple(j.sourceColumns)})`);if(rel.sourceMultiplicity.max===1)defs.push(`UNIQUE (${tuple(refs)})`);
  ddl.push(create(j.tableName,defs));
 }
 if(impossible||request.mode==='strict')r.status='blocked';else{r.target={format:'sqlserver-ddl',sql:ddl.join('\n')+'\n'};r.mappings.push({idealPath:current.path,nativePath:'/constraints/'+request.constraintName,storage:layout.storage as 'foreign_key'|'junction',targetKey:request.targetKey.keyId,sourceKey:request.sourceKey.keyId,enforcement:'enabled-trusted-stored-values',outcome:'approximated'});}
 r.diagnostics=r.residuals.map(x=>({code:'RELATIONSHIP_SQLSERVER_RESIDUAL',path:x.path,message:x.reason,severity:r.status==='blocked'?'error':'warning'}));if(!check(r))throw new UmfError('RELATIONSHIP_SQLSERVER_RESULT',JSON.stringify(check.errors));return copyJson(r) as unknown as RelationshipSqlServerProjection;
}
export function verifyRelationshipSqlServerProjection(input:RelationshipSqlServerProjection,current:{format:'sqlserver-ddl';sql:string}):RelationshipSqlServerProjection {const r=copyJson(input) as unknown as RelationshipSqlServerProjection;if(!check(r)||r.status!=='projected'||!same(r,projectRelationshipToSqlServer(r.source,r.author,r.bindingSource,r.request)))throw new UmfError('RELATIONSHIP_SQLSERVER_RECEIPT','Inconsistent retained projection');if(!same(current,r.target))throw new UmfError('RELATIONSHIP_SQLSERVER_STALE','SQL target changed');return r;}
export function recoverRelationshipSqlServerIdeal(input:RelationshipSqlServerProjection,current:{format:'sqlserver-ddl';sql:string}){return copyJson(verifyRelationshipSqlServerProjection(input,current).source) as unknown as Document;}
export function recoverRelationshipSqlServerBinding(input:RelationshipSqlServerProjection,current:{format:'sqlserver-ddl';sql:string}){return copyJson(verifyRelationshipSqlServerProjection(input,current).bindingSource) as unknown as Document;}
export function recoverRelationshipSqlServerNative(input:RelationshipSqlServerProjection,current:{format:'sqlserver-ddl';sql:string}){return verifyRelationshipSqlServerProjection(input,current).target!.sql;}
