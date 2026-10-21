// SPDX-License-Identifier: MIT OR Apache-2.0
import {migrationOptions,refKey,type TableMigrationOptions,type MigrationReview} from './options';
export type {TableMigrationOptions} from './options';
import {copyJson} from '../model/json';
import {readDocument} from '../model/document';
import {UmfError,type Diagnostic} from '../model/types';
import {canonical,hashCanonical} from '../compilation/bundle/hash';
import {nativeType,literalSql} from '../table-deployment/sql';
import {verifyTableDeployment,type TableDeploymentBundle,type TableDeploymentStep} from '../table-deployment';
import {discoverTableMigrationChanges} from './reviewed';
import {phaseTableMigrationSteps,type TableMigrationPhase} from './phases';
import type {TableMigrationExecutionProfile} from './phases-options';
export {discoverTableMigrationChanges,reviewedValueDigest} from './reviewed';
export type {ReviewedChangeCandidate,ReviewedChangeKind,ReviewedChangeMarker} from './reviewed';

export interface TableMigrationRequest {
 id:string;predecessor:{id:string;digest:string}|null;
 previous:TableDeploymentBundle|null;next:TableDeploymentBundle;options?:TableMigrationOptions;
}
export interface TableMigrationStep extends Omit<TableDeploymentStep,'transaction'|'kind'> {
 kind:TableDeploymentStep['kind']|'backfill'|'seed';transaction:'required'|'forbidden';operation?:string;constraintKind?:'check'|'foreignKey';seedSets?:string[];
 preconditions:{phase:'before-plan';kind:'empty-private-schema'|'installed-source-cohort';bundleDigest:string|null};
 expectedOutcome:{phase:'before-commit';kind:'complete-next-source-catalog';bundleDigest:string};
 verification:'native-catalog-privileges-and-role-scope';recovery:'rollback-transaction'|'inspect-index';
}
export interface TableMigrationPlan extends TableMigrationRequest {
 version:'umf.table-migration/0.1'|'umf.table-migration/0.2';canonicalization:'RFC8785';
 fromBundleDigest:string|null;toBundleDigest:string;
 steps:TableMigrationStep[];
 phases?:TableMigrationPhase[];executionProfile?:TableMigrationExecutionProfile;
 seedExecution:'none'|{version:'umf.table-seed-execution/0.1';sets:string[]};
 requiresApproval:true;nativeQualified:false;digest:string;review?:MigrationReview[];
}
export type TableMigrationResult={status:'compiled';plan:TableMigrationPlan;diagnostics:[]}|{status:'blocked';diagnostics:Diagnostic[]};
const fail=(message:string,path=''):never=>{throw new UmfError('TABLE_MIGRATION_UNSUPPORTED',message,path);};
const same=(a:unknown,b:unknown):boolean=>canonical(a)===canonical(b);
function without(value:object,keys:string[]):Record<string,unknown>{
 return Object.fromEntries(Object.entries(value).filter(([key])=>!keys.includes(key)));
}
function commandOnly(previous:TableDeploymentBundle,next:TableDeploymentBundle):boolean{
 const documents=[previous,next].map(bundle=>readDocument(bundle.source.utf8,bundle.source.format));
 for(const document of documents){
  const module=document.modules.find(m=>m.id===previous.module)!;
  const payload=module.extensions!['umf.tables'] as {commands:unknown[];seedSets:unknown[]};payload.commands=[];payload.seedSets=[];
 }
 return same(documents[0],documents[1]);
}
function identity(value:unknown,path:string):asserts value is string{
 if(typeof value!=='string'||!value.length||value.includes('\0')||new TextEncoder().encode(value).length>256)fail('Expected a nonempty migration identity of at most256 UTF-8 bytes',path);
}
type PolicyAudience='person'|'batch';
type PolicyCommand='select'|'insert'|'update'|'delete';
type GrantChange={previous:TableDeploymentBundle['steps'];next:TableDeploymentBundle['steps']};
type ColumnPair={old:TableDeploymentBundle['expectedCatalog']['columns'][number];fresh:TableDeploymentBundle['expectedCatalog']['columns'][number]};
type IndexEvolution={drops:TableDeploymentBundle['expectedCatalog']['indexes'];replacements:Set<string>};
type MigrationChanges={policyChanges:Set<string>;columnChanges:Map<number,TableDeploymentBundle['expectedCatalog']['columns']>;droppedColumns:Map<number,TableDeploymentBundle['expectedCatalog']['columns']>;renamedColumns:Map<number,ColumnPair[]>;notNullColumns:Map<number,TableDeploymentBundle['expectedCatalog']['columns']>;typeChanges:Map<number,ColumnPair[]>;indexChanges:Map<number,IndexEvolution>;checkChanges:Map<number,TableDeploymentBundle['expectedCatalog']['checks']>;droppedChecks:Map<number,TableDeploymentBundle['expectedCatalog']['checks']>;checkPaths:Map<number,Map<string,string>>;grantChanges:Map<string,GrantChange>};
function reviewedMatch(markers:NonNullable<TableMigrationOptions['reviewedChanges']>,previous:TableDeploymentBundle,next:TableDeploymentBundle,kind:string,path:string,conversion?:string):boolean{
 const marker=markers.find(item=>item.path===path&&(item as any).kind===kind&&(conversion===undefined||(item as any).conversion===conversion));
 if(!marker)return false;
 const candidate=discoverTableMigrationChanges(previous,next).find(item=>item.kind===kind&&item.path===path);
 return !!candidate&&marker.oldDigest===candidate.oldDigest&&marker.newDigest===candidate.newDigest;
}
const quoteIdentifier=(value:string):string=>'"'+value.replaceAll('"','""')+'"';
function safeWidening(oldType:unknown,newType:unknown):boolean{
 const a=oldType as any,b=newType as any;if(!a||!b||typeof a.kind!=='string'||typeof b.kind!=='string')return false;
 if(a.kind==='int2'&&b.kind==='int4'||a.kind==='int4'&&b.kind==='int8')return true;
 if(a.kind==='numeric'&&b.kind==='numeric')return b.precision>=a.precision&&b.scale>=a.scale&&b.precision-b.scale>=a.precision-a.scale;
 return false;
}
function policyPath(moduleIndex:number,tableIndex:number,audience:PolicyAudience,command:PolicyCommand):string{
 return '/modules/'+moduleIndex+'/extensions/umf.tables/tables/'+tableIndex+'/policy/'+audience+'/'+command;
}
function alterPolicySql(step:TableDeploymentBundle['steps'][number],table:TableDeploymentBundle['expectedCatalog']['tables'][number],configuration:TableDeploymentBundle['configuration'],audience:PolicyAudience,command:PolicyCommand):string{
 const name='umf_'+audience+'_'+command,role=audience==='person'?configuration.personRole:configuration.batchRole;
 const relation=quoteIdentifier(configuration.schema)+'.'+quoteIdentifier(table.name);
 const prefix='CREATE POLICY '+quoteIdentifier(name)+' ON '+relation+' AS PERMISSIVE FOR '+command.toUpperCase()+' TO '+quoteIdentifier(role);
 if(!step.sql.startsWith(prefix))fail('The policy compiler emitted an unexpected ALTER-compatible shape',step.sourcePath);
 const clauses=step.sql.slice(prefix.length);
 if(!clauses)fail('The policy compiler emitted no predicate clauses',step.sourcePath);
 return 'ALTER POLICY '+quoteIdentifier(name)+' ON '+relation+clauses;
}
function revokeGrantSql(step:TableDeploymentBundle['steps'][number],table:TableDeploymentBundle['expectedCatalog']['tables'][number],configuration:TableDeploymentBundle['configuration'],audience:PolicyAudience):string{
 const role=audience==='person'?configuration.personRole:configuration.batchRole;
 const relation=quoteIdentifier(configuration.schema)+'.'+quoteIdentifier(table.name);
 const suffix=' ON TABLE '+relation+' TO '+quoteIdentifier(role);
 if(!step.sql.startsWith('GRANT ')||!step.sql.endsWith(suffix))fail('The grant compiler emitted an unexpected revoke-compatible shape',step.sourcePath);
 const privilege=step.sql.slice('GRANT '.length,-suffix.length);
 if(!privilege)fail('The grant compiler emitted an empty privilege',step.sourcePath);
 return 'REVOKE '+privilege+' ON TABLE '+relation+' FROM '+quoteIdentifier(role);
}
function groupBy<T>(values:readonly T[],key:(value:T)=>string):Map<string,T[]>{
 const result=new Map<string,T[]>();for(const value of values){const id=key(value),group=result.get(id);if(group)group.push(value);else result.set(id,[value]);}return result;
}
function appendOnly(previous:TableDeploymentBundle,next:TableDeploymentBundle,options?:TableMigrationOptions,allowLegacyUnreviewedPolicy=false):MigrationChanges{
 if(!same(previous.configuration,next.configuration))fail('Changing module, namespace or trusted role configuration requires a separately qualified migration','/next/configuration');
 const a=readDocument(previous.source.utf8,previous.source.format),b=readDocument(next.source.utf8,next.source.format);
 if(!same({...a,modules:[]},{...b,modules:[]}))fail('Root metadata/vocabulary changes require a separately qualified migration','/next/source');
 if(a.modules.length!==b.modules.length)fail('Module inventory changes are outside the append-table migration subset','/next/source');
 const moduleIndex=a.modules.findIndex(module=>module.id===previous.module);
 if(moduleIndex<0)fail('The selected source module is missing','/previous/module');
 const appendedFields=new Set<string>();
 const reviewed=options?.reviewedChanges??[];
 for(let i=0;i<a.modules.length;i++){
  const old=a.modules[i]!,fresh=b.modules[i]!;
  if(old.id!==previous.module){if(!same(old,fresh))fail('Unselected module changes require separate qualification','/next/source');continue;}
  if(!same({...old,elements:[],relationships:[],extensions:without(old.extensions??{},['umf.tables'])},{...fresh,elements:[],relationships:[],extensions:without(fresh.extensions??{},['umf.tables'])}))fail('Selected module metadata changes require separate qualification','/next/source');
  if(fresh.elements.length<old.elements.length||!same(old.relationships??[],(fresh.relationships??[]).slice(0,(old.relationships??[]).length)))fail('Existing relationships must remain exact; only append is qualified','/next/source');
  const newFieldIds=new Set(fresh.elements.slice(old.elements.length).filter(element=>element.kind==='field').map(element=>element.id));
  for(let j=0;j<old.elements.length;j++){
   const before=old.elements[j]!,after=fresh.elements[j]!;
   if(same(before,after))continue;
   if(before.kind==='field'&&after.kind==='field'&&before.id===after.id&&before.nullability==='absent-allowed'&&after.nullability==='required'&&same(without(before,['nullability']),without(after,['nullability']))){
    const column=previous.expectedCatalog.columns.find(c=>c.field.module===old.id&&c.field.element===before.id);
    if(!column||!options?.reviewedChanges||!reviewedMatch(options.reviewedChanges,previous,next,'tighten-not-null',column.sourcePath))throw new UmfError('destructive_change_unreviewed','Unreviewed NOT NULL tightening for column '+(column?.table??'unknown')+'.'+(column?.name??before.id),'/next/source/modules/'+i+'/elements/'+j);
    continue;
   }
   if(before.kind==='field'&&after.kind==='field'&&before.id===after.id&&same(without(before,['facets']),without(after,['facets']))&&canonical(before.facets??null)!==canonical(after.facets??null)){
    const column=previous.expectedCatalog.columns.find(c=>c.field.module===old.id&&c.field.element===before.id);
    if(!column||!options?.reviewedChanges||!reviewedMatch(options.reviewedChanges,previous,next,'change-column-type',column.sourcePath,'pg-cast-v1'))throw new UmfError('destructive_change_unreviewed','Unreviewed type or capacity change for column '+(column?.table??'unknown')+'.'+(column?.name??before.id),'/next/source/modules/'+i+'/elements/'+j);
    continue;
   }
   const previousMembers=before.kind==='record'?before.members??[]:[],nextMembers=after.kind==='record'?after.members??[]:[];
   if(same(without(before,['description']),without(after,['description'])))continue;
   const removed=previousMembers.filter(member=>!nextMembers.some(freshMember=>refKey(freshMember)===refKey(member)));
   if(before.kind!=='record'||after.kind!=='record'||!same(without({...before,members:[]},['description']),without({...after,members:[]},['description']))||!same(previousMembers.filter(member=>!removed.some(x=>refKey(x)===refKey(member))),nextMembers.slice(0,Math.max(0,nextMembers.length-(fresh.elements.length-old.elements.length)))))fail('Existing logical elements must remain exact except explicitly reviewed column removal','/next/source/modules/'+i+'/elements/'+j);
   for(const member of removed){const column=previous.expectedCatalog.columns.find(c=>refKey(c.field)===refKey(member));if(!column||!reviewed.some(change=>change.kind==='drop-column'&&change.path===column.sourcePath))throw new UmfError('destructive_change_unreviewed','Unreviewed removal of existing column '+(column?.name??member.element)+' from table '+(previous.expectedCatalog.tables.find(t=>t.columns.some(c=>refKey(c.field)===refKey(member)))?.name??'unknown'),'/next/source/modules/'+i+'/elements/'+j+'/members');}
   for(const member of nextMembers.slice(previousMembers.length)){
    if(member.module!==old.id||!newFieldIds.has(member.element))fail('An existing Record may only append newly declared Fields','/next/source/modules/'+i+'/elements/'+j+'/members');
    const key=refKey(member);if(appendedFields.has(key))fail('An appended Field may belong to only one existing Record','/next/source/modules/'+i+'/elements/'+j+'/members');appendedFields.add(key);
   }
  }
 }
 const oldTables=previous.expectedCatalog.tables,nextTables=next.expectedCatalog.tables;
 if(nextTables.length<oldTables.length)fail('Removing native tables requires separate qualification','/next/expectedCatalog/tables');
 const previousColumns=groupBy(previous.expectedCatalog.columns,item=>item.table),nextColumns=groupBy(next.expectedCatalog.columns,item=>item.table);
 const previousIndexes=groupBy(previous.expectedCatalog.indexes,item=>item.table),nextIndexes=groupBy(next.expectedCatalog.indexes,item=>item.table);
 const previousChecks=groupBy(previous.expectedCatalog.checks,item=>item.table),nextChecks=groupBy(next.expectedCatalog.checks,item=>item.table);
 const previousKeys=groupBy(previous.expectedCatalog.keys,item=>item.table),nextKeys=groupBy(next.expectedCatalog.keys,item=>item.table);
 const previousForeignKeys=groupBy(previous.expectedCatalog.foreignKeys,item=>item.table),nextForeignKeys=groupBy(next.expectedCatalog.foreignKeys,item=>item.table);
 const previousPolicyGrants=groupBy(previous.steps.filter(step=>step.kind==='grant'&&step.sourcePath.includes('/policy/')),step=>step.sourcePath);
 const nextPolicyGrants=groupBy(next.steps.filter(step=>step.kind==='grant'&&step.sourcePath.includes('/policy/')),step=>step.sourcePath);
 const policyChanges=new Set<string>(),columnChanges=new Map<number,TableDeploymentBundle['expectedCatalog']['columns']>(),droppedColumns=new Map<number,TableDeploymentBundle['expectedCatalog']['columns']>(),renamedColumns=new Map<number,ColumnPair[]>(),notNullColumns=new Map<number,TableDeploymentBundle['expectedCatalog']['columns']>(),typeChanges=new Map<number,ColumnPair[]>(),indexChanges=new Map<number,IndexEvolution>(),checkChanges=new Map<number,TableDeploymentBundle['expectedCatalog']['checks']>(),droppedChecks=new Map<number,TableDeploymentBundle['expectedCatalog']['checks']>(),checkPaths=new Map<number,Map<string,string>>(),grantChanges=new Map<string,GrantChange>();
 for(const[tableIndex,table]of oldTables.entries()){
  const target=nextTables[tableIndex]!;
  if(!same(without(table,['indexes','columns','policy','checks','foreignKeys']),without(target,['indexes','columns','policy','checks','foreignKeys'])))fail('Existing table definitions must remain exact except for reviewed object changes and appended columns','/next/expectedCatalog/tables/'+tableIndex);
  const oldTableColumns=previousColumns.get(table.id)??[],nextTableColumns=nextColumns.get(table.id)??[];
  const removed=oldTableColumns.filter(column=>!nextTableColumns.some(fresh=>refKey(fresh.field)===refKey(column.field)));
  const retained=table.columns.filter(column=>!removed.some(old=>refKey(old.field)===refKey(column.field)));
  const expectedRetained=target.columns.filter(column=>oldTableColumns.some(old=>refKey(old.field)===refKey(column.field)));
  const oldExpected=oldTableColumns.filter(column=>!removed.some(old=>refKey(old.field)===refKey(column.field))),newExpected=nextTableColumns.filter(column=>oldExpected.some(old=>refKey(old.field)===refKey(column.field)));
  const renames:ColumnPair[]=[],typeChangesForTable:ColumnPair[]=[],tightened:typeof oldExpected=[];
  for(const old of oldExpected){const fresh=newExpected.find(item=>refKey(item.field)===refKey(old.field));if(!fresh)continue;
   const tableColumn=table.columns.find(item=>refKey(item.field)===refKey(old.field))!,freshTableColumn=target.columns.find(item=>refKey(item.field)===refKey(old.field))!;
   const changedName=old.name!==fresh.name,changedNull=old.nullable&&!fresh.nullable,changedType=canonical({typeSchema:old.typeSchema,typeName:old.typeName,typeMod:old.typeMod})!==canonical({typeSchema:fresh.typeSchema,typeName:fresh.typeName,typeMod:fresh.typeMod});
   if(!old.nullable&&fresh.nullable)fail('Relaxing NOT NULL requires separately qualified data semantics',fresh.sourcePath);
   const oldPhysical=without(tableColumn,['name']),newPhysical=without(freshTableColumn,['name']);
   let expectedDefinition=old.definitionSql;
   if(changedName)expectedDefinition=expectedDefinition.replace(quoteIdentifier(old.name)+' ',quoteIdentifier(fresh.name)+' ');
   if(changedNull)expectedDefinition+=' NOT NULL';
   const unchangedCatalog=without(old,['name','nullable','definitionSql']),freshUnchanged=without(fresh,['name','nullable','definitionSql']);
   if((changedName||changedNull)&&same(oldPhysical,newPhysical)&&same(unchangedCatalog,freshUnchanged)&&fresh.definitionSql===expectedDefinition){
    if(changedName&&!reviewedMatch(reviewed,previous,next,'rename-column',fresh.sourcePath))throw new UmfError('destructive_change_unreviewed','Unreviewed rename of column '+table.name+'.'+old.name,'/next/expectedCatalog/columns');
    if(changedName)renames.push({old,fresh});
    if(changedNull&&!reviewedMatch(reviewed,previous,next,'tighten-not-null',fresh.sourcePath))throw new UmfError('destructive_change_unreviewed','Unreviewed NOT NULL tightening for column '+table.name+'.'+old.name,'/next/expectedCatalog/columns');
    if(changedNull)tightened.push(fresh);
    continue;
   }
   const oldLogicalField=a.modules.find(m=>m.id===old.field.module)?.elements.find(e=>e.id===old.field.element),newLogicalField=b.modules.find(m=>m.id===fresh.field.module)?.elements.find(e=>e.id===fresh.field.element);
   const logicalTypeOnly=tableColumn.nativeType.kind==='numeric'
    ? [oldLogicalField?.facets,newLogicalField?.facets].every((facets,index)=>{const physical=(index===0?tableColumn.nativeType:freshTableColumn.nativeType) as any;return !!facets&&Object.keys(facets).sort().join(',')==='precision,scale'&&same(facets,{precision:physical.precision,scale:physical.scale});})
    : same(oldLogicalField?.facets??null,null)&&same(newLogicalField?.facets??null,null);
   if(changedType&&!changedName&&!changedNull&&safeWidening(tableColumn.nativeType,freshTableColumn.nativeType)&&logicalTypeOnly){
    if(!reviewedMatch(reviewed,previous,next,'change-column-type',fresh.sourcePath,'pg-cast-v1'))throw new UmfError('destructive_change_unreviewed','Safe type widening for '+table.name+'.'+old.name+' requires an exact pg-cast-v1 review marker',fresh.sourcePath);
    typeChangesForTable.push({old,fresh});continue;
   }
   if(!same(without(tableColumn,['name']),without(freshTableColumn,['name']))||!same(old,fresh))fail('Existing native column type or semantics changed beyond the supported reviewed subset','/next/expectedCatalog/tables/'+tableIndex+'/columns');
  }
  const evolvedRefs=new Set([...renames.map(r=>refKey(r.old.field)),...tightened.map(c=>refKey(c.field)),...typeChangesForTable.map(c=>refKey(c.old.field))]);
  if(!same(retained.filter(x=>!evolvedRefs.has(refKey(x.field))),expectedRetained.filter(x=>!evolvedRefs.has(refKey(x.field))))||!same(oldExpected.filter(x=>!evolvedRefs.has(refKey(x.field))),newExpected.filter(x=>!evolvedRefs.has(refKey(x.field)))))fail('Existing native columns changed beyond reviewed changes','/next/expectedCatalog/tables/'+tableIndex+'/columns');
  if(renames.length)renamedColumns.set(tableIndex,renames);if(tightened.length)notNullColumns.set(tableIndex,tightened);if(typeChangesForTable.length)typeChanges.set(tableIndex,typeChangesForTable);
  if(removed.length){
   for(const column of removed){if(!reviewedMatch(reviewed,previous,next,'drop-column',column.sourcePath))unreviewedDrop(column,previous,next);assertNoColumnDependents(column,previous,next);}
   droppedColumns.set(tableIndex,removed);
  }
  const additions=target.columns.slice(table.columns.length);
  if(additions.length){
   const expectations=nextTableColumns.slice(table.columns.length);
   if(expectations.length!==additions.length)fail('Appended columns do not match the compiled native column catalog','/next/expectedCatalog/columns');
   const expectationByField=new Map(expectations.map(item=>[refKey(item.field),item]));
   const pathsByConstraint=new Map<string,string>();
   for(const column of additions){
    const key=refKey(column.field),expected=expectationByField.get(key),expectedPath=expected?.sourcePath;
    if(!appendedFields.has(key)||!expected||!expectedPath||(expected.nullable!==true&&!options?.backfills.some(b=>b.table===table.id&&refKey(b.column)===key))||expected.identity!==''||(column.default!==undefined&&!options?.backfills.some(b=>b.table===table.id&&refKey(b.column)===key))||column.generated!==undefined)fail('Appended required columns require explicit scoped backfills; defaults/identity evolution is unsupported','/next/expectedCatalog/tables/'+tableIndex+'/columns');
    appendedFields.delete(key);pathsByConstraint.set('umf_d_'+hashCanonical([target.id,column.field,'finite-domain']).slice(0,32),expectedPath+'/domain');
   }
   columnChanges.set(tableIndex,expectations);
   checkPaths.set(tableIndex,pathsByConstraint);
  }
  const before=previousIndexes.get(table.id)??[],after=nextIndexes.get(table.id)??[],indexDrops:typeof before=[],indexReplacements=new Set<string>();
  for(const[oldIndex,index]of before.entries()){
   const fresh=after.find(item=>item.id===index.id),declarationIndex=table.indexes.findIndex(item=>item.id===index.id),path='/modules/'+moduleIndex+'/extensions/umf.tables/tables/'+tableIndex+'/indexes/'+declarationIndex;
   if(!fresh){if(!reviewedMatch(reviewed,previous,next,'replace-index',path))throw new UmfError('destructive_change_unreviewed','Unreviewed removal of index '+index.name,'/next/expectedCatalog/indexes');indexDrops.push(index);continue;}
   if(!same(index,fresh)){if(!reviewedMatch(reviewed,previous,next,'replace-index',path))throw new UmfError('destructive_change_unreviewed','Unreviewed replacement of index '+index.name,'/next/expectedCatalog/indexes');indexDrops.push(index);indexReplacements.add(fresh.id);}
  }
  if(indexDrops.length||indexReplacements.size)indexChanges.set(tableIndex,{drops:indexDrops,replacements:indexReplacements});
  const oldCheckEntries=previousChecks.get(table.id)??[],newCheckEntries=nextChecks.get(table.id)??[],removedChecks:typeof oldCheckEntries=[],addedChecks:typeof newCheckEntries=[];
  for(const old of oldCheckEntries){const fresh=newCheckEntries.find(item=>item.id===old.id);if(!fresh||!same(old,fresh)){
   const checkIndex=table.checks.findIndex(item=>item.id===old.id),path='/modules/'+moduleIndex+'/extensions/umf.tables/tables/'+tableIndex+'/checks/'+checkIndex;
   if(!reviewedMatch(reviewed,previous,next,'replace-check',path))throw new UmfError('destructive_change_unreviewed','Unreviewed replacement/removal of check constraint '+old.name,path);
   removedChecks.push(old);if(fresh)addedChecks.push(fresh);
  }}
  for(const fresh of newCheckEntries)if(!oldCheckEntries.some(old=>old.id===fresh.id))addedChecks.push(fresh);
  if(removedChecks.length)droppedChecks.set(tableIndex,removedChecks);
  if(addedChecks.length){
   const allowedDomainNames=new Set(additions.map(column=>'umf_d_'+hashCanonical([table.id,column.field,'finite-domain']).slice(0,32)));
   if(!options&&addedChecks.some(entry=>!allowedDomainNames.has(entry.name)))fail('Only compiler-generated domain checks for appended columns are qualified','/next/expectedCatalog/checks');
   checkChanges.set(tableIndex,addedChecks);
  }
  if(!same(previousKeys.get(table.id)??[],nextKeys.get(table.id)??[]))fail('Existing native Keys require separately qualified primary-key evolution','/next/expectedCatalog/keys');
  if(!same(previousForeignKeys.get(table.id)??[],(nextForeignKeys.get(table.id)??[]).slice(0,(previousForeignKeys.get(table.id)??[]).length))||(!options&&!same(previousForeignKeys.get(table.id)??[],nextForeignKeys.get(table.id)??[])))fail('Existing native foreign keys must remain exact; added FKs require migration options','/next/expectedCatalog/foreignKeys');
  for(const audience of ['person','batch'] as const)for(const command of ['select','insert','update','delete'] as const){
   const path=policyPath(moduleIndex,tableIndex,audience,command);
   if(!same(table.policy[audience][command],target.policy[audience][command])){
    if(!allowLegacyUnreviewedPolicy&&!reviewedMatch(reviewed,previous,next,'change-policy',path))throw new UmfError('destructive_change_unreviewed','Unreviewed policy change for '+table.id+'.'+audience+'.'+command,path);
    policyChanges.add(path);
   }
   const oldGrants=previousPolicyGrants.get(path)??[],newGrants=nextPolicyGrants.get(path)??[];
   if(!same(oldGrants.map(step=>step.sql),newGrants.map(step=>step.sql)))grantChanges.set(path,{previous:oldGrants,next:newGrants});
  }
 }
 if(appendedFields.size)fail('Every appended Field on an existing Record needs one nullable native column mapping','/next/expectedCatalog/tables');
 return {policyChanges,columnChanges,droppedColumns,renamedColumns,notNullColumns,typeChanges,indexChanges,checkChanges,droppedChecks,checkPaths,grantChanges};
}

function unreviewedDrop(column:TableDeploymentBundle['expectedCatalog']['columns'][number],previous:TableDeploymentBundle,next:TableDeploymentBundle):never{
 throw new UmfError('destructive_change_unreviewed','Unreviewed removal of column '+column.table+'.'+column.name,'/next/expectedCatalog/columns');
}
function assertNoColumnDependents(column:TableDeploymentBundle['expectedCatalog']['columns'][number],previous:TableDeploymentBundle,next:TableDeploymentBundle):void{
 const table=previous.expectedCatalog.tables.find(t=>t.id===column.table)!;
 const quoted=quoteIdentifier(column.name),affected:string[]=[];
 for(const step of previous.steps){if(step.sourcePath.endsWith('/tables/'+previous.expectedCatalog.tables.findIndex(t=>t.id===column.table))||step.sourcePath.includes('/columns/')||step.kind==='comment'||!step.sql.includes(quoted))continue;
  const successor=next.steps.find(fresh=>fresh.sourcePath===step.sourcePath);
  if(!successor||successor.sql.includes(quoted))affected.push(step.sourcePath);
 }
 for(const index of previous.expectedCatalog.indexes.filter(x=>x.table===column.table&&x.definitionSql.includes(quoted)))affected.push('index:'+index.name);
 for(const check of previous.expectedCatalog.checks.filter(x=>x.table===column.table&&x.definitionSql.includes(quoted)))affected.push('constraint:'+check.name);
 for(const fk of previous.expectedCatalog.foreignKeys.filter(x=>x.table===column.table&&x.definitionSql.includes(quoted)))affected.push('foreign-key:'+fk.name);
 for(const key of previous.expectedCatalog.keys.filter(x=>x.table===column.table&&x.columns.includes(column.name)))affected.push('key:'+key.name);
 const localKeys=previous.expectedCatalog.keys.filter(key=>key.table===column.table&&key.columns.includes(column.name));
 for(const fk of previous.expectedCatalog.foreignKeys){if(localKeys.some(key=>key.name===fk.targetKey))affected.push('inbound-foreign-key:'+fk.name);}
 const oldDocument=readDocument(previous.source.utf8,previous.source.format),newDocument=readDocument(next.source.utf8,next.source.format);
 const module=oldDocument.modules.find(m=>m.id===previous.module),nextModule=newDocument.modules.find(m=>m.id===previous.module);
 const tables=(module?.extensions?.['umf.tables'] as any)?.tables??[],nextTables=(nextModule?.extensions?.['umf.tables'] as any)?.tables??[];
 const ref=JSON.stringify(column.field);
 const hasRef=(value:unknown):boolean=>Array.isArray(value)?value.some(hasRef):!!value&&typeof value==='object'?(canonical(value)===ref||Object.values(value).some(hasRef)):false;
 for(const[commandIndex,command]of ((module?.extensions?.['umf.tables'] as any)?.commands??[]).entries())if(hasRef(command))affected.push('command:'+(command.id??commandIndex));
 for(const[tableIndex,tableDef]of tables.entries()){
  const fresh=nextTables[tableIndex]??{};
  for(const[kind,items]of Object.entries({checks:tableDef.checks??[],foreignKeys:tableDef.foreignKeys??[],indexes:tableDef.indexes??[]}))for(const item of items as any[]){
   const replacement=(fresh[kind]??[]).find((x:any)=>x.id===item.id);
   if(hasRef(item)&&(!replacement||canonical(item)!==canonical(replacement)))affected.push(kind.slice(0,-1)+':'+item.id);
  }
 }
 if(affected.length)fail('Column '+table.name+'.'+column.name+' is referenced by dependent objects: '+[...new Set(affected)].join(', '),column.sourcePath);
}

/** Inert forward plans: initial deployment, bounded additive DDL or command revisions. */
function compileTableMigrationInternal(input:TableMigrationRequest,allowLegacyUnreviewedPolicy=false):TableMigrationResult{
 try{
  const request=copyJson(input) as unknown as TableMigrationRequest;
  if(!request||Object.keys(request).some(k=>!['id','predecessor','previous','next','options'].includes(k))||!['id','predecessor','previous','next'].every(k=>Object.hasOwn(request,k)))fail('Unknown or missing migration request member');
  identity(request.id,'/id');
  if(request.predecessor!==null){
   const predecessor=request.predecessor;
   if(!predecessor||Object.keys(predecessor).length!==2||!Object.hasOwn(predecessor,'id')||!Object.hasOwn(predecessor,'digest'))fail('Expected an exact predecessor identity/digest','/predecessor');
   identity(predecessor.id,'/predecessor/id');
   if(predecessor.id===request.id||typeof predecessor.digest!=='string'||!/^[a-f0-9]{64}$/.test(predecessor.digest))fail('Invalid predecessor identity/digest','/predecessor');
  }
  const previous=request.previous===null?null:verifyTableDeployment(request.previous),next=verifyTableDeployment(request.next);
  if((previous===null)!==(request.predecessor===null))fail('Only initial deployment has a null predecessor','/predecessor');
  const options=migrationOptions(request.options,next,previous);
  let changes:MigrationChanges={policyChanges:new Set(),columnChanges:new Map(),droppedColumns:new Map(),renamedColumns:new Map(),notNullColumns:new Map(),typeChanges:new Map(),indexChanges:new Map(),checkChanges:new Map(),droppedChecks:new Map(),checkPaths:new Map(),grantChanges:new Map()};
  if(previous){
   changes=appendOnly(previous,next,options,allowLegacyUnreviewedPolicy);
   if(previous.bundleDigest===next.bundleDigest)fail('An unchanged bundle does not create a new migration','/next');
  }
  const firstNew=previous?.expectedCatalog.tables.length??0;
  const moduleIndex=readDocument(next.source.utf8,next.source.format).modules.findIndex(m=>m.id===next.module);
  const steps:Omit<TableMigrationStep,'preconditions'|'expectedOutcome'|'verification'|'recovery'>[]=previous?[]:next.steps;
  if(previous){
   const emittedColumns=new Set<number>();
   const emittedGrantChanges=new Set<string>();
   const addRevokes=(path:string,tableIndex:number):void=>{
    const change=changes.grantChanges.get(path);if(!change||!change.previous.length)return;
    const parts=path.split('/'),audience=parts[8] as PolicyAudience,table=next.expectedCatalog.tables[tableIndex]!;
    if(!['person','batch'].includes(audience))fail('Unexpected compiler grant source path',path);
    for(const grant of change.previous)steps.push({id:'',kind:'grant',sourcePath:path,transaction:'required',sql:revokeGrantSql(grant,table,next.configuration,audience)});
   };
   for(const step of next.steps){
    const parts=step.sourcePath.split('/');
    if(parts[5]!=='tables'||!/^\d+$/.test(parts[6]??''))continue;
    const tableIndex=Number(parts[6]);
    if(tableIndex>=firstNew){steps.push(step);continue;}
    if(step.kind==='table'&&parts.length===7&&!emittedColumns.has(tableIndex)){
     emittedColumns.add(tableIndex);
     const table=next.expectedCatalog.tables[tableIndex]!;
     for(const rename of changes.renamedColumns.get(tableIndex)??[])steps.push({id:'',kind:'table',sourcePath:rename.fresh.sourcePath,transaction:'required',sql:'ALTER TABLE '+quoteIdentifier(next.configuration.schema)+'.'+quoteIdentifier(table.name)+' RENAME COLUMN '+quoteIdentifier(rename.old.name)+' TO '+quoteIdentifier(rename.fresh.name)});
     for(const column of changes.notNullColumns.get(tableIndex)??[])steps.push({id:'',kind:'table',sourcePath:column.sourcePath,transaction:'required',sql:'ALTER TABLE '+quoteIdentifier(next.configuration.schema)+'.'+quoteIdentifier(table.name)+' ALTER COLUMN '+quoteIdentifier(column.name)+' SET NOT NULL'});
     for(const change of changes.typeChanges.get(tableIndex)??[]){const targetColumn=table.columns.find(c=>refKey(c.field)===refKey(change.fresh.field))!;const type=nativeType(targetColumn.nativeType);steps.push({id:'',kind:'table',sourcePath:change.fresh.sourcePath,transaction:'required',sql:'ALTER TABLE '+quoteIdentifier(next.configuration.schema)+'.'+quoteIdentifier(table.name)+' ALTER COLUMN '+quoteIdentifier(change.fresh.name)+' TYPE '+type+' USING '+quoteIdentifier(change.old.name)+'::'+type});}
     for(const column of changes.droppedColumns.get(tableIndex)??[])steps.push({id:'',kind:'table',sourcePath:column.sourcePath,transaction:'required',sql:'ALTER TABLE '+quoteIdentifier(next.configuration.schema)+'.'+quoteIdentifier(table.name)+' DROP COLUMN '+quoteIdentifier(column.name)});
     for(const index of changes.indexChanges.get(tableIndex)?.drops??[])steps.push({id:'',kind:'index',sourcePath:'/next/expectedCatalog/indexes/'+index.id,transaction:'required',sql:'DROP INDEX '+quoteIdentifier(next.configuration.schema)+'.'+quoteIdentifier(index.name)});
     for(const check of changes.droppedChecks.get(tableIndex)??[])steps.push({id:'',kind:'table',sourcePath:'/next/expectedCatalog/checks/'+check.id,transaction:'required',sql:'ALTER TABLE '+quoteIdentifier(next.configuration.schema)+'.'+quoteIdentifier(table.name)+' DROP CONSTRAINT '+quoteIdentifier(check.name)});
     for(const column of changes.columnChanges.get(tableIndex)??[]){
      steps.push({id:'',kind:'table',sourcePath:column.sourcePath,transaction:'required',sql:'ALTER TABLE '+quoteIdentifier(next.configuration.schema)+'.'+quoteIdentifier(table.name)+' ADD COLUMN '+(quoteIdentifier(column.name)+' '+nativeType(table.columns.find(c=>refKey(c.field)===refKey(column.field))!.nativeType)+(column.collation==='C'?' COLLATE pg_catalog.\"C\"':''))});
     }
     for(const backfill of options?.backfills.filter(b=>b.table===table.id)??[]){
      steps.push({id:'',kind:'backfill',sourcePath:'/options/backfills/'+options!.backfills.indexOf(backfill),transaction:'required',sql:'',operation:backfill.operation});
      const column=next.expectedCatalog.columns.find(c=>c.table===table.id&&refKey(c.field)===refKey(backfill.column))!;
      const defaultValue=table.columns.find(c=>refKey(c.field)===refKey(column.field))!.default;
      const defaultSql=defaultValue?(defaultValue.kind==='literal'?literalSql(defaultValue.value):defaultValue.kind==='randomUuid'?'pg_catalog.gen_random_uuid()':'CURRENT_TIMESTAMP'):'';
      if(defaultSql)steps.push({id:'',kind:'table',sourcePath:column.sourcePath,transaction:'required',sql:'ALTER TABLE '+quoteIdentifier(next.configuration.schema)+'.'+quoteIdentifier(table.name)+' ALTER COLUMN '+quoteIdentifier(column.name)+' SET DEFAULT '+defaultSql});
      if(!column.nullable)steps.push({id:'',kind:'table',sourcePath:column.sourcePath,transaction:'required',sql:'ALTER TABLE '+quoteIdentifier(next.configuration.schema)+'.'+quoteIdentifier(table.name)+' ALTER COLUMN '+quoteIdentifier(column.name)+' SET NOT NULL'});
     }
     const checkPaths=changes.checkPaths.get(tableIndex);
     for(const check of changes.checkChanges.get(tableIndex)??[]){
      const path=checkPaths?.get(check.name)??'/modules/'+moduleIndex+'/extensions/umf.tables/tables/'+tableIndex+'/checks/'+next.expectedCatalog.tables[tableIndex]!.checks.findIndex(c=>c.id===check.id);
      steps.push({id:'',kind:'table',sourcePath:path,transaction:'required',sql:'ALTER TABLE '+quoteIdentifier(next.configuration.schema)+'.'+quoteIdentifier(table.name)+' ADD '+check.definitionSql});
     }
     continue;
    }
    if(step.kind==='comment'){
     if(!previous.steps.some(old=>old.kind==='comment'&&old.sourcePath===step.sourcePath&&old.sql===step.sql))steps.push(step);
     continue;
    }
    if(step.kind==='foreignKey'&&options&&Number(parts[8])>=previous.expectedCatalog.tables[tableIndex]!.foreignKeys.length){steps.push(step);continue;}
    if(step.kind==='index'&&parts[7]==='indexes'&&/^\d+$/.test(parts[8]??'')&&(Number(parts[8])>=previous.expectedCatalog.tables[tableIndex]!.indexes.length||changes.indexChanges.get(tableIndex)?.replacements.has(next.expectedCatalog.tables[tableIndex]!.indexes[Number(parts[8])]!.id))){steps.push(step);continue;}
    if(step.kind==='policy'){
     const table=next.expectedCatalog.tables[tableIndex]!,audience=parts[8] as PolicyAudience,command=parts[9] as PolicyCommand;
     if(!['person','batch'].includes(audience)||!['select','insert','update','delete'].includes(command))fail('Unexpected compiler policy source path',step.sourcePath);
     if(changes.policyChanges.has(step.sourcePath))steps.push({...step,id:'',sql:alterPolicySql(step,table,next.configuration,audience,command)});
     const change=changes.grantChanges.get(step.sourcePath);
     if(change&&change.next.length===0){addRevokes(step.sourcePath,tableIndex);emittedGrantChanges.add(step.sourcePath);}
     continue;
    }
    if(step.kind==='grant'){
     const change=changes.grantChanges.get(step.sourcePath);
     if(change){
      if(!emittedGrantChanges.has(step.sourcePath)){
       addRevokes(step.sourcePath,tableIndex);
       for(const grant of change.next)steps.push(grant);
       emittedGrantChanges.add(step.sourcePath);
      }
     }
    }
   }
  }
  if(previous)for(const comment of previous.expectedCatalog.comments??[]){
   if(next.expectedCatalog.comments?.some(fresh=>fresh.table===comment.table&&fresh.column===comment.column))continue;
   if(comment.column!==undefined&&changes.renamedColumns.get(next.expectedCatalog.tables.findIndex(table=>table.id===comment.table))?.some(rename=>rename.old.name===comment.column))continue;
   if(comment.column!==undefined&&changes.droppedColumns.has(next.expectedCatalog.tables.findIndex(table=>table.id===comment.table))&&changes.droppedColumns.get(next.expectedCatalog.tables.findIndex(table=>table.id===comment.table))!.some(column=>column.name===comment.column))continue;
   const table=next.expectedCatalog.tables.find(t=>t.id===comment.table)!;
   const target=quoteIdentifier(next.configuration.schema)+'.'+quoteIdentifier(table.name)+(comment.column===undefined?'':'.'+quoteIdentifier(comment.column));
   steps.push({id:'',kind:'comment',sourcePath:'/next/expectedCatalog/comments',transaction:'required',sql:'COMMENT ON '+(comment.column===undefined?'TABLE ':'COLUMN ')+target+' IS NULL'});
  }
 if(steps.length>8192)fail('Migration step count exceeds8192','/steps');
  const stepIds=new Set(steps.filter(step=>step.id).map(step=>step.id));let syntheticId=90000;
  for(const step of steps)if(!step.id){while(stepIds.has('step-'+String(syntheticId).padStart(5,'0')))syntheticId++;step.id='step-'+String(syntheticId++).padStart(5,'0');stepIds.add(step.id);}
  if(previous&&!steps.length&&!commandOnly(previous,next))fail('A plan without DDL may change only declared commands or source serialization','/next/source');
  const oldSeeds=previous?.seedSets??[];
  const retainedSeeds=copyJson(oldSeeds) as unknown as typeof oldSeeds;
  const removedRefs=new Set(Array.from(changes.droppedColumns.values()).flat().map(column=>refKey(column.field)));
  if(removedRefs.size)for(const set of retainedSeeds)for(const row of set.rows)row.values=row.values.filter(value=>!removedRefs.has(refKey(value.field)));
  if(!same(retainedSeeds,next.seedSets.slice(0,oldSeeds.length)))fail('Existing seed sets are immutable except removal of reviewed dropped-column seed values','/next/seedSets');
  const addedSeeds=next.seedSets.slice(oldSeeds.length);
  if(addedSeeds.length&&(next.source.format!=='json'||addedSeeds.length>128||addedSeeds.some(s=>new TextEncoder().encode(s.id).length>256)||addedSeeds.reduce((n,s)=>n+s.rows.length,0)>10000))fail('Native seeds require JSON source, at most128 new sets/10000 rows, and256-byte IDs','/next/seedSets');
  const seedExecution:TableMigrationPlan['seedExecution']=addedSeeds.length?{version:'umf.table-seed-execution/0.1',sets:addedSeeds.map(s=>s.id)}:'none';
  if(options?.concurrentIndexes.length){
   const docs=[previous!,next].map(bundle=>readDocument(bundle.source.utf8,bundle.source.format));
   for(const doc of docs){const m=doc.modules.find(m=>m.id===next.module)!;const p=m.extensions!['umf.tables'] as unknown as {tables:{indexes:unknown[]}[]};for(const t of p.tables)t.indexes=[];}
   if(options.version==='umf.table-migration-options/0.1'&&!same(docs[0],docs[1]))fail('Concurrent phases may change only index declarations','/options/concurrentIndexes');
   if(addedSeeds.length||options.backfills.length)fail('Concurrent indexes cannot share a migration with seeds or backfills','/options/concurrentIndexes');
   const selected=new Set(options.concurrentIndexes.map(selection=>{const table=next.expectedCatalog.tables.findIndex(t=>t.id===selection.table),index=next.expectedCatalog.tables[table]!.indexes.findIndex(i=>i.id===selection.index);return table+':'+index;}));
   if(options.version==='umf.table-migration-options/0.1'&&steps.some(step=>step.kind!=='index'))fail('Legacy concurrent-index plans must contain indexes only','/options/concurrentIndexes');
   for(const [i,step]of steps.entries()){
    if(step.kind!=='index')continue;
    const parts=step.sourcePath.split('/');
    if(selected.has(parts[6]+':'+parts[8]))steps[i]={...step,transaction:'forbidden',sql:step.sql.replace(/^(CREATE (?:UNIQUE )?INDEX) /,'$1 CONCURRENTLY ')};
    else if(options.version==='umf.table-migration-options/0.1')fail('Every index in this legacy phase must be explicitly selected as concurrent','/options/concurrentIndexes');
   }
  }
  const review:MigrationReview[]=options?[...options.backfills.map((_,i)=>({code:'SCOPED_BACKFILL' as const,path:'/options/backfills/'+i,message:'Administrative UPDATE may touch protected rows; exact source and effect bound require approval'})),...Array.from(changes.policyChanges,path=>({code:'POLICY_CHANGE_REVIEW' as const,path,message:'Changed row predicate may widen access; review old and new command policy'})),...Array.from(changes.droppedColumns.values()).flat().map(column=>({code:'IRREVERSIBLE_COLUMN_PURGE' as const,path:column.sourcePath,message:'Irreversible purge of stored values for Field '+column.field.module+'.'+column.field.element+' at table '+column.table+'.'+column.name+'. Metadata history is not a data backup; this profile performs immediate physical deletion.'}))]:[];
  let migrationSteps:TableMigrationStep[]=steps.map(step=>({...step,
   preconditions:{phase:'before-plan',kind:previous?'installed-source-cohort':'empty-private-schema',bundleDigest:previous?.bundleDigest??null},
   expectedOutcome:{phase:'before-commit',kind:'complete-next-source-catalog',bundleDigest:next.bundleDigest},
   verification:'native-catalog-privileges-and-role-scope',recovery:step.transaction==='forbidden'?'inspect-index':'rollback-transaction'}));
  const migrationVersion=options?.version==='umf.table-migration-options/0.2'?'umf.table-migration/0.2' as const:'umf.table-migration/0.1' as const;
  const phased=migrationVersion==='umf.table-migration/0.2'?phaseTableMigrationSteps(migrationSteps,previous,next,options,seedExecution):undefined;
  if(phased)migrationSteps=phased.steps;
  const body={version:migrationVersion,canonicalization:'RFC8785' as const,id:request.id,predecessor:request.predecessor,previous,next,fromBundleDigest:previous?.bundleDigest??null,toBundleDigest:next.bundleDigest,steps:migrationSteps,seedExecution,...(phased?{phases:phased.phases,executionProfile:phased.executionProfile}:{}),...(options?{options,review}:{}),requiresApproval:true as const,nativeQualified:false as const};
  if(new TextEncoder().encode(canonical(body)).length>24_000_000)fail('Migration plan exceeds24MB');
  return {status:'compiled',plan:copyJson({...body,digest:hashCanonical(body)}) as unknown as TableMigrationPlan,diagnostics:[]};
 }catch(error){
  if(error instanceof UmfError)return {status:'blocked',diagnostics:[{code:error.code,path:error.path,message:error.message,severity:'error'}]};
  if(error instanceof Error&&['INPUT','LIMIT'].includes(error.message))return {status:'blocked',diagnostics:[{code:'TABLE_MIGRATION_INPUT',path:'',message:'Invalid Unicode or resource limit',severity:'error'}]};
  throw error;
 }
}

export function compileTableMigration(input:TableMigrationRequest):TableMigrationResult{
 return compileTableMigrationInternal(input,false);
}

/** Source recompilation verifies complete plans, even after untrusted rehashing. */
export function verifyTableMigration(input:unknown):TableMigrationPlan{
 const value=copyJson(input) as unknown as TableMigrationPlan;
 if(!value||!['umf.table-migration/0.1','umf.table-migration/0.2'].includes(value.version))fail('Unknown migration plan');
 const result=compileTableMigrationInternal({id:value.id,predecessor:value.predecessor,previous:value.previous,next:value.next,...(value.options?{options:value.options}:{})},value.version==='umf.table-migration/0.1');
 if(result.status!=='compiled')return fail('Migration differs from exact source recompilation');
 if(!same(value,result.plan))fail('Migration differs from exact source recompilation');
 return result.plan;
}
