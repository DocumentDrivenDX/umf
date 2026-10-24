// SPDX-License-Identifier: MIT OR Apache-2.0
import {canonical,hashCanonical} from '../compilation/bundle/hash';
import {readDocument} from '../model/document';
import {UmfError} from '../model/errors';
import type {TableDeploymentBundle} from '../table-deployment';
import {verifyTableDeployment} from '../table-deployment';
import {validateTableInventorySourceHistory,type TableInventoryDiscoverySelector,type TableInventoryReviewedChangeKind,type TableInventoryMigrationMarker,type TableInventoryDiscoveryIntent,type TableInventorySourceHistory} from './inventory-options';
import {consumeTableMigrationChangesBounded,type ReviewedChangeCandidate} from './reviewed';
import {projectG10Bundle,type InventoryProjection} from './inventory-source';
import {deriveInventorySeedLineage,type InventoryHistory} from './inventory-history';
import {createHistoricalG10Verifier} from './inventory';

export type TableInventoryTableReviewEffects=readonly ['new-physical-binding']|readonly ['ordinary-access-retired','stored-rows-irreversibly-purged','physical-binding-removed'];
export interface TableInventoryTableReview {
 profile:'umf.table-inventory-review/0.1';side:'previous'|'next';source:{format:'json';sha256:string};configuration:import('../model/types').Json;table:string;record:{module:string;element:string};meaning:import('../model/types').Json|null;intent:TableInventoryDiscoveryIntent;effects:TableInventoryTableReviewEffects;
}
export interface TableInventorySeedReview {
 profile:'umf.table-inventory-seed-retirement-review/0.1';side:'previous'|'next';source:{format:'json';sha256:string};configuration:import('../model/types').Json;id:string;definition:import('../model/types').Json;definitionDigest:string;originalSourceDigest:string;execution:'not-run'|'confirmed';retired:boolean;effects:readonly []|readonly ['original-definition-and-execution-retained-in-history','no-data-replay'];
}
export type TableInventoryReviewValue=TableInventoryTableReview|TableInventorySeedReview;
type TableInventoryCandidateBase=Omit<TableInventoryMigrationMarker,'kind'>;
type TableInventoryLegacyReviewKind=Exclude<TableInventoryReviewedChangeKind,'create-table'|'remove-table'|'table-removal-effects'|'retire-seed-history'|'conversion-effects'>;
export type TableInventoryReviewedChangeCandidate=
 |(TableInventoryCandidateBase&{kind:'create-table';oldValue:TableInventoryTableReview|null;newValue:TableInventoryTableReview;oldPath:null;newPath:string})
 |(TableInventoryCandidateBase&{kind:'remove-table'|'table-removal-effects';oldValue:TableInventoryTableReview;newValue:TableInventoryTableReview;oldPath:string;newPath:null})
 |(TableInventoryCandidateBase&{kind:'retire-seed-history';oldValue:TableInventorySeedReview;newValue:TableInventorySeedReview;oldPath:string;newPath:null})
 |(TableInventoryCandidateBase&{kind:TableInventoryLegacyReviewKind;oldValue:import('../model/types').Json|null;newValue:import('../model/types').Json|null;oldPath?:string|null;newPath?:string|null});

const exact=(value:unknown,keys:readonly string[]):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const digest=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);
const fail=(code:string,path:string):never=>{throw new UmfError(code,'The inventory review request is invalid or not supported by this source profile.',path);};
const markerKeys=['id','kind','path','oldDigest','newDigest'] as const;
const effectsCreate=['new-physical-binding'] as const;
const effectsRemove=['ordinary-access-retired','stored-rows-irreversibly-purged','physical-binding-removed'] as const;
const asJson=(value:unknown):import('../model/types').Json=>value as import('../model/types').Json;

function tableDeclarationPath(bundle:TableDeploymentBundle,tableId:string):string{
 const document=readDocument(bundle.source.utf8,bundle.source.format),moduleIndex=document.modules.findIndex(module=>module.id===bundle.module),module=document.modules[moduleIndex];
 const payload=module?.extensions?.['umf.tables'];
 if(!module||!payload||typeof payload!=='object'||Array.isArray(payload))fail('TABLE_MIGRATION_REVIEW','/next/source');
 const tables=(payload as {tables?:unknown}).tables;
 if(!Array.isArray(tables))fail('TABLE_MIGRATION_REVIEW','/next/source');
 const index=tables.findIndex(value=>!!value&&typeof value==='object'&&(value as {id?:unknown}).id===tableId);
 if(index<0)fail('TABLE_MIGRATION_REVIEW','/next/source');
 return `/modules/${moduleIndex}/extensions/umf.tables/tables/${index}`;
}
function tableIntentValue(intent:TableInventoryDiscoveryIntent):TableInventoryDiscoveryIntent{
 return intent.kind==='create'?{kind:'create',table:intent.table,record:{...intent.record}}:{kind:'remove',table:intent.table,record:{...intent.record},disposition:{mode:'irreversible-purge'}};
}
function sideValue(row:InventoryProjection,intent:TableInventoryDiscoveryIntent,effects:TableInventoryTableReviewEffects):TableInventoryTableReview{
 return {profile:'umf.table-inventory-review/0.1',side:row.side,source:{format:'json',sha256:row.source.sha256},configuration:row.configuration,table:row.table,record:{...row.record},meaning:row.meaning,intent:tableIntentValue(intent),effects:[...effects] as TableInventoryTableReviewEffects};
}
function candidate(kind:TableInventoryReviewedChangeKind,path:string,oldValue:import('../model/types').Json|null,newValue:import('../model/types').Json|null,oldPath?:string|null,newPath?:string|null):TableInventoryReviewedChangeCandidate{
 const oldDigest=hashCanonical(oldValue),newDigest=hashCanonical(newValue),id='review-'+hashCanonical([kind,path,oldDigest,newDigest]).slice(0,24);
 return {id,kind,path,oldDigest,newDigest,oldValue,newValue,...(oldPath!==undefined?{oldPath}:{}),...(newPath!==undefined?{newPath}:{})} as unknown as TableInventoryReviewedChangeCandidate;
}
function legacyCandidates(previous:TableDeploymentBundle|null,next:TableDeploymentBundle,accept:(candidate:TableInventoryReviewedChangeCandidate)=>void,maxCandidates:number,maxBytes:number):void{
 if(previous===null)return;
 try{
  consumeTableMigrationChangesBounded(verifyTableDeployment(previous),verifyTableDeployment(next),{version:'umf.table-migration-discovery/0.3'},maxCandidates,maxBytes,item=>{
   const candidate={id:item.id,kind:item.kind,path:item.path,oldDigest:item.oldDigest,newDigest:item.newDigest,oldValue:asJson(item.oldValue),newValue:asJson(item.newValue),...(item.oldPath!==undefined?{oldPath:item.oldPath}:{}),...(item.newPath!==undefined?{newPath:item.newPath}:{})} as TableInventoryReviewedChangeCandidate;
   accept(candidate);
  });
 }
 catch(error){if(error instanceof UmfError&&error.code==='TABLE_MIGRATION_REVIEW')throw error;fail('TABLE_MIGRATION_REVIEW','/previous');}
}
/** Build the independent, marker-free table inventory review from complete original sources. */
export function discoverInventoryReviewCandidatesWithVerifier(previous:TableDeploymentBundle|null,next:TableDeploymentBundle,selector:TableInventoryDiscoverySelector,originalHistory:TableInventorySourceHistory,verifier:ReturnType<typeof createHistoricalG10Verifier>):TableInventoryReviewedChangeCandidate[]{
 const selectorKeys=['version','tableIntents','conversions','retiredSeedSets','retirements','restorations','archiveSources'];
 if(!exact(selector,selectorKeys)||selector.version!=='umf.table-inventory-discovery/0.1')fail('TABLE_MIGRATION_REVIEW','/selector');
 if(previous&&previous.source.format!=='json'||next.source.format!=='json')fail('TABLE_MIGRATION_REVIEW','/source/format');
 if(!Array.isArray(selector.tableIntents)||!Array.isArray(selector.conversions)||!Array.isArray(selector.retiredSeedSets)||!Array.isArray(selector.retirements)||!Array.isArray(selector.restorations)||!Array.isArray(selector.archiveSources))fail('TABLE_MIGRATION_REVIEW','/selector');
 validateDiscoveryBounds(selector);
 if(selector.conversions.length||selector.retirements.length||selector.restorations.length||selector.archiveSources.length)fail('TABLE_MIGRATION_REVIEW','/selector');
 const history=validateTableInventorySourceHistory(originalHistory,previous,verifier);
 const before=previous===null?null:projectG10Bundle(verifyTableDeployment(previous),'previous'),after=projectG10Bundle(verifyTableDeployment(next),'next');
 const oldTables=new Map((before?.tables??[]).map(table=>[table.table,table])),newTables=new Map(after.tables.map(table=>[table.table,table]));
 const intentByIdentity=new Map<string,{intent:TableInventoryDiscoveryIntent;index:number}>();
 selector.tableIntents.forEach((intent,index)=>{
  if(!intent||typeof intent!=='object'||!['create','remove'].includes(intent.kind)||typeof intent.table!=='string'||!intent.table||!exact(intent.record,['module','element'])||typeof intent.record.module!=='string'||typeof intent.record.element!=='string')fail('TABLE_MIGRATION_REVIEW',`/selector/tableIntents/${index}`);
  if(intent.kind==='create'&&!exact(intent,['kind','table','record'])||intent.kind==='remove'&&!exact(intent,['kind','table','record','disposition']))fail('TABLE_MIGRATION_REVIEW',`/selector/tableIntents/${index}`);
  const key=JSON.stringify([intent.kind,intent.table]);if(intentByIdentity.has(key))fail('TABLE_MIGRATION_REVIEW',`/selector/tableIntents/${index}`);
  if(intent.kind==='remove'&&(!exact(intent.disposition,['mode'])||intent.disposition.mode!=='irreversible-purge'))fail('TABLE_MIGRATION_REVIEW',`/selector/tableIntents/${index}/disposition`);
  const copy:TableInventoryDiscoveryIntent=intent.kind==='create'
   ?{kind:'create',table:intent.table,record:{module:intent.record.module,element:intent.record.element}}
   :{kind:'remove',table:intent.table,record:{module:intent.record.module,element:intent.record.element},disposition:{mode:'irreversible-purge'}};
  intentByIdentity.set(key,{intent:copy,index});
 });
 const result:TableInventoryReviewedChangeCandidate[]=[];let retainedCandidateBytes=0;
 const candidateIndex=new Map<string,number>();
 const appendCandidate=(item:TableInventoryReviewedChangeCandidate):void=>{
  const at=candidateIndex.get(item.id);
  if(at!==undefined){
   const prior=result[at]!;
   if(canonical([prior.kind,prior.path,prior.oldDigest,prior.newDigest,prior.oldValue,prior.newValue])!==canonical([item.kind,item.path,item.oldDigest,item.newDigest,item.oldValue,item.newValue]))fail('TABLE_MIGRATION_REVIEW',item.path);
   for(const key of ['oldPath','newPath'] as const)if(prior[key]!==undefined&&item[key]!==undefined&&prior[key]!==item[key])fail('TABLE_MIGRATION_REVIEW',item.path);
   const merged={...prior,...(prior.oldPath===undefined&&item.oldPath!==undefined?{oldPath:item.oldPath}:{}),...(prior.newPath===undefined&&item.newPath!==undefined?{newPath:item.newPath}:{})} as TableInventoryReviewedChangeCandidate;
   let nextBytes:number,priorBytes:number;try{nextBytes=new TextEncoder().encode(canonical(merged)).byteLength;priorBytes=new TextEncoder().encode(canonical(prior)).byteLength;}catch{fail('TABLE_MIGRATION_REVIEW','/selector');}
   if(retainedCandidateBytes-priorBytes+nextBytes>25165824)fail('TABLE_MIGRATION_REVIEW','/selector');
   retainedCandidateBytes+=nextBytes-priorBytes;result[at]=merged;return;
  }
  if(result.length>=2048)fail('TABLE_MIGRATION_REVIEW','/selector');
  let bytes:number;try{bytes=new TextEncoder().encode(canonical(item)).byteLength;}catch{fail('TABLE_MIGRATION_REVIEW','/selector');}
  if(bytes>25165824||retainedCandidateBytes+bytes>25165824)fail('TABLE_MIGRATION_REVIEW','/selector');
  candidateIndex.set(item.id,result.length);retainedCandidateBytes+=bytes;result.push(item);
 };
 legacyCandidates(previous,next,appendCandidate,2048-result.length,25165824-retainedCandidateBytes);
 for(const {intent,index} of intentByIdentity.values()){
  const old=oldTables.get(intent.table),fresh=newTables.get(intent.table);
  const prior=old!==undefined,post=fresh!==undefined;
  if(intent.kind==='create'){
   if(prior||!post||JSON.stringify(intent.record)!==JSON.stringify(fresh.record))fail('TABLE_MIGRATION_REVIEW',`/selector/tableIntents/${index}`);
   const value=sideValue(after.reviews.find(row=>row.table===intent.table)!,intent,effectsCreate);
   const path=tableDeclarationPath(after.bundle,intent.table);
   appendCandidate(candidate('create-table',path,previous===null?null:asJson(absentTableReview(before!,intent,effectsCreate)),asJson(value),null,path));
  }else{
   if(!prior||post||JSON.stringify(intent.record)!==JSON.stringify(old.record))fail('TABLE_MIGRATION_REVIEW',`/selector/tableIntents/${index}`);
   const sourceRow=before!.reviews.find(row=>row.table===intent.table);if(!sourceRow)fail('TABLE_MIGRATION_REVIEW','/previous/source');
   const oldValue=sideValue(sourceRow,intent,effectsRemove),newValue=absentFromNext(after,intent,effectsRemove),oldPath=tableDeclarationPath(before!.bundle,intent.table),tablePath=`/options/tableIntents/${index}/disposition`;
   appendCandidate(candidate('remove-table',oldPath,asJson(oldValue),asJson(newValue),oldPath,null));
   appendCandidate(candidate('table-removal-effects',tablePath,asJson(oldValue),asJson(newValue),oldPath,null));
  }
 }
 const expectedChanges=[...(before?.tables??[]).filter(item=>!newTables.has(item.table)).map(item=>['remove',item.table] as const),...after.tables.filter(item=>!oldTables.has(item.table)).map(item=>['create',item.table] as const)];
 for(const [kind,table] of expectedChanges)if(!intentByIdentity.has(JSON.stringify([kind,table])))fail('TABLE_MIGRATION_REVIEW','/selector/tableIntents');
 const seedLineage=deriveInventorySeedLineage(history as unknown as InventoryHistory,{previous,next,options:{seedSets:[],retiredSeedSets:[...selector.retiredSeedSets]}},verifier);
 for(const [index,id] of selector.retiredSeedSets.entries()){
  const lineage=seedLineage.find(entry=>entry.id===id);
  const priorSeed=previous?.seedSets.find(seed=>seed.id===id);
  const nextSeed=next.seedSets.find(seed=>seed.id===id);
  if(!lineage||lineage.disposition!=='retire-definition'||!priorSeed||nextSeed)fail('TABLE_MIGRATION_REVIEW',`/selector/retiredSeedSets/${index}`);
  let original:{definition:import('../model/types').Json;sourceDigest:string}|undefined;
  for(const plan of originalHistory.plans){
   const sourcePlan=plan as unknown as {next:TableDeploymentBundle};
   const definition=sourcePlan.next?.seedSets?.find(seed=>seed.id===id);
   if(definition){original={definition:asJson(definition),sourceDigest:sourcePlan.next.sourceDigest};break;}
  }
  if(!original||hashCanonical(original.definition)!==lineage.definitionDigest||original.sourceDigest!==lineage.originalSourceDigest)fail('TABLE_MIGRATION_REVIEW',`/selector/retiredSeedSets/${index}`);
  const oldReview:TableInventorySeedReview={profile:'umf.table-inventory-seed-retirement-review/0.1',side:'previous',source:{format:'json',sha256:previous.sourceDigest},configuration:asJson(previous.configuration),id,definition:original.definition,definitionDigest:lineage.definitionDigest,originalSourceDigest:lineage.originalSourceDigest,execution:lineage.execution,retired:false,effects:[]};
  const newReview:TableInventorySeedReview={...oldReview,side:'next',source:{format:'json',sha256:next.sourceDigest},configuration:asJson(next.configuration),retired:true,effects:['original-definition-and-execution-retained-in-history','no-data-replay']};
  const path=`/options/retiredSeedSets/${index}`;const oldPath=seedDefinitionPath(previous,id);
  appendCandidate(candidate('retire-seed-history',path,asJson(oldReview),asJson(newReview),oldPath,null));
 }
 if(result.length>2048)fail('TABLE_MIGRATION_REVIEW','/selector');
 return result;
}

function validateDiscoveryBounds(selector:TableInventoryDiscoverySelector):void{
 const enc=new TextEncoder(),bytes=(value:string)=>enc.encode(value).length;
 const bounded=(value:unknown,path:string,max=256):value is string=>typeof value==='string'&&value.length>0&&value.length<=max&&bytes(value)<=max&&!value.includes('\0');
 if(selector.tableIntents.length>512)fail('TABLE_MIGRATION_REVIEW','/selector/tableIntents');
 if(selector.conversions.length>256)fail('TABLE_MIGRATION_REVIEW','/selector/conversions');
 if(selector.retiredSeedSets.length>256)fail('TABLE_MIGRATION_REVIEW','/selector/retiredSeedSets');
 if(selector.retirements.length>256)fail('TABLE_MIGRATION_REVIEW','/selector/retirements');
 if(selector.restorations.length>256)fail('TABLE_MIGRATION_REVIEW','/selector/restorations');
 if(selector.archiveSources.length>64)fail('TABLE_MIGRATION_REVIEW','/selector/archiveSources');
 // These source families are intentionally not admitted by this compiler
 // slice. Reject them before canonicalizing or walking caller-controlled nested
 // values; a bounded count is not permission to retain unsupported payloads.
 if(selector.conversions.length||selector.retirements.length||selector.restorations.length||selector.archiveSources.length)fail('TABLE_MIGRATION_REVIEW','/selector');
 let creates=0,removes=0;
 for(const [index,intent] of selector.tableIntents.entries()){
  const path=`/selector/tableIntents/${index}`;
  if(!intent||typeof intent!=='object'||(intent.kind!=='create'&&intent.kind!=='remove'))fail('TABLE_MIGRATION_REVIEW',path);
  if(intent.kind==='create'){if(!exact(intent,['kind','table','record']))fail('TABLE_MIGRATION_REVIEW',path);creates++;}
  else{if(!exact(intent,['kind','table','record','disposition']))fail('TABLE_MIGRATION_REVIEW',path);removes++;if(!exact(intent.disposition,['mode'])||intent.disposition.mode!=='irreversible-purge')fail('TABLE_MIGRATION_REVIEW',path+'/disposition');}
  if(!bounded(intent.table,path+'/table')||!exact(intent.record,['module','element'])||!bounded(intent.record.module,path+'/record/module')||!bounded(intent.record.element,path+'/record/element'))fail('TABLE_MIGRATION_REVIEW',path);
 }
 if(creates>256||removes>256)fail('TABLE_MIGRATION_REVIEW','/selector/tableIntents');
 const retiredIds=new Set<string>();
 for(const [index,id] of selector.retiredSeedSets.entries()){
  if(!bounded(id,`/selector/retiredSeedSets/${index}`)||retiredIds.has(id))fail('TABLE_MIGRATION_REVIEW',`/selector/retiredSeedSets/${index}`);
  retiredIds.add(id);
 }
 let archiveBytes=0;
 for(const [index,archive] of selector.archiveSources.entries()){
  const data=archive?.source?.utf8;
  if(typeof data!=='string')fail('TABLE_MIGRATION_REVIEW',`/selector/archiveSources/${index}`);
  const size=bytes(data);if(size>1048576)fail('TABLE_MIGRATION_REVIEW',`/selector/archiveSources/${index}/source/utf8`);archiveBytes+=size;
 }
 if(archiveBytes>4194304)fail('TABLE_MIGRATION_REVIEW','/selector/archiveSources');
 try{if(bytes(canonical(selector))>6291456)fail('TABLE_MIGRATION_REVIEW','/selector');}catch(error){if(error instanceof UmfError)throw error;fail('TABLE_MIGRATION_REVIEW','/selector');}
}
export function discoverInventoryReviewCandidates(previous:TableDeploymentBundle|null,next:TableDeploymentBundle,selector:TableInventoryDiscoverySelector,originalHistory:TableInventorySourceHistory):TableInventoryReviewedChangeCandidate[]{
 return discoverInventoryReviewCandidatesWithVerifier(previous,next,selector,originalHistory,createHistoricalG10Verifier());
}
function absentTableReview(source:{bundle:TableDeploymentBundle;reviews:InventoryProjection[]},intent:TableInventoryDiscoveryIntent,effects:TableInventoryTableReviewEffects):TableInventoryTableReview{
 return {profile:'umf.table-inventory-review/0.1',side:'previous',source:{format:'json',sha256:source.bundle.sourceDigest},configuration:asJson(source.bundle.configuration),table:intent.table,record:{...intent.record},meaning:null,intent:tableIntentValue(intent),effects:[...effects]};
}
function absentFromNext(source:{bundle:TableDeploymentBundle;reviews:InventoryProjection[]},intent:TableInventoryDiscoveryIntent,effects:TableInventoryTableReviewEffects):TableInventoryTableReview{
 return {profile:'umf.table-inventory-review/0.1',side:'next',source:{format:'json',sha256:source.bundle.sourceDigest},configuration:asJson(source.bundle.configuration),table:intent.table,record:{...intent.record},meaning:null,intent:tableIntentValue(intent),effects:[...effects]};
}
function seedDefinitionPath(bundle:TableDeploymentBundle,id:string):string{
 const document=readDocument(bundle.source.utf8,bundle.source.format),moduleIndex=document.modules.findIndex(module=>module.id===bundle.module),module=document.modules[moduleIndex],payload=module?.extensions?.['umf.tables'] as {seedSets?:{id:string}[]}|undefined,index=payload?.seedSets?.findIndex(seed=>seed.id===id)??-1;
 if(index<0)fail('TABLE_MIGRATION_REVIEW','/previous/source');
 return `/modules/${moduleIndex}/extensions/umf.tables/seedSets/${index}`;
}
export function inventoryMarker(candidate:TableInventoryReviewedChangeCandidate):TableInventoryMigrationMarker{
 return {id:candidate.id,kind:candidate.kind,path:candidate.path,oldDigest:candidate.oldDigest,newDigest:candidate.newDigest};
}
export function irreversiblePurgeDisclosure(candidate:TableInventoryReviewedChangeCandidate):{code:'IRREVERSIBLE_TABLE_PURGE';path:string;markerId:string;message:string}{
 const old=candidate.oldValue,newValue=candidate.newValue;
 if(candidate.kind!=='table-removal-effects'||!old||typeof old!=='object'||Array.isArray(old)||old.profile!=='umf.table-inventory-review/0.1'||old.side!=='previous'||typeof old.table!=='string'||!old.table||!newValue||typeof newValue!=='object'||Array.isArray(newValue)||newValue.profile!=='umf.table-inventory-review/0.1'||newValue.side!=='next'||newValue.table!==old.table||old.meaning===null||newValue.meaning!==null||canonical(old.effects)!==canonical(effectsRemove)||canonical(newValue.effects)!==canonical(effectsRemove)||!/^\/options\/tableIntents\/\d+\/disposition$/.test(candidate.path)||typeof candidate.oldPath!=='string'||candidate.newPath!==null||candidate.oldDigest!==hashCanonical(old)||candidate.newDigest!==hashCanonical(newValue)||candidate.id!=='review-'+hashCanonical([candidate.kind,candidate.path,candidate.oldDigest,candidate.newDigest]).slice(0,24))fail('TABLE_MIGRATION_REVIEW',candidate.path);
 return {code:'IRREVERSIBLE_TABLE_PURGE',path:candidate.path,markerId:candidate.id,message:'Irreversible purge of all stored rows and columns for table '+old.table+'. Metadata history is not a data backup; this profile performs immediate physical deletion.'};
}
