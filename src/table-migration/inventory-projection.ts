/** Source-verified catalog projection leaf for table inventory compilation. */
import {compileTableDeploymentWithOperations,verifyTableDeployment,verifyTableDeploymentWithAccounting,type TableDeploymentBundle} from '../table-deployment';
import type {InternalTableDeploymentOperationRecord} from '../table-deployment/types';
import {deriveTableGrantEffectRow} from '../table-deployment/grants';
import {canonical,canonicalCharged,hashCanonical,hashCanonicalCharged} from '../compilation/bundle/hash';
import {copyJsonCharged} from '../model/json';
import type {AccountingContext} from '../model/internal/accounting-context';
import {buildOwnedSourceFieldIndex,type OwnedSourceFieldIndex} from './inventory-g05-selection';
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
const copyHooks=(accounting:AccountingContext)=>({beforeProperty:(key:string,path:string,isArray:boolean)=>{accounting.visit('inventory-projection-copy-preflight',path);if(!isArray)accounting.scanUtf8(key,path);},retainText:(text:string,path:string)=>{accounting.scanUtf8(text,path);}});
const projectionCopy=<T>(x:T,accounting:AccountingContext,path:string):T=>copyJsonCharged(x,n=>accounting.visit('inventory-projection-copy',path,n),copyHooks(accounting)) as T;
function toJson(value:unknown,path='/',accounting?:AccountingContext):Json {
 accounting?.visit('inventory-projection-json-node',path);
 if(value===null||typeof value==='boolean')return value;
 if(typeof value==='string'){accounting?.scanUtf8(value,path);return value;}
 if(typeof value==='number'&&Number.isFinite(value))return value;
 if(Array.isArray(value)){const result:Json[]=[];for(let index=0;index<value.length;index++){accounting?.visit('inventory-projection-json-array-slot',`${path}/${index}`);result.push(toJson(value[index],`${path}/${index}`,accounting));}return result;}
 if(value&&typeof value==='object'&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null)){
  const result:{[key:string]:Json}={};for(const key in value as object){if(!Object.hasOwn(value,key))continue;accounting?.visit('inventory-projection-json-object-key',`${path}/${ptr(key)}`);accounting?.scanUtf8(key,path);Object.defineProperty(result,key,{value:toJson((value as Record<string,unknown>)[key],`${path}/${ptr(key)}`,accounting),enumerable:true,writable:true,configurable:true});}return result;
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
const findElement=(source:any,ref:TableRef,path:string,accounting?:AccountingContext)=>{
 let mi=-1;for(let index=0;index<source.modules.length;index++){accounting?.visit('inventory-projection-module-reference-scan',path);if(source.modules[index]?.id===ref.module){mi=index;break;}}if(mi<0)throw new Error('G10_REF_MISSING:'+path);
 let ei=-1;for(let index=0;index<source.modules[mi].elements.length;index++){accounting?.visit('inventory-projection-element-reference-scan',path);if(source.modules[mi].elements[index]?.id===ref.element){ei=index;break;}}if(ei<0)throw new Error('G10_REF_MISSING:'+path);
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
function policyDependencies(rule:TableRowRule,table:TableDeclaration,payload:any,source:any,accounting?:AccountingContext):{fields:FieldBinding[];tables:string[];foreignKeys:{table:string;id:string}[]} {
 const fields:FieldBinding[]=[],tables:string[]=[],foreignKeys:{table:string;id:string}[]=[];const tablesSource=payload.tables as TableDeclaration[];
 const byRecord=(ref:TableRef)=>{const matches:TableDeclaration[]=[];for(const candidate of tablesSource){accounting?.visit('inventory-projection-policy-record-binding','/policy/tables');if(sameRef(candidate.record,ref))matches.push(candidate);}if(matches.length!==1)throw new Error('G10_POLICY_TABLE_BINDING_AMBIGUOUS');return matches[0]!;};
 const walk=(node:TableRowRule,current:TableDeclaration):void=>{
  accounting?.visit('inventory-projection-policy-rule','/policy/rule');switch(node.kind){case'deny':case'allow':case'memberOfRole':return;case'owner':case'memberOf':fields.push({table:current.id,field:node.field});return;case'any':case'all':for(const child of node.rules)walk(child,current);return;case'related':{const target=byRecord(node.record);tables.push(target.id);for(const pair of node.matches){accounting?.visit('inventory-projection-policy-match','/policy/matches');fields.push({table:current.id,field:pair.source},{table:target.id,field:pair.target});}walk(node.rule,target);return;}case'via':{let from=current;for(const step of node.path){const bindings:{table:TableDeclaration;fk:TableDeclaration['foreignKeys'][number]}[]=[];for(const candidate of tablesSource)for(const fk of candidate.foreignKeys){accounting?.visit('inventory-projection-policy-relationship-scan','/policy/relationships');if(fk.relationship?.module===step.module&&fk.relationship.id===step.id)bindings.push({table:candidate,fk});}if(bindings.length!==1)throw new Error('G10_POLICY_RELATIONSHIP_AMBIGUOUS');const {table:fkTable,fk}=bindings[0]!,target=byRecord(fk.target.record),next=step.direction==='forward'?target:fkTable;if(!sameRef(from.record,step.direction==='forward'?fkTable.record:target.record))throw new Error('G10_POLICY_RELATIONSHIP_DISCONNECTED');const targetRecord=findElement(source,fk.target.record,'/policy',accounting).value;let targetKey:any;for(const key of targetRecord.keys??[]){accounting?.visit('inventory-projection-policy-target-key','/policy/targetKey');if(key.id===fk.target.key){targetKey=key;break;}}if(!targetKey)throw new Error('G10_POLICY_TARGET_KEY_MISSING');foreignKeys.push({table:fkTable.id,id:fk.id});for(let index=0;index<fk.fields.length;index++){accounting?.visit('inventory-projection-policy-field-pair','/policy/foreignKeyFields');const pair=step.direction==='forward'?{from:{table:fkTable.id,field:fk.fields[index]!},to:{table:target.id,field:targetKey.fields[index]!}}:{from:{table:target.id,field:targetKey.fields[index]!},to:{table:fkTable.id,field:fk.fields[index]!}};fields.push(pair.from,pair.to);}tables.push(next.id);from=next;}walk(node.rule,from);return;}default:throw new Error('G10_POLICY_UNKNOWN');}
 };
 // The caller supplies source-independent table structure. `via` key refs are added by graph construction.
 walk(rule,table);return {fields,tables,foreignKeys};
}
function sourcePayload(bundle:TableDeploymentBundle,ownedDocument?:unknown,accounting?:AccountingContext):{source:any;module:any;payload:any;moduleIndex:number;extensionPath:string}{
 if(bundle.source.format!=='json')throw new Error('G10_JSON_SOURCE_REQUIRED');accounting?.visit('inventory-projection-source-parse','/source');const source=ownedDocument??JSON.parse(bundle.source.utf8);requireObject(source,'/');if(!Array.isArray(source.modules))throw new Error('G10_SOURCE_INVALID:/modules');
 const moduleIndex=source.modules.findIndex((m:any)=>m.id===bundle.module);if(moduleIndex<0)throw new Error('G10_SOURCE_INVALID:/modules');
 const module=source.modules[moduleIndex],payload=module.extensions?.['umf.tables'];if(!payload||Object.keys(payload).length!==4||!['profile','tables','seedSets','commands'].every(key=>Object.hasOwn(payload,key))||payload.profile!=='postgresql18/0.1'||!Array.isArray(payload.tables)||!Array.isArray(payload.seedSets)||!Array.isArray(payload.commands))throw new Error('G10_SOURCE_INVALID:/modules/'+moduleIndex+'/extensions/umf.tables');
 return {source,module,payload,moduleIndex,extensionPath:`/modules/${moduleIndex}/extensions/umf.tables`};
}
function grantProjection(bundle:TableDeploymentBundle,source:any,payload:any,moduleIndex:number,accounting?:AccountingContext):Json[] {
 const cfg=bundle.configuration as any,out:Json[]=[];
 for(const [ti,table]of (payload.tables as TableDeclaration[]).entries()){accounting?.visit('inventory-projection-grant-table','/catalog/grants');const base=`/modules/${moduleIndex}/extensions/umf.tables/tables/${ti}`;
  out.push({table:table.id,role:'PUBLIC',privilege:'all',columns:null,grantOption:false,sourcePath:base,state:'present',effect:'revoke-all'});
  const record=findElement(source,table.record,base+'/record',accounting).value;
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
function rendererOperations(bundle:TableDeploymentBundle,source:any,payload:any,moduleIndex:number,verifiedOperations?:InternalTableDeploymentOperationRecord[],accounting?:AccountingContext):InternalTableDeploymentOperationRecord[]{
 const rendered=verifiedOperations?null:compileTableDeploymentWithOperations({text:bundle.source.utf8,format:bundle.source.format,configuration:bundle.configuration});
 if(!verifiedOperations&&(rendered?.status!=='compiled'||canonical(rendered.bundle)!==canonical(bundle)))throw new Error('G10_RENDERER_RECOMPILE_MISMATCH');
 const operations=verifiedOperations??(rendered as Extract<typeof rendered,{status:'compiled'}>).operations,steps=bundle.steps;
 if(operations.length!==steps.length)throw new Error('G10_RENDERER_OPERATION_COUNT_MISMATCH');
 for(const [index,operation]of operations.entries()){
  accounting?.visit('inventory-renderer-operation-binding',`/operations/${index}`);
  const step=steps[index];if(!step||operation.stepId!==step.id||operation.kind!==step.kind||operation.sourcePath!==step.sourcePath||operation.transaction!==step.transaction||operation.sql!==step.sql)throw new Error('G10_RENDERER_OPERATION_STEP_MISMATCH:'+index);
 }
 const extension=`/modules/${moduleIndex}/extensions/umf.tables`,tables=payload.tables as TableDeclaration[],exp=bundle.expectedCatalog;
 const exactly=(predicate:(operation:InternalTableDeploymentOperationRecord)=>boolean,count:number,code:string)=>{accounting?.visit('inventory-renderer-operation-count-check',`/operations/${code}`,operations.length);const matches=operations.filter(predicate);if(matches.length!==count)throw new Error('G10_RENDERER_'+code+'_COUNT:'+matches.length+':'+count);return matches;};
 exactly(op=>op.operation==='create-table',tables.length,'TABLE_CREATE');
 exactly(op=>op.operation==='enable-rls',tables.length,'RLS_ENABLE');
 exactly(op=>op.operation==='force-rls',tables.length,'RLS_FORCE');
 exactly(op=>op.operation==='add-foreign-key',exp.foreignKeys.length,'FOREIGN_KEY');
 exactly(op=>op.operation==='add-index',exp.indexes.length,'INDEX');
 exactly(op=>op.operation==='revoke-public',tables.length,'PUBLIC_REVOKE');
 exactly(op=>op.operation==='create-policy',tables.length*8,'POLICY');
 exactly(op=>op.operation==='set-comment',exp.comments?.length??0,'COMMENT');
 exactly(op=>op.operation==='grant-schema-usage',1,'SCHEMA_GRANT');
 const grants=grantProjection(bundle,source,payload,moduleIndex,accounting),tableGrants=grants.filter((grant:any)=>grant.table!==null&&grant.role!=='PUBLIC');
 exactly(op=>op.operation==='grant-table',tableGrants.length,'TABLE_GRANT');
 for(const [index,table]of tables.entries()){
  let create:InternalTableDeploymentOperationRecord|undefined;for(const operation of operations){accounting?.visit('inventory-renderer-create-lookup',`/operations/${table.id}`);if(operation.operation==='create-table'&&operation.subject.kind==='table'&&operation.subject.table===table.id){create=operation;break;}}
  if(!create||create.sourcePath!==`${extension}/tables/${index}`||create.subject.kind!=='table'||canonical(create.subject.declaration)!==canonical(table))throw new Error('G10_RENDERER_TABLE_SOURCE_MISMATCH:'+table.id);
  const sameTable=(rows:any[])=>{const matching:any[]=[];for(const row of rows){accounting?.visit('inventory-renderer-table-catalog-match',`/expectedCatalog/${table.id}`);if(row.table===table.id)matching.push(row);}return matching;};
  for(const [key,rows]of [['columns',exp.columns],['keys',exp.keys],['checks',exp.checks]] as const){
   if(canonical(create.subject.catalog[key])!==canonical(sameTable(rows)))throw new Error('G10_RENDERER_EMBEDDED_CATALOG_MISMATCH:'+table.id+':'+key);
  }
  const tableStateOps:InternalTableDeploymentOperationRecord[]=[];for(const op of operations){accounting?.visit('inventory-renderer-rls-lookup',`/operations/${table.id}`);if((op.operation==='enable-rls'||op.operation==='force-rls')&&op.subject.kind==='tableState'&&op.subject.table===table.id)tableStateOps.push(op);}
  if(tableStateOps.length!==2||tableStateOps[0]!.operation!=='enable-rls'||tableStateOps[1]!.operation!=='force-rls'||tableStateOps.some(op=>op.sourcePath!==`${extension}/tables/${index}`))throw new Error('G10_RENDERER_RLS_ORDER_MISMATCH:'+table.id);
 }
 for(const foreignKey of exp.foreignKeys){let found=false;for(const op of operations){accounting?.visit('inventory-renderer-foreign-key-lookup','/operations/foreignKeys');if(op.operation==='add-foreign-key'&&op.subject.kind==='foreignKey'&&op.subject.table===foreignKey.table&&op.subject.id===foreignKey.id){found=true;break;}}if(!found)throw new Error('G10_RENDERER_FOREIGN_KEY_SUBJECT_MISSING:'+foreignKey.id);}
 for(const idx of exp.indexes){let found=false;for(const op of operations){accounting?.visit('inventory-renderer-index-lookup','/operations/indexes');if(op.operation==='add-index'&&op.subject.kind==='index'&&op.subject.table===idx.table&&op.subject.id===idx.id){found=true;break;}}if(!found)throw new Error('G10_RENDERER_INDEX_SUBJECT_MISSING:'+idx.id);}
 let schemaGrant:InternalTableDeploymentOperationRecord|undefined;for(const operation of operations){accounting?.visit('inventory-renderer-schema-grant-lookup','/operations');if(operation.operation==='grant-schema-usage'){schemaGrant=operation;break;}}
 if(!schemaGrant||schemaGrant.subject.kind!=='schema-grant'||schemaGrant.subject.schema!==bundle.configuration.schema||canonical(schemaGrant.subject.audiences)!==canonical(['person','batch'])||schemaGrant.subject.privilege!=='USAGE')throw new Error('G10_RENDERER_SCHEMA_GRANT_SUBJECT_MISMATCH');
 accounting?.visit('inventory-renderer-operation-source-projection','/operations',operations.length);
 return operations;
}
function catalogProjection(bundle:TableDeploymentBundle,source:any,payload:any,moduleIndex:number,rendererOps:InternalTableDeploymentOperationRecord[],accounting?:AccountingContext):CatalogProjection & {sourcePaths:Map<string,string>} {
 const exp=bundle.expectedCatalog,extension=`/modules/${moduleIndex}/extensions/umf.tables`,tables=payload.tables as TableDeclaration[],sourcePaths=new Map<string,string>();
 const first=<T>(rows:readonly T[],predicate:(row:T)=>boolean,category:string,path:string):T|undefined=>{for(const row of rows){accounting?.visit(category,path);if(predicate(row))return row;}return undefined;};
 const catalogArrays=[exp.tables,exp.columns,exp.keys,exp.checks,exp.foreignKeys,exp.indexes,exp.policies,exp.grants,exp.comments??[]];let catalogRows=0;for(let index=0;index<catalogArrays.length;index++){const rows=catalogArrays[index]!;accounting?.visit('inventory-projection-catalog-input-count',`${extension}/expectedCatalog/${index}`,rows.length);catalogRows+=rows.length;}
 // Reserve deterministic work for source-derived catalog loops before their
 // indexes and subject carriers are allocated. Complete input traversal and
 // SQL generation have already been charged by the accounted verifier.
 if(accounting){
  let fieldRefs=0;for(const [tableIndex,table]of tables.entries()){accounting.visit('inventory-projection-field-ref-table',`${extension}/tables/${tableIndex}`);fieldRefs+=table.columns.length+table.checks.length;for(const [fkIndex,fk]of table.foreignKeys.entries()){accounting.visit('inventory-projection-field-ref-foreign-key',`${extension}/tables/${tableIndex}/foreignKeys/${fkIndex}`);fieldRefs+=fk.fields.length;}for(const [indexIndex,index]of table.indexes.entries()){accounting.visit('inventory-projection-field-ref-index',`${extension}/tables/${tableIndex}/indexes/${indexIndex}`);fieldRefs+=index.fields.length+index.include.length;}}
  accounting.visit('inventory-projection-catalog-reservation',extension,catalogRows+tables.length*4+fieldRefs*2);
  accounting.scanUtf8(bundle.source.utf8,`${extension}/source`);
 }
 const catalog:PrefixCatalog={tables:[],columns:[],keys:[],checks:[],foreignKeys:[],indexes:[],policies:[],grants:[],comments:[]};const out:CatalogProjection={catalog,dependencies:[],operations:[],rendererOperations:rendererOps,seedStates:[],sourcePaths};
 const push=(target:Subject[],kind:string,table:string|null,subject:unknown,meaning:unknown,sourcePath:string,extra:Partial<Subject>={})=>{accounting?.visit('inventory-projection-catalog-subject',sourcePath);const id=identity(kind,table,subject);if(accounting){canonicalCharged(id,accounting,`${sourcePath}/@identity`);canonicalCharged(meaning,accounting,`${sourcePath}/@meaning`);accounting.scanUtf8(sourcePath,`${sourcePath}/@path`);}const key=ik(id);if(sourcePaths.has(key))throw new Error('G10_DUPLICATE_CATALOG_SUBJECT:'+key);sourcePaths.set(key,sourcePath);target.push({identity:id,meaning:clone(meaning) as Json,state:'present',...extra});return key;};
 const tableIdentity=new Map<string,string>(),columnIdentity=new Map<string,string>(),keyIdentity=new Map<string,string>();
 for(const [i,t] of tables.entries()){
  const p=`${extension}/tables/${i}`,recordLocation=findElement(source,t.record,p+'/record',accounting),record=recordLocation.value;
  tableIdentity.set(t.id,push(out.catalog.tables,'table',t.id,t.record,{declaration:clone(t),record:clone(record),schema:bundle.configuration.schema,name:t.name,rls:{enabled:true,forced:true}},p));
  for(const [columnIndex,col]of t.columns.entries()){accounting?.visit('inventory-projection-column-binding',`${p}/columns/${columnIndex}`);const identityKey=refKey(col.field),expectation=first(exp.columns,(x:any)=>x.table===t.id&&sameRef(x.field,col.field),'inventory-projection-column-expectation-search','/expectedCatalog/columns');if(!expectation)throw new Error('G10_COLUMN_EXPECTATION_MISSING');columnIdentity.set(`${t.id}\0${identityKey}`,push(out.catalog.columns,'column',t.id,col.field,{column:clone(col),field:clone(findElement(source,col.field,p+'/columns',accounting).value),expectation:clone(expectation)},`${p}/columns/${columnIndex}`));}
  for(const [j,key]of (record.keys??[]).entries()){accounting?.visit('inventory-projection-key-binding',`${recordLocation.path}/keys/${j}`);const expectation=first(exp.keys,(x:any)=>x.table===t.id&&x.id===key.id,'inventory-projection-key-expectation-search','/expectedCatalog/keys');if(!expectation)throw new Error('G10_KEY_EXPECTATION_MISSING');keyIdentity.set(`${t.id}\0${key.id}`,push(out.catalog.keys,'key',t.id,key.id,{declaration:clone(key),expectation:clone(expectation)},recordLocation.path+'/keys/'+j));}
 }
 for(const item of exp.columns){accounting?.visit('inventory-projection-column-expectation-binding','/expectedCatalog/columns');if(!sourcePaths.has(ik(identity('column',item.table,item.field))))throw new Error('G10_CATALOG_COLUMN_UNBOUND:'+item.table+':'+refKey(item.field));}
 const expressionDeps=new Map<string,FieldBinding[]>();
 for(const [i,t] of tables.entries()){
  const p=`${extension}/tables/${i}`;
  const addCheck=(check:any,path:string,generated=false)=>{accounting?.visit('inventory-projection-check-binding',path);const refs=(generated?[check.field]:fieldRefsExpression(check.expression)).map(field=>({table:t.id,field}));const expectation=first(exp.checks,(x:any)=>x.table===t.id&&x.id===check.id,'inventory-projection-check-expectation-search','/expectedCatalog/checks');if(!expectation)throw new Error('G10_CHECK_EXPECTATION_MISSING');const id=push(out.catalog.checks,'check',t.id,check.id,{declaration:generated?null:clone(check),field:generated?clone(check.field):null,fieldRefs:refs,expectation:clone(expectation)},path,{validation:'validated'});expressionDeps.set(id,refs);};
  for(const [j,c]of t.checks.entries())addCheck(c,`${p}/checks/${j}`);
  for(const [columnIndex,c]of t.columns.entries()){const id=`domain:${c.field.module}.${c.field.element}`,expectation=first(exp.checks,(x:any)=>x.table===t.id&&x.id===id,'inventory-projection-domain-check-expectation-search','/expectedCatalog/checks');if(expectation)addCheck({id,field:c.field},`${p}/columns/${columnIndex}/domain`,true);}
  for(const [j,fk]of t.foreignKeys.entries()){
   accounting?.visit('inventory-projection-foreign-key-binding',`${p}/foreignKeys/${j}`);const expectation=first(exp.foreignKeys,(x:any)=>x.table===t.id&&x.id===fk.id,'inventory-projection-foreign-key-expectation-search','/expectedCatalog/foreignKeys');if(!expectation)throw new Error('G10_FK_EXPECTATION_MISSING');const targetMatches:TableDeclaration[]=[];for(const candidate of tables){accounting?.visit('inventory-projection-foreign-key-target-search',`${p}/foreignKeys/${j}`);if(sameRef(candidate.record,fk.target.record))targetMatches.push(candidate);}if(targetMatches.length!==1)throw new Error('G10_FK_TARGET_AMBIGUOUS');const targetTable=targetMatches[0]!,sourceKey=targetTable.id+'\0'+fk.target.key,key=keyIdentity.get(sourceKey);if(!key)throw new Error('G10_FK_TARGET_KEY_MISSING');const targetRecord=findElement(source,targetTable.record,p+'/foreignKeys/'+j,accounting).value;let targetKey:any;for(const candidate of targetRecord.keys??[]){accounting?.visit('inventory-projection-foreign-key-target-key-search',`${p}/foreignKeys/${j}`);if(candidate.id===fk.target.key){targetKey=candidate;break;}}if(!targetKey)throw new Error('G10_FK_TARGET_KEY_MISSING');const refs=[...fk.fields.map(field=>({table:t.id,field})),...targetKey.fields.map((field:TableRef)=>({table:targetTable.id,field}))];const id=push(out.catalog.foreignKeys,'foreignKey',t.id,fk.id,{declaration:clone(fk),expectation:clone(expectation),targetTable:targetTable.id,targetRecord:clone(fk.target.record),targetKeyId:fk.target.key,fieldRefs:refs},`${p}/foreignKeys/${j}`,{validation:'validated'});expressionDeps.set(id,refs);
   out.dependencies.push({from:id,to:key,reason:'foreign-key-requires-target-key',sourcePath:`${p}/foreignKeys/${j}`,state:'present'});
  }
  for(const [j,index]of t.indexes.entries()){
   accounting?.visit('inventory-projection-index-binding',`${p}/indexes/${j}`);const expectation=first(exp.indexes,(x:any)=>x.table===t.id&&x.id===index.id,'inventory-projection-index-expectation-search','/expectedCatalog/indexes');if(!expectation)throw new Error('G10_INDEX_EXPECTATION_MISSING');const refs=[...index.fields,...index.include].map(field=>({table:t.id,field})),id=push(out.catalog.indexes,'index',t.id,index.id,{declaration:clone(index),expectation:clone(expectation),fieldRefs:refs},`${p}/indexes/${j}`,{validity:'valid'});expressionDeps.set(id,refs);
  }
  for(const audience of ['person','batch'] as const)for(const command of ['select','insert','update','delete'] as const){accounting?.visit('inventory-projection-policy-binding',`${p}/policy/${audience}/${command}`);const rule=t.policy[audience][command],path=`${p}/policy/${audience}/${command}`,deps=policyDependencies(rule,t,payload,source,accounting),id=push(out.catalog.policies,'policy',t.id,[audience,command],{audience,command,rule:clone(rule),fieldRefs:deps.fields,relatedTables:deps.tables,sourcePath:path},path);expressionDeps.set(id,deps.fields);for(const related of deps.tables){accounting?.visit('inventory-projection-policy-related-table','/catalog/policies');const relatedId=tableIdentity.get(related);if(!relatedId)throw new Error('G10_POLICY_TARGET_TABLE_MISSING');out.dependencies.push({from:id,to:relatedId,reason:'policy-requires-related-table',sourcePath:path,state:'present'});}for(const fk of deps.foreignKeys){accounting?.visit('inventory-projection-policy-foreign-key','/catalog/policies');out.dependencies.push({from:id,to:accounting?hashCanonicalCharged(identity('foreignKey',fk.table,fk.id),accounting,path):ik(identity('foreignKey',fk.table,fk.id)),reason:'policy-requires-relationship-foreign-key',sourcePath:path,state:'present'});}}
 }
 for(const comment of exp.comments??[]){
  accounting?.visit('inventory-projection-comment-binding','/expectedCatalog/comments');let commentIndex=-1,commentTable:TableDeclaration|undefined;for(let tableIndex=0;tableIndex<tables.length;tableIndex++){accounting?.visit('inventory-projection-comment-table-search','/modules/tables');if(tables[tableIndex]!.id===comment.table){commentIndex=tableIndex;commentTable=tables[tableIndex];break;}}if(!commentTable)throw new Error('G10_COMMENT_TABLE_UNBOUND');const tableIndex=commentIndex,subject=comment.column===undefined?['table']:['column',comment.column];
  let path:string,refs:TableRef[]=[];
  if(comment.column===undefined)path=`${extension}/tables/${tableIndex}/comments`;
  else {let columnIndex=-1;for(let index=0;index<commentTable.columns.length;index++){accounting?.visit('inventory-projection-comment-column-search',`${extension}/tables/${tableIndex}/columns`);if(commentTable.columns[index]!.name===comment.column){columnIndex=index;break;}}if(columnIndex<0)throw new Error('G10_COMMENT_COLUMN_UNBOUND');path=`${extension}/tables/${tableIndex}/columns/${columnIndex}`;refs=[commentTable.columns[columnIndex]!.field];}
  const commentId=push(out.catalog.comments,'comment',comment.table,subject,{expectation:clone(comment),fieldRefs:refs},path);for(const field of refs){const to=columnIdentity.get(`${comment.table}\0${refKey(field)}`);if(!to)throw new Error('G10_COMMENT_FIELD_UNBOUND');out.dependencies.push({from:commentId,to,reason:'comment-requires-column',sourcePath:path,state:'present'});}
 }
 accounting?.visit('inventory-projection-grant-rows','/catalog/grants',tables.length*8);out.catalog.grants=[];for(const grant of grantProjection(bundle,source,payload,moduleIndex,accounting) as any[]){accounting?.visit('inventory-projection-grant-row','/catalog/grants');const grantIdentity=identity('grant',grant.table,[grant.role,grant.privilege,grant.columns]),key=accounting?hashCanonicalCharged(grantIdentity,accounting,'/catalog/grants/identity'):ik(grantIdentity);if(accounting){canonicalCharged(grant,accounting,'/catalog/grants/meaning');accounting.scanUtf8(grant.sourcePath,'/catalog/grants/sourcePath');}sourcePaths.set(key,grant.sourcePath);out.catalog.grants.push({identity:grantIdentity,meaning:grant,state:'present'});}
 for(const [id,refs]of expressionDeps){accounting?.visit('inventory-projection-expression-owner','/catalog/expressionDependencies');const owner=sourcePaths.get(id)!;for(const binding of refs){accounting?.visit('inventory-projection-expression-field','/catalog/expressionDependencies');const target=columnIdentity.get(`${binding.table}\0${refKey(binding.field)}`);if(!target)throw new Error('G10_TYPED_FIELD_DEPENDENCY_MISSING:'+binding.table+':'+refKey(binding.field));out.dependencies.push({from:id,to:target,reason:'typed-field-reference',sourcePath:owner,state:'present'});}}
 accounting?.visit('inventory-projection-owned-by-table','/catalog',catalogRows);for(const subject of [...out.catalog.columns,...out.catalog.keys,...out.catalog.checks,...out.catalog.foreignKeys,...out.catalog.indexes,...out.catalog.policies,...out.catalog.grants,...out.catalog.comments]){
  accounting?.visit('inventory-projection-owned-by-table-row','/catalog/owned-by-table');const target=subject.identity.table===null?null:tableIdentity.get(subject.identity.table);if(target){const subjectKey=accounting?hashCanonicalCharged(subject.identity,accounting,'/catalog/owned-by-table/identity'):ik(subject.identity);out.dependencies.push({from:subjectKey,to:target,reason:'owned-by-table',sourcePath:sourcePaths.get(subjectKey)??extension,state:'present'});}
 }
 for(const grant of out.catalog.grants){accounting?.visit('inventory-projection-grant-column-owner','/catalog/grants');const meaning=grant.meaning as any;if(meaning.table===null)continue;if(Array.isArray(meaning.columns)){const table=first(tables,(t:any)=>t.id===meaning.table,'inventory-projection-grant-table-lookup','/modules/tables');if(!table)throw new Error('G10_GRANT_TABLE_MISSING');for(const columnName of meaning.columns){accounting?.visit('inventory-projection-grant-column-lookup','/catalog/grants/columns');const column=first(table.columns,(c:any)=>c.name===columnName,'inventory-projection-grant-column-name-search','/catalog/grants/columns');if(!column)throw new Error('G10_GRANT_COLUMN_MISSING');const to=columnIdentity.get(`${table.id}\0${refKey(column.field)}`);if(!to)throw new Error('G10_GRANT_FIELD_MISSING');out.dependencies.push({from:accounting?hashCanonicalCharged(grant.identity,accounting,'/catalog/grants/identity'):ik(grant.identity),to,reason:'grant-requires-column',sourcePath:meaning.sourcePath,state:'present'});}}}
 for(let tableIndex=0;tableIndex<tables.length;tableIndex++){const table=tables[tableIndex]!;accounting?.visit('inventory-projection-key-table','/catalog/keys');const record=findElement(source,table.record,`${extension}/tables/${tableIndex}/record`,accounting).value;for(const key of record.keys??[]){accounting?.visit('inventory-projection-key-owner','/catalog/keys');const from=keyIdentity.get(`${table.id}\0${key.id}`)!;for(const field of key.fields){accounting?.visit('inventory-projection-key-field','/catalog/keys/fields');const to=columnIdentity.get(`${table.id}\0${refKey(field)}`);if(!to)throw new Error('G10_KEY_FIELD_UNBOUND');out.dependencies.push({from,to,reason:'key-requires-column',sourcePath:`${extension}/tables/${tableIndex}/record`,state:'present'});}}}
 for(const [i,raw]of payload.commands.entries()){accounting?.visit('inventory-projection-command','/modules/commands');const operation=requireObject(raw,`${extension}/commands/${i}`) as unknown as TableOperation,commandId=operation.id,sourcePath=`${extension}/commands/${i}`;if(typeof commandId!=='string'||commandId.length===0)throw new Error('G10_OPERATION_ID_INVALID');const refs=operationReferences(operation,tables,source),meaning={operation:clone(raw),logicalParameterDomains:clone(refs.logicalParameters)},from=push(out.operations,'operation',null,commandId,meaning,sourcePath);for(const tableId of refs.tables){accounting?.visit('inventory-projection-operation-table-ref',sourcePath);const to=tableIdentity.get(tableId);if(!to)throw new Error('G10_OPERATION_TABLE_UNBOUND:'+tableId);out.dependencies.push({from,to,reason:'operation-requires-table',sourcePath,state:'present'});}for(const binding of refs.fields){accounting?.visit('inventory-projection-operation-field-ref',sourcePath);const to=columnIdentity.get(`${binding.table}\0${refKey(binding.field)}`);if(!to)throw new Error('G10_OPERATION_FIELD_UNBOUND:'+binding.table+':'+refKey(binding.field));out.dependencies.push({from,to,reason:'operation-requires-field',sourcePath,state:'present'});}for(const keyUse of refs.keys){accounting?.visit('inventory-projection-operation-key-ref',sourcePath);const to=keyIdentity.get(`${keyUse.table}\0${keyUse.key}`);if(!to)throw new Error('G10_OPERATION_KEY_UNBOUND:'+keyUse.table+':'+keyUse.key);out.dependencies.push({from,to,reason:keyUse.purpose==='cursor'?'operation-requires-cursor-key':'operation-requires-conflict-key',sourcePath,state:'present'});}}
 for(const [i,seed]of payload.seedSets.entries()){accounting?.visit('inventory-projection-seed-set','/modules/seedSets');const seedId=push(out.operations,'seed-set',null,seed.id,seed,`${extension}/seedSets/${i}`);out.seedStates.push({id:seed.id,definitionDigest:accounting?hashCanonicalCharged(seed,accounting,`/modules/seedSets/${i}`):hashCanonical(seed),sourcePath:`${extension}/seedSets/${i}`,state:'not-run'});for(const row of seed.rows??[]){accounting?.visit('inventory-projection-seed-row',`/modules/seedSets/${i}/rows`);if(!tableIdentity.has(row.table))throw new Error('G10_SEED_TABLE_UNBOUND');out.dependencies.push({from:seedId,to:tableIdentity.get(row.table)!,reason:'seed-set-requires-table',sourcePath:`${extension}/seedSets/${i}`,state:'present'});}}
 const result={catalog:out.catalog,dependencies:out.dependencies,operations:out.operations,rendererOperations:out.rendererOperations,seedStates:out.seedStates,sourcePaths};
 if(accounting){accounting.visit('inventory-catalog-result-carriers','/projection/catalog',catalogRows+out.dependencies.length+out.operations.length);canonicalCharged({catalog:result.catalog,dependencies:result.dependencies,operations:result.operations,rendererOperations:result.rendererOperations,seedStates:result.seedStates},accounting,'/projection/catalog');}
 return result;
}
function projectOne(verified:TableDeploymentBundle,side:Side,tableId:string,parts:ReturnType<typeof sourcePayload>,projection:CatalogProjection,pathValues:Map<string,Json>,sourceOrder:Map<string,number>,accounting?:AccountingContext):{review:InventoryProjection;table:InventoryTable;projection:CatalogProjection} {
 const {source,module,payload,moduleIndex,extensionPath}=parts,i=payload.tables.findIndex((t:any)=>t.id===tableId);if(i<0)throw new Error('G10_TABLE_MISSING:'+tableId);
 const declaration=payload.tables[i] as TableDeclaration,record=findElement(source,declaration.record,extensionPath+'/tables/'+i+'/record');accounting?.visit('inventory-projection-table-closure-root',`/projection/${tableId}`);
 const start=ik(identity('table',tableId,declaration.record)),included=new Set([start]);let changed=true;
 // Dependency closure follows typed compiler-derived edges in both directions:
 // inbound FKs/policies/operations/seeds and outbound key/field requirements all remain visible.
 while(changed){changed=false;for(const edge of projection.dependencies){accounting?.visit('inventory-projection-dependency-closure',`/projection/${tableId}/dependencies`);if(included.has(edge.from)&&!included.has(edge.to)){included.add(edge.to);changed=true;}if(included.has(edge.to)&&!included.has(edge.from)){included.add(edge.from);changed=true;}}}
 const filter=(items:Subject[])=>{const selected:Subject[]=[];for(const item of items){accounting?.visit('inventory-projection-catalog-closure-filter',`/projection/${tableId}/catalog`);if(included.has(accounting?hashCanonicalCharged(item.identity,accounting,`/projection/${tableId}/catalog/identity`):ik(item.identity))||item.identity.kind==='grant'&&item.identity.table===null)selected.push(item);}return selected;};
 const meaningCatalog:PrefixCatalog={tables:filter(projection.catalog.tables),columns:filter(projection.catalog.columns),keys:filter(projection.catalog.keys),checks:filter(projection.catalog.checks),foreignKeys:filter(projection.catalog.foreignKeys),indexes:filter(projection.catalog.indexes),policies:filter(projection.catalog.policies),grants:filter(projection.catalog.grants),comments:filter(projection.catalog.comments)};
 const selectedEdges:Edge[]=[];for(const edge of projection.dependencies){accounting?.visit('inventory-projection-dependency-select',`/projection/${tableId}/dependencies`);if(included.has(edge.from)&&included.has(edge.to))selectedEdges.push(edge);}
 const selectedPaths=new Set<string>([`${extensionPath}/tables/${i}`,record.path]);
 // Preserve admitted, unclassified module extensions and the selected table vocabulary declaration.
 // They stay opaque: changing one remains visible in this table's review meaning.
 if(pathValues.has('/vocabularies/umf.tables'))selectedPaths.add('/vocabularies/umf.tables');
 for(const extensionName of Object.keys(module.extensions??{})){accounting?.visit('inventory-projection-extension-preservation',`/modules/${moduleIndex}/extensions`);accounting?.scanUtf8(extensionName,`/modules/${moduleIndex}/extensions`);if(extensionName!=='umf.tables'){selectedPaths.add(`${pathFor(moduleIndex,'extensions',extensionName)}`);if(pathValues.has(`/vocabularies/${ptr(extensionName)}`))selectedPaths.add(`/vocabularies/${ptr(extensionName)}`);}}
 for(let columnIndex=0;columnIndex<declaration.columns.length;columnIndex++){accounting?.visit('inventory-projection-column-source-path',`${extensionPath}/tables/${i}/columns/${columnIndex}`);selectedPaths.add(findElement(source,declaration.columns[columnIndex]!.field,`${extensionPath}/tables/${i}/columns`).path);}
 for(const key of included){accounting?.visit('inventory-projection-subject-source-path',`/projection/${tableId}/sourcePaths`);accounting?.scanUtf8(key,`/projection/${tableId}/sourcePaths`);const sourcePath=projection.sourcePaths.get(key);if(sourcePath)selectedPaths.add(sourcePath);}
 for(const subject of projection.operations){accounting?.visit('inventory-projection-operation-closure',`/projection/${tableId}/operations`);
  if(!included.has(ik(subject.identity)))continue;
  if(subject.identity.kind==='seed-set')continue;
  if(subject.identity.kind!=='operation')throw new Error('G10_OPERATION_SUBJECT_KIND_UNSUPPORTED:'+subject.identity.kind);
  if(!subject.meaning||typeof subject.meaning!=='object'||Array.isArray(subject.meaning))throw new Error('G10_OPERATION_PARAMETER_DOMAIN_SHAPE');
  const domains=(subject.meaning as any).logicalParameterDomains;if(!Array.isArray(domains))throw new Error('G10_OPERATION_PARAMETER_DOMAIN_SHAPE');
  for(const domain of domains){accounting?.visit('inventory-projection-domain-closure',`/projection/${tableId}/operations`);if(!domain||typeof domain.definitionPath!=='string'||!domain.definition||typeof domain.definition!=='object'||Array.isArray(domain.definition))throw new Error('G10_OPERATION_PARAMETER_DOMAIN_SHAPE');accounting?.scanUtf8(domain.definitionPath,`/projection/${tableId}/operations/domain`);selectedPaths.add(domain.definitionPath);}
 }
 for(const edge of selectedEdges)selectedPaths.add(edge.sourcePath);
 const closurePaths=[...selectedPaths].filter(path=>pathValues.has(path)).sort((a,b)=>sourceOrder.get(a)!-sourceOrder.get(b)!);
 const sourceClosure=closurePaths.map(path=>{accounting?.visit('inventory-projection-source-closure',path);return {path:path||'/',value:accounting?projectionCopy(pathValues.get(path)!,accounting,`${path}/@closure`) as Json:clone(pathValues.get(path)!) as Json};});
 const selectedOperationIds=new Set<string>();for(const item of projection.operations){accounting?.visit('inventory-projection-selected-operation',`/projection/${tableId}/operations`);if(item.identity.kind==='operation'&&included.has(accounting?hashCanonicalCharged(item.identity,accounting,`/projection/${tableId}/operation/identity`):ik(item.identity)))selectedOperationIds.add(item.identity.subject as string);}
 const seedDefinitions:{id:string;definitionDigest:string;sourcePath:string;definition:Json}[]=[];for(let j=0;j<payload.seedSets.length;j++){const seed=payload.seedSets[j]! as any;accounting?.visit('inventory-projection-selected-seed',`${extensionPath}/seedSets/${j}`);const seedIdentity=identity('seed-set',null,seed.id),key=accounting?hashCanonicalCharged(seedIdentity,accounting,`${extensionPath}/seedSets/${j}/identity`):ik(seedIdentity);if(included.has(key)){const definition=accounting?projectionCopy(seed,accounting,`${extensionPath}/seedSets/${j}/definition`):clone(seed) as Json;seedDefinitions.push({id:seed.id,definitionDigest:accounting?hashCanonicalCharged(seed,accounting,`${extensionPath}/seedSets/${j}/digest`):hashCanonical(seed),sourcePath:`${extensionPath}/seedSets/${j}`,definition});}}
 if(accounting){hashCanonicalCharged(declaration,accounting,`/projection/${tableId}/physicalTable`);hashCanonicalCharged(record.value,accounting,`/projection/${tableId}/recordDefinition`);}
 const fieldDefinitions: {path:string;value:Json}[]=[];for(let fieldIndex=0;fieldIndex<declaration.columns.length;fieldIndex++){accounting?.visit('inventory-projection-field-definition',`${extensionPath}/tables/${i}/columns/${fieldIndex}`);const field=findElement(source,declaration.columns[fieldIndex]!.field,`${extensionPath}/tables/${i}/columns/${fieldIndex}/field`,accounting);if(accounting)hashCanonicalCharged(field.value,accounting,`${field.path}/definition`);fieldDefinitions.push({path:field.path,value:clone(field.value) as Json});}
 const meaning={physicalTable:{path:`${extensionPath}/tables/${i}`,value:clone(declaration)},recordDefinition:{path:record.path,value:clone(record.value)},fieldDefinitions,sourceClosure,catalog:meaningCatalog,dependencies:selectedEdges,operationIds:[...selectedOperationIds],seedDefinitions};
 const review:InventoryProjection={profile:'umf.table-inventory-review/0.1',side,source:{format:'json',sha256:verified.sourceDigest},configuration:toJson(verified.configuration,'/configuration',accounting),table:tableId,record:accounting?projectionCopy(declaration.record,accounting,`/projection/${tableId}/record`) as unknown as TableRef:clone(declaration.record),meaning:accounting?toJson(meaning,'/meaning',accounting):toJson(meaning,'/meaning'),intent:null,effects:[]};
 const meaningDigest=accounting?hashCanonicalCharged(meaning as unknown as Json,accounting,`/projection/${tableId}/meaning`):hashCanonical(meaning);
 return {review,table:{table:tableId,record:clone(declaration.record),schema:verified.configuration.schema,name:declaration.name,meaningDigest},projection};
}
export function projectG10Bundle(input:unknown,side:Side):{bundle:TableDeploymentBundle;tables:InventoryTable[];reviews:InventoryProjection[];projection:CatalogProjection} {
 const bundle=verifyTableDeployment(input),parts=sourcePayload(bundle),{payload}=parts;
 const operations=rendererOperations(bundle,parts.source,payload,parts.moduleIndex),projection=catalogProjection(bundle,parts.source,payload,parts.moduleIndex,operations),pathValues=sourcePathIndex(parts.source as Json),sourceOrder=new Map([...pathValues.keys()].map((path,index)=>[path,index])),rows=(payload.tables as TableDeclaration[]).map(t=>projectOne(bundle,side,t.id,parts,projection,pathValues,sourceOrder));return {bundle,tables:rows.map(x=>x.table),reviews:rows.map(x=>x.review),projection};
}
/** R2 projection entry: verifier, projection copies, path output and meaning hashes share one request meter. */
export function projectG10BundleWithAccounting(input:unknown,side:Side,accounting:AccountingContext):{bundle:TableDeploymentBundle;document:import('../model/types').Document;tables:InventoryTable[];reviews:InventoryProjection[];projection:CatalogProjection;sourceIndex:OwnedSourceFieldIndex}{
 const verified=verifyTableDeploymentWithAccounting(input as TableDeploymentBundle,accounting),bundle=verified.bundle,parts=sourcePayload(bundle,verified.document,accounting),{payload}=parts;
 const sourceIndex=buildOwnedSourceFieldIndex(bundle,parts.source,accounting);
 accounting.visit('inventory-projection-path-index','/source');const pathValues=new Map<string,Json>();const walk=(value:Json,path:string):void=>{accounting.visit('inventory-projection-path-index-node',path);pathValues.set(path,value);if(Array.isArray(value)){for(let i=0;i<value.length;i++){accounting.visit('inventory-projection-path-index-array-slot',`${path}/${i}`);walk(value[i]!,`${path}/${i}`);}return;}if(value&&typeof value==='object'){for(const key of Object.keys(value)){accounting.scanUtf8(key,path);walk(value[key]!,`${path}/${ptr(key)}`);}}};walk(parts.source as Json,'');
 const sourceOrder=new Map<string,number>();let ordinal=0;for(const path of pathValues.keys()){accounting.visit('inventory-projection-path-order-index',path);sourceOrder.set(path,ordinal++);}
 accounting.visit('inventory-projection-renderer-reuse','/renderer/operations',verified.operations.length);const operations=verified.operations;
 // Charge all source-derived table/step/catalog work before entering the compatibility projection loops.
 const declaredTables=payload.tables as TableDeclaration[],declaredOperations=bundle.steps.length,expectedRows=Object.values(bundle.expectedCatalog).reduce((n,value)=>n+(Array.isArray(value)?value.length:0),0);
 accounting.visit('inventory-projection-table-pass','/modules',declaredTables.length);accounting.visit('inventory-projection-operation-pass','/operations',declaredOperations);accounting.visit('inventory-projection-catalog-pass','/expectedCatalog',expectedRows);
 const renderedOperations=rendererOperations(bundle,parts.source,payload,parts.moduleIndex,operations,accounting),projection=catalogProjection(bundle,parts.source,payload,parts.moduleIndex,renderedOperations,accounting),rows:ReturnType<typeof projectOne>[]=[];
 for(const table of declaredTables){accounting.visit('inventory-projection-table-review',`${parts.extensionPath}/tables`);rows.push(projectOne(bundle,side,table.id,parts,projection,pathValues,sourceOrder,accounting));}
 const tables:InventoryTable[]=[],reviews:InventoryProjection[]=[];for(const row of rows){accounting.visit('inventory-projection-table-result','/projection');tables.push(row.table);reviews.push(row.review);}
 accounting.visit('inventory-projection-result-hash','/projection');canonicalCharged({tables,reviews},accounting,'/projection/result');return {bundle,document:verified.document,tables,reviews,projection,sourceIndex};
}
