// SPDX-License-Identifier: MIT OR Apache-2.0
import {copyJson} from '../model/json';
import {readDocument} from '../model/document';
import {UmfError,type Diagnostic} from '../model/types';
import {canonical,hashCanonical} from '../compilation/bundle/hash';
import {verifyTableDeployment,type TableDeploymentBundle,type TableDeploymentStep} from '../table-deployment';

export interface TableMigrationRequest {
 id:string;predecessor:{id:string;digest:string}|null;
 previous:TableDeploymentBundle|null;next:TableDeploymentBundle;
}
export interface TableMigrationStep extends TableDeploymentStep {
 preconditions:{phase:'before-plan';kind:'empty-private-schema'|'installed-source-cohort';bundleDigest:string|null};
 expectedOutcome:{phase:'before-commit';kind:'complete-next-source-catalog';bundleDigest:string};
 verification:'native-catalog-privileges-and-role-scope';recovery:'rollback-transaction';
}
export interface TableMigrationPlan extends TableMigrationRequest {
 version:'umf.table-migration/0.1';canonicalization:'RFC8785';
 fromBundleDigest:string|null;toBundleDigest:string;
 steps:TableMigrationStep[];
 seedExecution:'none';
 requiresApproval:true;nativeQualified:false;digest:string;
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
  (module.extensions!['umf.tables'] as {commands:unknown[]}).commands=[];
 }
 return same(documents[0],documents[1]);
}
function identity(value:unknown,path:string):asserts value is string{
 if(typeof value!=='string'||!value.length||value.includes('\0')||new TextEncoder().encode(value).length>256)fail('Expected a nonempty migration identity of at most256 UTF-8 bytes',path);
}
function appendOnly(previous:TableDeploymentBundle,next:TableDeploymentBundle):void{
 if(!same(previous.configuration,next.configuration))fail('Changing module, namespace or trusted role configuration requires a separately qualified migration','/next/configuration');
 const a=readDocument(previous.source.utf8,previous.source.format),b=readDocument(next.source.utf8,next.source.format);
 if(!same({...a,modules:[]},{...b,modules:[]}))fail('Root metadata/vocabulary changes require a separately qualified migration','/next/source');
 if(a.modules.length!==b.modules.length)fail('Module inventory changes are outside the append-table migration subset','/next/source');
 for(let i=0;i<a.modules.length;i++){
  const old=a.modules[i]!,fresh=b.modules[i]!;
  if(old.id!==previous.module){if(!same(old,fresh))fail('Unselected module changes require separate qualification','/next/source');continue;}
  if(!same({...old,elements:[],relationships:[],extensions:without(old.extensions??{},['umf.tables'])},{...fresh,elements:[],relationships:[],extensions:without(fresh.extensions??{},['umf.tables'])}))fail('Selected module metadata changes require separate qualification','/next/source');
  if(!same(old.elements,fresh.elements.slice(0,old.elements.length))||!same(old.relationships??[],(fresh.relationships??[]).slice(0,(old.relationships??[]).length)))fail('Existing native/logical elements and relationships must remain exact; only append is qualified','/next/source');
 }
 const old=previous.expectedCatalog.tables,fresh=next.expectedCatalog.tables;
 if(fresh.length<old.length)fail('Removing native tables requires separate qualification','/next/expectedCatalog/tables');
 for(const[tableIndex,table]of old.entries()){
  const target=fresh[tableIndex]!;
  if(!same(without(table,['indexes']),without(target,['indexes']))||!same(table.indexes,target.indexes.slice(0,table.indexes.length)))fail('Existing table definitions must remain exact; only indexes may be appended','/next/expectedCatalog/tables/'+tableIndex);
  const before=previous.expectedCatalog.indexes.filter(index=>index.table===table.id);
  const after=next.expectedCatalog.indexes.filter(index=>index.table===table.id);
  if(!same(before,after.slice(0,before.length)))fail('Existing native indexes changed','/next/expectedCatalog/indexes');
 }
 for(const key of ['columns','keys','checks','foreignKeys'] as const){
  const retained=next.expectedCatalog[key].filter(item=>old.some(t=>t.id===item.table));
  if(!same(previous.expectedCatalog[key],retained))fail('Existing native definitions changed','/next/expectedCatalog/'+key);
 }
}

/** Inert forward plans: initial deployment, appended tables/indexes or command revisions. */
export function compileTableMigration(input:TableMigrationRequest):TableMigrationResult{
 try{
  const request=copyJson(input) as unknown as TableMigrationRequest;
  if(!request||Object.keys(request).length!==4||!['id','predecessor','previous','next'].every(k=>Object.hasOwn(request,k)))fail('Unknown or missing migration request member');
  identity(request.id,'/id');
  if(request.predecessor!==null){
   const predecessor=request.predecessor;
   if(!predecessor||Object.keys(predecessor).length!==2||!Object.hasOwn(predecessor,'id')||!Object.hasOwn(predecessor,'digest'))fail('Expected an exact predecessor identity/digest','/predecessor');
   identity(predecessor.id,'/predecessor/id');
   if(predecessor.id===request.id||typeof predecessor.digest!=='string'||!/^[a-f0-9]{64}$/.test(predecessor.digest))fail('Invalid predecessor identity/digest','/predecessor');
  }
  const previous=request.previous===null?null:verifyTableDeployment(request.previous),next=verifyTableDeployment(request.next);
  if((previous===null)!==(request.predecessor===null))fail('Only initial deployment has a null predecessor','/predecessor');
  if(previous){
   appendOnly(previous,next);
   if(previous.bundleDigest===next.bundleDigest)fail('An unchanged bundle does not create a new migration','/next');
  }
  const firstNew=previous?.expectedCatalog.tables.length??0;
  const steps=previous?next.steps.filter(s=>{
   const parts=s.sourcePath.split('/');
   if(parts[5]!=='tables'||!/^\d+$/.test(parts[6]??''))return false;
   const tableIndex=Number(parts[6]);
   if(tableIndex>=firstNew)return true;
   return s.kind==='index'&&parts[7]==='indexes'&&/^\d+$/.test(parts[8]??'')&&Number(parts[8])>=previous.expectedCatalog.tables[tableIndex]!.indexes.length;
  }):next.steps;
  if(previous&&!steps.length&&!commandOnly(previous,next))fail('A plan without DDL may change only declared commands or source serialization','/next/source');
  if(previous?.seedSets.length||next.seedSets.length)fail('Migration seed execution requires the qualified typed command profile','/next/seedSets');
  const migrationSteps:TableMigrationStep[]=steps.map(step=>({...step,
   preconditions:{phase:'before-plan',kind:previous?'installed-source-cohort':'empty-private-schema',bundleDigest:previous?.bundleDigest??null},
   expectedOutcome:{phase:'before-commit',kind:'complete-next-source-catalog',bundleDigest:next.bundleDigest},
   verification:'native-catalog-privileges-and-role-scope',recovery:'rollback-transaction'}));
  const body={version:'umf.table-migration/0.1' as const,canonicalization:'RFC8785' as const,id:request.id,predecessor:request.predecessor,previous,next,fromBundleDigest:previous?.bundleDigest??null,toBundleDigest:next.bundleDigest,steps:migrationSteps,seedExecution:'none' as const,requiresApproval:true as const,nativeQualified:false as const};
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
 if(!value||value.version!=='umf.table-migration/0.1')fail('Unknown migration plan');
 const result=compileTableMigration({id:value.id,predecessor:value.predecessor,previous:value.previous,next:value.next});
 if(result.status!=='compiled')return fail('Migration differs from exact source recompilation');
 if(!same(value,result.plan))fail('Migration differs from exact source recompilation');
 return result.plan;
}
