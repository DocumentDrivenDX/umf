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
export {discoverTableMigrationChanges,reviewedValueDigest} from './reviewed';
export type {ReviewedChangeCandidate,ReviewedChangeKind,ReviewedChangeMarker} from './reviewed';

export interface TableMigrationRequest {
 id:string;predecessor:{id:string;digest:string}|null;
 previous:TableDeploymentBundle|null;next:TableDeploymentBundle;options?:TableMigrationOptions;
}
export interface TableMigrationStep extends Omit<TableDeploymentStep,'transaction'|'kind'> {
 kind:TableDeploymentStep['kind']|'backfill';transaction:'required'|'forbidden';operation?:string;
 preconditions:{phase:'before-plan';kind:'empty-private-schema'|'installed-source-cohort';bundleDigest:string|null};
 expectedOutcome:{phase:'before-commit';kind:'complete-next-source-catalog';bundleDigest:string};
 verification:'native-catalog-privileges-and-role-scope';recovery:'rollback-transaction'|'inspect-index';
}
export interface TableMigrationPlan extends TableMigrationRequest {
 version:'umf.table-migration/0.1'|'umf.table-migration/0.2';canonicalization:'RFC8785';
 fromBundleDigest:string|null;toBundleDigest:string;
 steps:TableMigrationStep[];
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
type MigrationChanges={policyChanges:Set<string>;columnChanges:Map<number,TableDeploymentBundle['expectedCatalog']['columns']>;checkChanges:Map<number,TableDeploymentBundle['expectedCatalog']['checks']>;checkPaths:Map<number,Map<string,string>>;grantChanges:Map<string,GrantChange>};
const quoteIdentifier=(value:string):string=>'"'+value.replaceAll('"','""')+'"';
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
function appendOnly(previous:TableDeploymentBundle,next:TableDeploymentBundle,options?:TableMigrationOptions):MigrationChanges{
 if(!same(previous.configuration,next.configuration))fail('Changing module, namespace or trusted role configuration requires a separately qualified migration','/next/configuration');
 const a=readDocument(previous.source.utf8,previous.source.format),b=readDocument(next.source.utf8,next.source.format);
 if(!same({...a,modules:[]},{...b,modules:[]}))fail('Root metadata/vocabulary changes require a separately qualified migration','/next/source');
 if(a.modules.length!==b.modules.length)fail('Module inventory changes are outside the append-table migration subset','/next/source');
 const moduleIndex=a.modules.findIndex(module=>module.id===previous.module);
 if(moduleIndex<0)fail('The selected source module is missing','/previous/module');
 const appendedFields=new Set<string>();
 for(let i=0;i<a.modules.length;i++){
  const old=a.modules[i]!,fresh=b.modules[i]!;
  if(old.id!==previous.module){if(!same(old,fresh))fail('Unselected module changes require separate qualification','/next/source');continue;}
  if(!same({...old,elements:[],relationships:[],extensions:without(old.extensions??{},['umf.tables'])},{...fresh,elements:[],relationships:[],extensions:without(fresh.extensions??{},['umf.tables'])}))fail('Selected module metadata changes require separate qualification','/next/source');
  if(fresh.elements.length<old.elements.length||!same(old.relationships??[],(fresh.relationships??[]).slice(0,(old.relationships??[]).length)))fail('Existing relationships must remain exact; only append is qualified','/next/source');
  const newFieldIds=new Set(fresh.elements.slice(old.elements.length).filter(element=>element.kind==='field').map(element=>element.id));
  for(let j=0;j<old.elements.length;j++){
   const before=old.elements[j]!,after=fresh.elements[j]!;
   if(same(before,after))continue;
   const previousMembers=before.kind==='record'?before.members??[]:[],nextMembers=after.kind==='record'?after.members??[]:[];
   if(same(without(before,['description']),without(after,['description'])))continue;
   if(before.kind!=='record'||after.kind!=='record'||!same(without({...before,members:[]},['description']),without({...after,members:[]},['description']))||!same(previousMembers,nextMembers.slice(0,previousMembers.length)))fail('Existing logical elements must remain exact; only appended table fields are qualified','/next/source/modules/'+i+'/elements/'+j);
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
 const policyChanges=new Set<string>(),columnChanges=new Map<number,TableDeploymentBundle['expectedCatalog']['columns']>(),checkChanges=new Map<number,TableDeploymentBundle['expectedCatalog']['checks']>(),checkPaths=new Map<number,Map<string,string>>(),grantChanges=new Map<string,GrantChange>();
 for(const[tableIndex,table]of oldTables.entries()){
  const target=nextTables[tableIndex]!;
  if(!same(without(table,['indexes','columns','policy','checks','foreignKeys']),without(target,['indexes','columns','policy','checks','foreignKeys']))||!same(table.indexes,target.indexes.slice(0,table.indexes.length)))fail('Existing table definitions must remain exact except for appended columns, policy rules and indexes','/next/expectedCatalog/tables/'+tableIndex);
  const oldTableColumns=previousColumns.get(table.id)??[],nextTableColumns=nextColumns.get(table.id)??[];
  if(!same(table.columns,target.columns.slice(0,table.columns.length))||!same(oldTableColumns,nextTableColumns.slice(0,oldTableColumns.length)))fail('Existing native columns changed','/next/expectedCatalog/tables/'+tableIndex+'/columns');
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
  const before=previousIndexes.get(table.id)??[],after=nextIndexes.get(table.id)??[];
  if(!same(before,after.slice(0,before.length)))fail('Existing native indexes changed','/next/expectedCatalog/indexes');
  const oldCheckEntries=previousChecks.get(table.id)??[],newCheckEntries=nextChecks.get(table.id)??[],remainingOld=new Map<string,number>();
  for(const entry of oldCheckEntries){const key=canonical(entry);remainingOld.set(key,(remainingOld.get(key)??0)+1);}
  const addedChecks:typeof newCheckEntries=[];
  for(const entry of newCheckEntries){const key=canonical(entry),count=remainingOld.get(key)??0;if(count)remainingOld.set(key,count-1);else addedChecks.push(entry);}
  if([...remainingOld.values()].some(count=>count!==0))fail('Existing native check constraints changed','/next/expectedCatalog/checks');
  if(addedChecks.length){
   const allowedDomainNames=new Set(additions.map(column=>'umf_d_'+hashCanonical([table.id,column.field,'finite-domain']).slice(0,32)));
   if(!options&&addedChecks.some(entry=>!allowedDomainNames.has(entry.name)))fail('Only compiler-generated domain checks for appended columns are qualified','/next/expectedCatalog/checks');
   checkChanges.set(tableIndex,addedChecks);
  }
  if(!same(previousKeys.get(table.id)??[],nextKeys.get(table.id)??[])||!same(previousForeignKeys.get(table.id)??[],(nextForeignKeys.get(table.id)??[]).slice(0,(previousForeignKeys.get(table.id)??[]).length))||(!options&&!same(previousForeignKeys.get(table.id)??[],nextForeignKeys.get(table.id)??[])))fail('Existing native keys and foreign keys must remain exact; added FKs require migration options','/next/expectedCatalog');
  for(const audience of ['person','batch'] as const)for(const command of ['select','insert','update','delete'] as const){
   const path=policyPath(moduleIndex,tableIndex,audience,command);
   if(!same(table.policy[audience][command],target.policy[audience][command]))policyChanges.add(path);
   const oldGrants=previousPolicyGrants.get(path)??[],newGrants=nextPolicyGrants.get(path)??[];
   if(!same(oldGrants.map(step=>step.sql),newGrants.map(step=>step.sql)))grantChanges.set(path,{previous:oldGrants,next:newGrants});
  }
 }
 if(appendedFields.size)fail('Every appended Field on an existing Record needs one nullable native column mapping','/next/expectedCatalog/tables');
 return {policyChanges,columnChanges,checkChanges,checkPaths,grantChanges};
}

/** Inert forward plans: initial deployment, bounded additive DDL or command revisions. */
export function compileTableMigration(input:TableMigrationRequest):TableMigrationResult{
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
  let changes:MigrationChanges={policyChanges:new Set(),columnChanges:new Map(),checkChanges:new Map(),checkPaths:new Map(),grantChanges:new Map()};
  if(previous){
   changes=appendOnly(previous,next,options);
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
    if(step.kind==='index'&&parts[7]==='indexes'&&/^\d+$/.test(parts[8]??'')&&Number(parts[8])>=previous.expectedCatalog.tables[tableIndex]!.indexes.length){steps.push(step);continue;}
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
   const table=next.expectedCatalog.tables.find(t=>t.id===comment.table)!;
   const target=quoteIdentifier(next.configuration.schema)+'.'+quoteIdentifier(table.name)+(comment.column===undefined?'':'.'+quoteIdentifier(comment.column));
   steps.push({id:'',kind:'comment',sourcePath:'/next/expectedCatalog/comments',transaction:'required',sql:'COMMENT ON '+(comment.column===undefined?'TABLE ':'COLUMN ')+target+' IS NULL'});
  }
  if(steps.length>8192)fail('Migration step count exceeds8192','/steps');
  const stepIds=new Set(steps.filter(step=>step.id).map(step=>step.id));let syntheticId=90000;
  for(const step of steps)if(!step.id){while(stepIds.has('step-'+String(syntheticId).padStart(5,'0')))syntheticId++;step.id='step-'+String(syntheticId++).padStart(5,'0');stepIds.add(step.id);}
  if(previous&&!steps.length&&!commandOnly(previous,next))fail('A plan without DDL may change only declared commands or source serialization','/next/source');
  const oldSeeds=previous?.seedSets??[];
  if(!same(oldSeeds,next.seedSets.slice(0,oldSeeds.length)))fail('Existing seed sets are immutable; append a new set','/next/seedSets');
  const addedSeeds=next.seedSets.slice(oldSeeds.length);
  if(addedSeeds.length&&(next.source.format!=='json'||addedSeeds.length>128||addedSeeds.some(s=>new TextEncoder().encode(s.id).length>256)||addedSeeds.reduce((n,s)=>n+s.rows.length,0)>10000))fail('Native seeds require JSON source, at most128 new sets/10000 rows, and256-byte IDs','/next/seedSets');
  const seedExecution:TableMigrationPlan['seedExecution']=addedSeeds.length?{version:'umf.table-seed-execution/0.1',sets:addedSeeds.map(s=>s.id)}:'none';
  if(options?.concurrentIndexes.length){
   const docs=[previous!,next].map(bundle=>readDocument(bundle.source.utf8,bundle.source.format));
   for(const doc of docs){const m=doc.modules.find(m=>m.id===next.module)!;const p=m.extensions!['umf.tables'] as unknown as {tables:{indexes:unknown[]}[]};for(const t of p.tables)t.indexes=[];}
   if(!same(docs[0],docs[1]))fail('Concurrent phases may change only index declarations','/options/concurrentIndexes');
   if(addedSeeds.length||options.backfills.length||steps.some(step=>step.kind!=='index'))fail('Concurrent indexes require an index-only migration without seeds or other effects','/options/concurrentIndexes');
   const selected=new Set(options.concurrentIndexes.map(selection=>{const table=next.expectedCatalog.tables.findIndex(t=>t.id===selection.table),index=next.expectedCatalog.tables[table]!.indexes.findIndex(i=>i.id===selection.index);return table+':'+index;}));
   for(const [i,step]of steps.entries()){const parts=step.sourcePath.split('/');if(!selected.has(parts[6]+':'+parts[8]))fail('Every index in this phase must be explicitly selected as concurrent','/options/concurrentIndexes');steps[i]={...step,transaction:'forbidden',sql:step.sql.replace(/^(CREATE (?:UNIQUE )?INDEX) /,'$1 CONCURRENTLY ')};}
  }
  const review:MigrationReview[]=options?[...options.backfills.map((_,i)=>({code:'SCOPED_BACKFILL' as const,path:'/options/backfills/'+i,message:'Administrative UPDATE may touch protected rows; exact source and effect bound require approval'})),...Array.from(changes.policyChanges,path=>({code:'POLICY_CHANGE_REVIEW' as const,path,message:'Changed row predicate may widen access; review old and new command policy'}))]:[];
  const migrationSteps:TableMigrationStep[]=steps.map(step=>({...step,
   preconditions:{phase:'before-plan',kind:previous?'installed-source-cohort':'empty-private-schema',bundleDigest:previous?.bundleDigest??null},
   expectedOutcome:{phase:'before-commit',kind:'complete-next-source-catalog',bundleDigest:next.bundleDigest},
   verification:'native-catalog-privileges-and-role-scope',recovery:step.transaction==='forbidden'?'inspect-index':'rollback-transaction'}));
 const migrationVersion=options?.version==='umf.table-migration-options/0.2'?'umf.table-migration/0.2' as const:'umf.table-migration/0.1' as const;
 const body={version:migrationVersion,canonicalization:'RFC8785' as const,id:request.id,predecessor:request.predecessor,previous,next,fromBundleDigest:previous?.bundleDigest??null,toBundleDigest:next.bundleDigest,steps:migrationSteps,seedExecution,...(options?{options,review}:{}),requiresApproval:true as const,nativeQualified:false as const};
  if(new TextEncoder().encode(canonical(body)).length>24_000_000)fail('Migration plan exceeds24MB');
  return {status:'compiled',plan:copyJson({...body,digest:hashCanonical(body)}) as unknown as TableMigrationPlan,diagnostics:[]};
 }catch(error){
  if(error instanceof UmfError)return {status:'blocked',diagnostics:[{code:error.code,path:error.path,message:error.message,severity:'error'}]};
  if(error instanceof Error&&['INPUT','LIMIT'].includes(error.message))return {status:'blocked',diagnostics:[{code:'TABLE_MIGRATION_INPUT',path:'',message:'Invalid Unicode or resource limit',severity:'error'}]};
  throw error;
 }
}

/** Source recompilation verifies complete plans, even after untrusted rehashing. */
export function verifyTableMigration(input:unknown):TableMigrationPlan{
 const value=copyJson(input) as unknown as TableMigrationPlan;
 if(!value||!['umf.table-migration/0.1','umf.table-migration/0.2'].includes(value.version))fail('Unknown migration plan');
 const result=compileTableMigration({id:value.id,predecessor:value.predecessor,previous:value.previous,next:value.next,...(value.options?{options:value.options}:{})});
 if(result.status!=='compiled')return fail('Migration differs from exact source recompilation');
 if(!same(value,result.plan))fail('Migration differs from exact source recompilation');
 return result.plan;
}
