/** Source-verified catalog projection leaf for table inventory compilation. */
import {compileTableDeploymentWithOperations,verifyTableDeployment,type TableDeploymentBundle} from '../table-deployment';
import type {InternalTableDeploymentOperationRecord} from '../table-deployment/types';
import {deriveTableGrantEffectRow} from '../table-deployment/grants';
import {canonical,hashCanonical} from '../compilation/bundle/hash';
import {operationReferences,type FieldBinding} from './inventory-operation-references';
import type {TableDeclaration,TableOperation,TableRowRule,TableRef} from '../extensions/tables/types';

type Json=null|boolean|number|string|Json[]|{[key:string]:Json};
export type Side='previous'|'next';
export type Identity={kind:string;table:string|null;subject:Json};
type PathValue={path:string;value:Json};
export type Subject={identity:Identity;meaning:Json;state:'present'|'absent';validation?:'not-applicable'|'not-validated'|'validated';validity?:'not-applicable'|'pending'|'valid'|'invalid'};
type Edge={from:string;to:string;reason:string;sourcePath:string;state:'present'|'absent'};
export interface PrefixCatalog {
 tables:Subject[];columns:Subject[];keys:Subject[];checks:Subject[];foreignKeys:Subject[];indexes:Subject[];policies:Subject[];grants:Subject[];comments:Subject[];
}
export interface InventoryTable {table:string;record:TableRef;schema:string;name:string;meaningDigest:string}
export interface InventoryChange {kind:'create-table'|'remove-table';table:string;record:TableRef;beforePath:string|null;afterPath:string|null;beforeMeaningDigest:string;afterMeaningDigest:string}
export interface InventoryFieldChange {kind:'retire-field'|'restore-field';table:string;field:TableRef;beforePath:string|null;afterPath:string|null;beforeMeaningDigest:string;afterMeaningDigest:string;selection:Json}
export interface InventoryProjection {profile:'umf.table-inventory-review/0.1';side:Side;source:{format:'json';sha256:string};configuration:Json;table:string;record:TableRef;meaning:Json|null;intent:Json;effects:string[]}
export interface CatalogProjection {catalog:PrefixCatalog;dependencies:Edge[];operations:Subject[];rendererOperations:InternalTableDeploymentOperationRecord[];seedStates:{id:string;definitionDigest:string;sourcePath:string;state:'not-run'|'confirmed'|'retired'}[];sourcePaths:Map<string,string>}
export interface InventoryDelta {profile:'umf.table-inventory-delta/0.1';previousTables:InventoryTable[];nextTables:InventoryTable[];changes:InventoryChange[];fieldChanges:InventoryFieldChange[];seedLineage:{id:string;definitionDigest:string;originalSourceDigest:string;disposition:'retain-definition'|'apply-once'|'retire-definition';execution:'not-run'|'confirmed'}[]}
const clone=<T>(x:T):T=>structuredClone(x);
function toJson(value:unknown,path='/'):Json {
 if(value===null||typeof value==='boolean'||typeof value==='string')return value;
 if(typeof value==='number'&&Number.isFinite(value))return value;
 if(Array.isArray(value))return value.map((child,index)=>toJson(child,`${path}/${index}`));
 if(value&&typeof value==='object'&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null)){
  const result:{[key:string]:Json}={};for(const [key,child]of Object.entries(value))Object.defineProperty(result,key,{value:toJson(child,`${path}/${ptr(key)}`),enumerable:true,writable:true,configurable:true});return result;
 }
 throw new Error('G10_NON_JSON_VALUE:'+path);
}
const refKey=(r:TableRef)=>JSON.stringify([r.module,r.element]);
const sameRef=(a:TableRef,b:TableRef)=>a.module===b.module&&a.element===b.element;
const ptr=(s:string)=>s.replace(/~/g,'~0').replace(/\//g,'~1');
const identity=(kind:string,table:string|null,subject:unknown):Identity=>({kind,table,subject:clone(subject) as Json});
const ik=(x:Identity)=>hashCanonical(x);
const pathFor=(moduleIndex:number,...parts:(string|number)[])=>'/modules/'+moduleIndex+parts.map(x=>'/'+ptr(String(x))).join('');
const requireObject=(x:unknown,path:string):Record<string,any>=>{if(!x||typeof x!=='object'||Array.isArray(x)||(Object.getPrototypeOf(x)!==Object.prototype&&Object.getPrototypeOf(x)!==null))throw new Error('G10_SOURCE_INVALID:'+path);return x as Record<string,any>};
const findElement=(source:any,ref:TableRef,path:string)=>{
 const mi=source.modules.findIndex((m:any)=>m.id===ref.module);if(mi<0)throw new Error('G10_REF_MISSING:'+path);
 const ei=source.modules[mi].elements.findIndex((e:any)=>e.id===ref.element);if(ei<0)throw new Error('G10_REF_MISSING:'+path);
 return {value:source.modules[mi].elements[ei],path:`/modules/${mi}/elements/${ei}`};
};
function sourcePathIndex(source:Json):Map<string,Json>{
 const found=new Map<string,Json>();const walk=(value:Json,path:string):void=>{found.set(path,value);if(Array.isArray(value)){value.forEach((child,index)=>walk(child,`${path}/${index}`));return;}if(value&&typeof value==='object'){for(const [key,child]of Object.entries(value))walk(child,`${path}/${ptr(key)}`);}};walk(source,'');return found;
}
const fieldRefsExpression=(x:any,out:TableRef[]=[]):TableRef[]=>{
 if(!x||typeof x!=='object')throw new Error('G10_EXPRESSION_INVALID');
 if(x.op==='field'){out.push(x.field);return out;}
 if(x.op==='literal')return out;
 if(['eq','ne','lt','le','gt','ge'].includes(x.op)){fieldRefsExpression(x.left,out);fieldRefsExpression(x.right,out);return out;}
 if(['and','or'].includes(x.op)){if(!Array.isArray(x.args))throw new Error('G10_EXPRESSION_INVALID');for(const a of x.args)fieldRefsExpression(a,out);return out;}
 if(['not','isNull'].includes(x.op)){fieldRefsExpression(x.arg,out);return out;}
 if(x.op==='in'){fieldRefsExpression(x.arg,out);return out;}
 throw new Error('G10_EXPRESSION_UNKNOWN');
};
function policyDependencies(rule:TableRowRule,table:TableDeclaration,payload:any,source:any):{fields:FieldBinding[];tables:string[];foreignKeys:{table:string;id:string}[]} {
 const fields:FieldBinding[]=[],tables:string[]=[],foreignKeys:{table:string;id:string}[]=[];const tablesSource=payload.tables as TableDeclaration[];
 const byRecord=(ref:TableRef)=>{const matches=tablesSource.filter(t=>sameRef(t.record,ref));if(matches.length!==1)throw new Error('G10_POLICY_TABLE_BINDING_AMBIGUOUS');return matches[0]!;};
 const walk=(node:TableRowRule,current:TableDeclaration):void=>{
  switch(node.kind){case'deny':case'allow':case'memberOfRole':return;case'owner':case'memberOf':fields.push({table:current.id,field:node.field});return;case'any':case'all':for(const child of node.rules)walk(child,current);return;case'related':{const target=byRecord(node.record);tables.push(target.id);for(const pair of node.matches){fields.push({table:current.id,field:pair.source},{table:target.id,field:pair.target});}walk(node.rule,target);return;}case'via':{let from=current;for(const step of node.path){const bindings=tablesSource.flatMap(t=>t.foreignKeys.filter(fk=>fk.relationship?.module===step.module&&fk.relationship.id===step.id).map(fk=>({table:t,fk})));if(bindings.length!==1)throw new Error('G10_POLICY_RELATIONSHIP_AMBIGUOUS');const {table:fkTable,fk}=bindings[0]!,target=byRecord(fk.target.record),next=step.direction==='forward'?target:fkTable;if(!sameRef(from.record,step.direction==='forward'?fkTable.record:target.record))throw new Error('G10_POLICY_RELATIONSHIP_DISCONNECTED');const targetRecord=findElement(source,fk.target.record,'/policy').value,targetKey=targetRecord.keys?.find((key:any)=>key.id===fk.target.key);if(!targetKey)throw new Error('G10_POLICY_TARGET_KEY_MISSING');foreignKeys.push({table:fkTable.id,id:fk.id});for(let index=0;index<fk.fields.length;index++){const pair=step.direction==='forward'?{from:{table:fkTable.id,field:fk.fields[index]!},to:{table:target.id,field:targetKey.fields[index]!}}:{from:{table:target.id,field:targetKey.fields[index]!},to:{table:fkTable.id,field:fk.fields[index]!}};fields.push(pair.from,pair.to);}tables.push(next.id);from=next;}walk(node.rule,from);return;}default:throw new Error('G10_POLICY_UNKNOWN');}
 };
 // The caller supplies source-independent table structure. `via` key refs are added by graph construction.
 walk(rule,table);return {fields,tables,foreignKeys};
}
function sourcePayload(bundle:TableDeploymentBundle):{source:any;module:any;payload:any;moduleIndex:number;extensionPath:string}{
 if(bundle.source.format!=='json')throw new Error('G10_JSON_SOURCE_REQUIRED');const source=JSON.parse(bundle.source.utf8);requireObject(source,'/');if(!Array.isArray(source.modules))throw new Error('G10_SOURCE_INVALID:/modules');
 const moduleIndex=source.modules.findIndex((m:any)=>m.id===bundle.module);if(moduleIndex<0)throw new Error('G10_SOURCE_INVALID:/modules');
 const module=source.modules[moduleIndex],payload=module.extensions?.['umf.tables'];if(!payload||Object.keys(payload).length!==4||!['profile','tables','seedSets','commands'].every(key=>Object.hasOwn(payload,key))||payload.profile!=='postgresql18/0.1'||!Array.isArray(payload.tables)||!Array.isArray(payload.seedSets)||!Array.isArray(payload.commands))throw new Error('G10_SOURCE_INVALID:/modules/'+moduleIndex+'/extensions/umf.tables');
 return {source,module,payload,moduleIndex,extensionPath:`/modules/${moduleIndex}/extensions/umf.tables`};
}
function grantProjection(bundle:TableDeploymentBundle,source:any,payload:any,moduleIndex:number):Json[] {
 const cfg=bundle.configuration as any,out:Json[]=[];
 for(const table of payload.tables as TableDeclaration[]){const ti=payload.tables.indexOf(table),base=`/modules/${moduleIndex}/extensions/umf.tables/tables/${ti}`;
  out.push({table:table.id,role:'PUBLIC',privilege:'all',columns:null,grantOption:false,sourcePath:base,state:'present',effect:'revoke-all'});
  const record=findElement(source,table.record,base+'/record').value;
  for(const audience of ['person','batch'] as const)for(const command of ['select','insert','update','delete'] as const){
   const rule=table.policy[audience][command],sourcePath=`${base}/policy/${audience}/${command}`;
   if(rule.kind==='deny')continue;
   let row;
   try{row=deriveTableGrantEffectRow({table,recordModule:table.record.module,record,schema:cfg.schema,role:audience==='person'?cfg.personRole:cfg.batchRole,audience,command});}
   catch(error){if(error instanceof Error&&error.message==='TABLE_GRANT_EMPTY_UPDATE')throw new Error('G10_GRANT_EMPTY_UPDATE:'+sourcePath);throw error;}
   out.push({table:row.table,role:row.role,privilege:row.privilege,columns:row.columns===null?null:[...row.columns],grantOption:row.grantOption,sourcePath,state:'present',effect:'grant',rule:clone(rule) as Json});
  }
 }
 out.push({table:null,role:cfg.personRole,privilege:'usage',columns:null,grantOption:false,sourcePath:`/modules/${moduleIndex}/extensions/umf.tables`,state:'present',effect:'grant-schema-usage'});
 out.push({table:null,role:cfg.batchRole,privilege:'usage',columns:null,grantOption:false,sourcePath:`/modules/${moduleIndex}/extensions/umf.tables`,state:'present',effect:'grant-schema-usage'});
 return out;
}
function rendererOperations(bundle:TableDeploymentBundle,source:any,payload:any,moduleIndex:number):InternalTableDeploymentOperationRecord[]{
 const rendered=compileTableDeploymentWithOperations({text:bundle.source.utf8,format:bundle.source.format,configuration:bundle.configuration});
 if(rendered.status!=='compiled'||canonical(rendered.bundle)!==canonical(bundle))throw new Error('G10_RENDERER_RECOMPILE_MISMATCH');
 const operations=rendered.operations,steps=bundle.steps;
 if(operations.length!==steps.length)throw new Error('G10_RENDERER_OPERATION_COUNT_MISMATCH');
 for(const [index,operation]of operations.entries()){
  const step=steps[index];if(!step||operation.stepId!==step.id||operation.kind!==step.kind||operation.sourcePath!==step.sourcePath||operation.transaction!==step.transaction||operation.sql!==step.sql)throw new Error('G10_RENDERER_OPERATION_STEP_MISMATCH:'+index);
 }
 const extension=`/modules/${moduleIndex}/extensions/umf.tables`,tables=payload.tables as TableDeclaration[],exp=bundle.expectedCatalog;
 const exactly=(predicate:(operation:InternalTableDeploymentOperationRecord)=>boolean,count:number,code:string)=>{const matches=operations.filter(predicate);if(matches.length!==count)throw new Error('G10_RENDERER_'+code+'_COUNT:'+matches.length+':'+count);return matches;};
 exactly(op=>op.operation==='create-table',tables.length,'TABLE_CREATE');
 exactly(op=>op.operation==='enable-rls',tables.length,'RLS_ENABLE');
 exactly(op=>op.operation==='force-rls',tables.length,'RLS_FORCE');
 exactly(op=>op.operation==='add-foreign-key',exp.foreignKeys.length,'FOREIGN_KEY');
 exactly(op=>op.operation==='add-index',exp.indexes.length,'INDEX');
 exactly(op=>op.operation==='revoke-public',tables.length,'PUBLIC_REVOKE');
 exactly(op=>op.operation==='create-policy',tables.length*8,'POLICY');
 exactly(op=>op.operation==='set-comment',exp.comments?.length??0,'COMMENT');
 exactly(op=>op.operation==='grant-schema-usage',1,'SCHEMA_GRANT');
 const grants=grantProjection(bundle,source,payload,moduleIndex),tableGrants=grants.filter((grant:any)=>grant.table!==null&&grant.role!=='PUBLIC');
 exactly(op=>op.operation==='grant-table',tableGrants.length,'TABLE_GRANT');
 for(const [index,table]of tables.entries()){
  const create=operations.find(op=>op.operation==='create-table'&&op.subject.kind==='table'&&op.subject.table===table.id);
  if(!create||create.sourcePath!==`${extension}/tables/${index}`||create.subject.kind!=='table'||canonical(create.subject.declaration)!==canonical(table))throw new Error('G10_RENDERER_TABLE_SOURCE_MISMATCH:'+table.id);
  const sameTable=(rows:any[])=>rows.filter(row=>row.table===table.id);
  for(const [key,rows]of [['columns',exp.columns],['keys',exp.keys],['checks',exp.checks]] as const){
   if(canonical(create.subject.catalog[key])!==canonical(sameTable(rows)))throw new Error('G10_RENDERER_EMBEDDED_CATALOG_MISMATCH:'+table.id+':'+key);
  }
  const tableStateOps=operations.filter(op=>(op.operation==='enable-rls'||op.operation==='force-rls')&&op.subject.kind==='tableState'&&op.subject.table===table.id);
  if(tableStateOps.length!==2||tableStateOps[0]!.operation!=='enable-rls'||tableStateOps[1]!.operation!=='force-rls'||tableStateOps.some(op=>op.sourcePath!==`${extension}/tables/${index}`))throw new Error('G10_RENDERER_RLS_ORDER_MISMATCH:'+table.id);
 }
 for(const foreignKey of exp.foreignKeys){if(!operations.some(op=>op.operation==='add-foreign-key'&&op.subject.kind==='foreignKey'&&op.subject.table===foreignKey.table&&op.subject.id===foreignKey.id))throw new Error('G10_RENDERER_FOREIGN_KEY_SUBJECT_MISSING:'+foreignKey.id);}
 for(const idx of exp.indexes){if(!operations.some(op=>op.operation==='add-index'&&op.subject.kind==='index'&&op.subject.table===idx.table&&op.subject.id===idx.id))throw new Error('G10_RENDERER_INDEX_SUBJECT_MISSING:'+idx.id);}
 const schemaGrant=operations.find(op=>op.operation==='grant-schema-usage');
 if(!schemaGrant||schemaGrant.subject.kind!=='schema-grant'||schemaGrant.subject.schema!==bundle.configuration.schema||canonical(schemaGrant.subject.audiences)!==canonical(['person','batch'])||schemaGrant.subject.privilege!=='USAGE')throw new Error('G10_RENDERER_SCHEMA_GRANT_SUBJECT_MISMATCH');
 return operations;
}
function catalogProjection(bundle:TableDeploymentBundle,source:any,payload:any,moduleIndex:number,rendererOps:InternalTableDeploymentOperationRecord[]):CatalogProjection & {sourcePaths:Map<string,string>} {
 const exp=bundle.expectedCatalog,extension=`/modules/${moduleIndex}/extensions/umf.tables`,tables=payload.tables as TableDeclaration[],sourcePaths=new Map<string,string>();
 const catalog:PrefixCatalog={tables:[],columns:[],keys:[],checks:[],foreignKeys:[],indexes:[],policies:[],grants:[],comments:[]};const out:CatalogProjection={catalog,dependencies:[],operations:[],rendererOperations:rendererOps,seedStates:[],sourcePaths};
 const push=(target:Subject[],kind:string,table:string|null,subject:unknown,meaning:unknown,sourcePath:string,extra:Partial<Subject>={})=>{const id=identity(kind,table,subject);const key=ik(id);if(sourcePaths.has(key))throw new Error('G10_DUPLICATE_CATALOG_SUBJECT:'+key);sourcePaths.set(key,sourcePath);target.push({identity:id,meaning:clone(meaning) as Json,state:'present',...extra});return key;};
 const tableIdentity=new Map<string,string>(),columnIdentity=new Map<string,string>(),keyIdentity=new Map<string,string>();
 for(const [i,t] of tables.entries()){
  const p=`${extension}/tables/${i}`,recordLocation=findElement(source,t.record,p+'/record'),record=recordLocation.value;
  tableIdentity.set(t.id,push(out.catalog.tables,'table',t.id,t.record,{declaration:clone(t),record:clone(record),schema:bundle.configuration.schema,name:t.name,rls:{enabled:true,forced:true}},p));
  for(const col of t.columns){const identityKey=refKey(col.field),expectation=exp.columns.find((x:any)=>x.table===t.id&&sameRef(x.field,col.field));if(!expectation)throw new Error('G10_COLUMN_EXPECTATION_MISSING');columnIdentity.set(`${t.id}\0${identityKey}`,push(out.catalog.columns,'column',t.id,col.field,{column:clone(col),field:clone(findElement(source,col.field,p+'/columns').value),expectation:clone(expectation)},`${p}/columns/${t.columns.indexOf(col)}`));}
  for(const [j,key]of (record.keys??[]).entries()){const expectation=exp.keys.find((x:any)=>x.table===t.id&&x.id===key.id);if(!expectation)throw new Error('G10_KEY_EXPECTATION_MISSING');keyIdentity.set(`${t.id}\0${key.id}`,push(out.catalog.keys,'key',t.id,key.id,{declaration:clone(key),expectation:clone(expectation)},recordLocation.path+'/keys/'+j));}
 }
 for(const item of exp.columns){const key=`column\0${item.table}\0${refKey(item.field)}`;if(!sourcePaths.has(ik(identity('column',item.table,item.field))))throw new Error('G10_CATALOG_COLUMN_UNBOUND:'+item.table+':'+refKey(item.field));}
 const expressionDeps=new Map<string,FieldBinding[]>();
 for(const [i,t] of tables.entries()){
  const p=`${extension}/tables/${i}`;
  const addCheck=(check:any,path:string,generated=false)=>{const refs=(generated?[check.field]:fieldRefsExpression(check.expression)).map(field=>({table:t.id,field}));const expectation=exp.checks.find((x:any)=>x.table===t.id&&x.id===check.id);if(!expectation)throw new Error('G10_CHECK_EXPECTATION_MISSING');const id=push(out.catalog.checks,'check',t.id,check.id,{declaration:generated?null:clone(check),field:generated?clone(check.field):null,fieldRefs:refs,expectation:clone(expectation)},path,{validation:'validated'});expressionDeps.set(id,refs);};
  for(const [j,c]of t.checks.entries())addCheck(c,`${p}/checks/${j}`);
  for(const c of t.columns){const id=`domain:${c.field.module}.${c.field.element}`,expectation=exp.checks.find((x:any)=>x.table===t.id&&x.id===id);if(expectation)addCheck({id,field:c.field},`${p}/columns/${t.columns.indexOf(c)}/domain`,true);}
  for(const [j,fk]of t.foreignKeys.entries()){
   const expectation=exp.foreignKeys.find((x:any)=>x.table===t.id&&x.id===fk.id);if(!expectation)throw new Error('G10_FK_EXPECTATION_MISSING');const target=(tables as any[]).filter(x=>sameRef(x.record,fk.target.record));if(target.length!==1)throw new Error('G10_FK_TARGET_AMBIGUOUS');const sourceKey=(target[0] as any).id+'\0'+fk.target.key,key=keyIdentity.get(sourceKey);if(!key)throw new Error('G10_FK_TARGET_KEY_MISSING');const targetRecord=findElement(source,target[0]!.record,p+'/foreignKeys/'+j).value,targetKey=targetRecord.keys?.find((k:any)=>k.id===fk.target.key);if(!targetKey)throw new Error('G10_FK_TARGET_KEY_MISSING');const refs=[...fk.fields.map(field=>({table:t.id,field})),...targetKey.fields.map((field:TableRef)=>({table:(target[0] as any).id,field}))];const id=push(out.catalog.foreignKeys,'foreignKey',t.id,fk.id,{declaration:clone(fk),expectation:clone(expectation),targetTable:(target[0] as any).id,targetRecord:clone(fk.target.record),targetKeyId:fk.target.key,fieldRefs:refs},`${p}/foreignKeys/${j}`,{validation:'validated'});expressionDeps.set(id,refs);
   out.dependencies.push({from:id,to:key,reason:'foreign-key-requires-target-key',sourcePath:`${p}/foreignKeys/${j}`,state:'present'});
  }
  for(const [j,index]of t.indexes.entries()){
   const expectation=exp.indexes.find((x:any)=>x.table===t.id&&x.id===index.id);if(!expectation)throw new Error('G10_INDEX_EXPECTATION_MISSING');const refs=[...index.fields,...index.include].map(field=>({table:t.id,field})),id=push(out.catalog.indexes,'index',t.id,index.id,{declaration:clone(index),expectation:clone(expectation),fieldRefs:refs},`${p}/indexes/${j}`,{validity:'valid'});expressionDeps.set(id,refs);
  }
  for(const audience of ['person','batch'] as const)for(const command of ['select','insert','update','delete'] as const){const rule=t.policy[audience][command],path=`${p}/policy/${audience}/${command}`,deps=policyDependencies(rule,t,payload,source),id=push(out.catalog.policies,'policy',t.id,[audience,command],{audience,command,rule:clone(rule),fieldRefs:deps.fields,relatedTables:deps.tables,sourcePath:path},path);expressionDeps.set(id,deps.fields);for(const related of deps.tables){const relatedId=tableIdentity.get(related);if(!relatedId)throw new Error('G10_POLICY_TARGET_TABLE_MISSING');out.dependencies.push({from:id,to:relatedId,reason:'policy-requires-related-table',sourcePath:path,state:'present'});}for(const fk of deps.foreignKeys)out.dependencies.push({from:id,to:ik(identity('foreignKey',fk.table,fk.id)),reason:'policy-requires-relationship-foreign-key',sourcePath:path,state:'present'});}
 }
 for(const comment of exp.comments??[]){
  const commentTable=tables.find(table=>table.id===comment.table);if(!commentTable)throw new Error('G10_COMMENT_TABLE_UNBOUND');const tableIndex=tables.indexOf(commentTable),subject=comment.column===undefined?['table']:['column',comment.column];
  let path:string,refs:TableRef[]=[];
  if(comment.column===undefined)path=`${extension}/tables/${tableIndex}/comments`;
  else {const columnIndex=commentTable.columns.findIndex(column=>column.name===comment.column);if(columnIndex<0)throw new Error('G10_COMMENT_COLUMN_UNBOUND');path=`${extension}/tables/${tableIndex}/columns/${columnIndex}`;refs=[commentTable.columns[columnIndex]!.field];}
  const commentId=push(out.catalog.comments,'comment',comment.table,subject,{expectation:clone(comment),fieldRefs:refs},path);for(const field of refs){const to=columnIdentity.get(`${comment.table}\0${refKey(field)}`);if(!to)throw new Error('G10_COMMENT_FIELD_UNBOUND');out.dependencies.push({from:commentId,to,reason:'comment-requires-column',sourcePath:path,state:'present'});}
 }
 out.catalog.grants=(grantProjection(bundle,source,payload,moduleIndex) as any[]).map((grant:any)=>{const grantIdentity=identity('grant',grant.table,[grant.role,grant.privilege,grant.columns]),key=ik(grantIdentity);sourcePaths.set(key,grant.sourcePath);return {identity:grantIdentity,meaning:grant,state:'present'};});
 for(const [id,refs]of expressionDeps){const owner=sourcePaths.get(id)!;for(const binding of refs){const target=columnIdentity.get(`${binding.table}\0${refKey(binding.field)}`);if(!target)throw new Error('G10_TYPED_FIELD_DEPENDENCY_MISSING:'+binding.table+':'+refKey(binding.field));out.dependencies.push({from:id,to:target,reason:'typed-field-reference',sourcePath:owner,state:'present'});}}
 for(const subject of [...out.catalog.columns,...out.catalog.keys,...out.catalog.checks,...out.catalog.foreignKeys,...out.catalog.indexes,...out.catalog.policies,...out.catalog.grants,...out.catalog.comments]){
  const target=subject.identity.table===null?null:tableIdentity.get(subject.identity.table);if(target)out.dependencies.push({from:ik(subject.identity),to:target,reason:'owned-by-table',sourcePath:sourcePaths.get(ik(subject.identity))??extension,state:'present'});
 }
 for(const grant of out.catalog.grants){const meaning=grant.meaning as any;if(meaning.table===null)continue;if(Array.isArray(meaning.columns)){const table=payload.tables.find((t:any)=>t.id===meaning.table) as TableDeclaration|undefined;if(!table)throw new Error('G10_GRANT_TABLE_MISSING');for(const columnName of meaning.columns){const column=table.columns.find(c=>c.name===columnName);if(!column)throw new Error('G10_GRANT_COLUMN_MISSING');const to=columnIdentity.get(`${table.id}\0${refKey(column.field)}`);if(!to)throw new Error('G10_GRANT_FIELD_MISSING');out.dependencies.push({from:ik(grant.identity),to,reason:'grant-requires-column',sourcePath:meaning.sourcePath,state:'present'});}}}
 for(const table of tables){const record=findElement(source,table.record,extension+'/tables').value;for(const key of record.keys??[]){const from=keyIdentity.get(`${table.id}\0${key.id}`)!;for(const field of key.fields){const to=columnIdentity.get(`${table.id}\0${refKey(field)}`);if(!to)throw new Error('G10_KEY_FIELD_UNBOUND');out.dependencies.push({from,to,reason:'key-requires-column',sourcePath:extension+'/tables/'+tables.indexOf(table)+'/record',state:'present'});}}}
 for(const [i,raw]of payload.commands.entries()){const operation=requireObject(raw,`${extension}/commands/${i}`) as unknown as TableOperation,commandId=operation.id,sourcePath=`${extension}/commands/${i}`;if(typeof commandId!=='string'||commandId.length===0)throw new Error('G10_OPERATION_ID_INVALID');const refs=operationReferences(operation,tables,source),meaning={operation:clone(raw),logicalParameterDomains:clone(refs.logicalParameters)},from=push(out.operations,'operation',null,commandId,meaning,sourcePath);for(const tableId of refs.tables){const to=tableIdentity.get(tableId);if(!to)throw new Error('G10_OPERATION_TABLE_UNBOUND:'+tableId);out.dependencies.push({from,to,reason:'operation-requires-table',sourcePath,state:'present'});}for(const binding of refs.fields){const to=columnIdentity.get(`${binding.table}\0${refKey(binding.field)}`);if(!to)throw new Error('G10_OPERATION_FIELD_UNBOUND:'+binding.table+':'+refKey(binding.field));out.dependencies.push({from,to,reason:'operation-requires-field',sourcePath,state:'present'});}for(const keyUse of refs.keys){const to=keyIdentity.get(`${keyUse.table}\0${keyUse.key}`);if(!to)throw new Error('G10_OPERATION_KEY_UNBOUND:'+keyUse.table+':'+keyUse.key);out.dependencies.push({from,to,reason:keyUse.purpose==='cursor'?'operation-requires-cursor-key':'operation-requires-conflict-key',sourcePath,state:'present'});}}
 for(const [i,seed]of payload.seedSets.entries()){const seedId=push(out.operations,'seed-set',null,seed.id,seed,`${extension}/seedSets/${i}`);out.seedStates.push({id:seed.id,definitionDigest:hashCanonical(seed),sourcePath:`${extension}/seedSets/${i}`,state:'not-run'});for(const row of seed.rows??[]){if(!tableIdentity.has(row.table))throw new Error('G10_SEED_TABLE_UNBOUND');out.dependencies.push({from:seedId,to:tableIdentity.get(row.table)!,reason:'seed-set-requires-table',sourcePath:`${extension}/seedSets/${i}`,state:'present'});}}
 return {catalog:out.catalog,dependencies:out.dependencies,operations:out.operations,rendererOperations:out.rendererOperations,seedStates:out.seedStates,sourcePaths};
}
function projectOne(verified:TableDeploymentBundle,side:Side,tableId:string,parts:ReturnType<typeof sourcePayload>,projection:CatalogProjection,pathValues:Map<string,Json>,sourceOrder:Map<string,number>):{review:InventoryProjection;table:InventoryTable;projection:CatalogProjection} {
 const {source,module,payload,moduleIndex,extensionPath}=parts,i=payload.tables.findIndex((t:any)=>t.id===tableId);if(i<0)throw new Error('G10_TABLE_MISSING:'+tableId);
 const declaration=payload.tables[i] as TableDeclaration,record=findElement(source,declaration.record,extensionPath+'/tables/'+i+'/record');
 const start=ik(identity('table',tableId,declaration.record)),included=new Set([start]);let changed=true;
 // Dependency closure follows typed compiler-derived edges in both directions:
 // inbound FKs/policies/operations/seeds and outbound key/field requirements all remain visible.
 while(changed){changed=false;for(const edge of projection.dependencies){if(included.has(edge.from)&&!included.has(edge.to)){included.add(edge.to);changed=true;}if(included.has(edge.to)&&!included.has(edge.from)){included.add(edge.from);changed=true;}}}
 const filter=(items:Subject[])=>items.filter(item=>included.has(ik(item.identity))||item.identity.kind==='grant'&&item.identity.table===null);
 const meaningCatalog:PrefixCatalog={tables:filter(projection.catalog.tables),columns:filter(projection.catalog.columns),keys:filter(projection.catalog.keys),checks:filter(projection.catalog.checks),foreignKeys:filter(projection.catalog.foreignKeys),indexes:filter(projection.catalog.indexes),policies:filter(projection.catalog.policies),grants:filter(projection.catalog.grants),comments:filter(projection.catalog.comments)};
 const selectedEdges=projection.dependencies.filter(edge=>included.has(edge.from)&&included.has(edge.to));
 const selectedPaths=new Set<string>([`${extensionPath}/tables/${i}`,record.path]);
 // Preserve admitted, unclassified module extensions and the selected table vocabulary declaration.
 // They stay opaque: changing one remains visible in this table's review meaning.
 if(pathValues.has('/vocabularies/umf.tables'))selectedPaths.add('/vocabularies/umf.tables');
 for(const extensionName of Object.keys(module.extensions??{}))if(extensionName!=='umf.tables'){selectedPaths.add(`${pathFor(moduleIndex,'extensions',extensionName)}`);if(pathValues.has(`/vocabularies/${ptr(extensionName)}`))selectedPaths.add(`/vocabularies/${ptr(extensionName)}`);}
 for(const column of declaration.columns)selectedPaths.add(findElement(source,column.field,`${extensionPath}/tables/${i}/columns`).path);
 for(const key of included){const sourcePath=projection.sourcePaths.get(key);if(sourcePath)selectedPaths.add(sourcePath);}
 for(const subject of projection.operations){
  if(!included.has(ik(subject.identity)))continue;
  if(subject.identity.kind==='seed-set')continue;
  if(subject.identity.kind!=='operation')throw new Error('G10_OPERATION_SUBJECT_KIND_UNSUPPORTED:'+subject.identity.kind);
  if(!subject.meaning||typeof subject.meaning!=='object'||Array.isArray(subject.meaning))throw new Error('G10_OPERATION_PARAMETER_DOMAIN_SHAPE');
  const domains=(subject.meaning as any).logicalParameterDomains;if(!Array.isArray(domains))throw new Error('G10_OPERATION_PARAMETER_DOMAIN_SHAPE');
  for(const domain of domains){if(!domain||typeof domain.definitionPath!=='string'||!domain.definition||typeof domain.definition!=='object'||Array.isArray(domain.definition))throw new Error('G10_OPERATION_PARAMETER_DOMAIN_SHAPE');selectedPaths.add(domain.definitionPath);}
 }
 for(const edge of selectedEdges)selectedPaths.add(edge.sourcePath);
 const closurePaths=[...selectedPaths].filter(path=>pathValues.has(path)).sort((a,b)=>sourceOrder.get(a)!-sourceOrder.get(b)!);
 const sourceClosure=closurePaths.map(path=>({path:path||'/',value:clone(pathValues.get(path)!) as Json}));
 const selectedOperationIds=new Set(projection.operations.filter(item=>item.identity.kind==='operation'&&included.has(ik(item.identity))).map(item=>item.identity.subject as string));
 const seedDefinitions=payload.seedSets.flatMap((seed:any,j:number)=>{const key=ik(identity('seed-set',null,seed.id));return included.has(key)?[{id:seed.id,definitionDigest:hashCanonical(seed),sourcePath:`${extensionPath}/seedSets/${j}`,definition:clone(seed) as Json}]:[];});
 const meaning={physicalTable:{path:`${extensionPath}/tables/${i}`,value:clone(declaration)},recordDefinition:{path:record.path,value:clone(record.value)},fieldDefinitions:declaration.columns.map((c,j)=>{const f=findElement(source,c.field,`${extensionPath}/tables/${i}/columns/${j}/field`);return {path:f.path,value:clone(f.value)};}),sourceClosure,catalog:meaningCatalog,dependencies:selectedEdges,operationIds:[...selectedOperationIds],seedDefinitions};
 const review:InventoryProjection={profile:'umf.table-inventory-review/0.1',side,source:{format:'json',sha256:verified.sourceDigest},configuration:toJson(verified.configuration,'/configuration'),table:tableId,record:clone(declaration.record),meaning:toJson(meaning,'/meaning'),intent:null,effects:[]};
 const meaningDigest=hashCanonical(meaning);
 return {review,table:{table:tableId,record:clone(declaration.record),schema:verified.configuration.schema,name:declaration.name,meaningDigest},projection};
}
export function projectG10Bundle(input:unknown,side:Side):{bundle:TableDeploymentBundle;tables:InventoryTable[];reviews:InventoryProjection[];projection:CatalogProjection} {
 const bundle=verifyTableDeployment(input),parts=sourcePayload(bundle),{payload}=parts;
 const operations=rendererOperations(bundle,parts.source,payload,parts.moduleIndex),projection=catalogProjection(bundle,parts.source,payload,parts.moduleIndex,operations),pathValues=sourcePathIndex(parts.source as Json),sourceOrder=new Map([...pathValues.keys()].map((path,index)=>[path,index])),rows=(payload.tables as TableDeclaration[]).map(t=>projectOne(bundle,side,t.id,parts,projection,pathValues,sourceOrder));return {bundle,tables:rows.map(x=>x.table),reviews:rows.map(x=>x.review),projection};
}
