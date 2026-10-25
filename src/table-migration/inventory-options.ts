import {canonical,hashCanonical,sha256Text} from '../compilation/bundle/hash';
import {verifyTableDeployment,type TableDeploymentBundle} from '../table-deployment';
import {verifyTableMigration} from './index';
import {validateG05SourceSelections} from './inventory-g05-selection';
import type {AccountingContext} from '../model/internal/accounting-context';
import {hashCanonicalCharged,sha256TextCharged} from '../compilation/bundle/hash';
/** Closed G10 request/history admission. Semantic source/prefix validation,
 * component composition and native authority remain separate compiler gates.
 */
export type Json = null|boolean|number|string|Json[]|{[key:string]:Json};
export type Ref={module:string;element:string};
export type TableIntent={kind:'create';table:string;record:Ref}|{kind:'remove';table:string;record:Ref;disposition:{mode:'irreversible-purge';reviewMarker:string}};
export type G10Recovery={mode:'irreversible';reviewMarker:string}|{mode:'retained-originals';policy:{id:string;revision:string}}|{mode:'round-trip';proofProfile:'umf.exact-integer-widening-roundtrip/0.1'};
export interface G10Conversion {table:string;field:Ref;recipe:{version:'umf.conversion-recipe/0.1';kind:string;parameters:Record<string,unknown>};nulls:'preserve';invalid:'abort';recovery:G10Recovery}
export interface G10Options {tableIntents:TableIntent[];backfills:unknown[];defaultChanges:unknown[];conversions:G10Conversion[];concurrentIndexes:unknown[];validations:unknown[];reviewedChanges:unknown[];seedSets:string[];retiredSeedSets:string[];retirements:unknown[];restorations:unknown[];archiveSources:unknown[]}
export interface G10ValidatedRequest {id:string;predecessor:{id:string;digest:string}|null;previous:TableDeploymentBundle|null;next:TableDeploymentBundle;options:G10Options;history:{profile:'umf.table-inventory-source-history/0.1';plans:unknown[];executions:{planDigest:string;entryDigest:string;seedOutcomes:unknown[]}[]}}
export type HistoricalG10PlanVerifier=(plan:unknown,index:number,priorHistory:G10ValidatedRequest['history'])=>void;
export class ShapeError extends Error { constructor(readonly path:string,code:string){super(code);} }
const isObject=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&(Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);
const exact=(v:unknown,keys:string[]):v is Record<string,any>=>isObject(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const safeInt=(v:unknown,min:number,max:number):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max;
const hash=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);
const nonempty=(v:unknown,max=256):v is string=>typeof v==='string'&&v.length>0&&new TextEncoder().encode(v).length<=max&&!v.includes('\0');
// G04's adopted policy selector bounds JavaScript string length, not UTF-8 bytes.
const g04Nonempty=(v:unknown,max=256):v is string=>typeof v==='string'&&v.length>0&&v.length<=max;
function need(ok:unknown,path:string,code:string):asserts ok {if(!ok)throw new ShapeError(path,code);}
function validateRef(v:unknown,path:string):asserts v is Ref {need(exact(v,['module','element'])&&nonempty(v.module)&&nonempty(v.element),path,'ref-invalid');}
function unique<T>(items:T[],key:(x:T)=>string,path:string,accounting?:AccountingContext):void {const seen=new Set<string>();items.forEach((x,i)=>{accounting?.visit('g10-options-unique-key',`${path}/${i}`,2);const k=key(x);need(!seen.has(k),`${path}/${i}`,'duplicate-selection');seen.add(k);});}

const optionsKeys=['version','tableIntents','backfills','defaultChanges','conversions','concurrentIndexes','validations','reviewedChanges','seedSets','retiredSeedSets','retirements','restorations','archiveSources'];
function validateRecovery(value:unknown,path:string):asserts value is G10Recovery {
 if(isObject(value)&&value.mode==='irreversible')need(exact(value,['mode','reviewMarker'])&&nonempty(value.reviewMarker),path,'recovery-invalid');
 else if(isObject(value)&&value.mode==='retained-originals')need(exact(value,['mode','policy'])&&exact(value.policy,['id','revision'])&&g04Nonempty(value.policy.id,256)&&g04Nonempty(value.policy.revision,256),path,'recovery-invalid');
 else if(isObject(value)&&value.mode==='round-trip')need(exact(value,['mode','proofProfile'])&&value.proofProfile==='umf.exact-integer-widening-roundtrip/0.1',path,'recovery-invalid');
 else throw new ShapeError(path,'recovery-invalid');
}
function validateOptions(o:unknown,accounting?:AccountingContext):G10Options {
 need(exact(o,optionsKeys)&&o.version==='umf.table-inventory-migration-options/0.1','/options','options-profile-or-keys');
 const caps:Record<string,number>={tableIntents:512,backfills:256,defaultChanges:256,conversions:256,concurrentIndexes:256,validations:256,reviewedChanges:2048,seedSets:128,retiredSeedSets:256,retirements:256,restorations:256,archiveSources:64};
 for(const [key,max] of Object.entries(caps)){need(Array.isArray(o[key])&&o[key].length<=max,`/options/${key}`,'array-bound');accounting?.visit('g10-options-array-admission',`/options/${key}`,o[key].length);}
 need(o.tableIntents.filter((x:any)=>x?.kind==='create').length<=256&&o.tableIntents.filter((x:any)=>x?.kind==='remove').length<=256,'/options/tableIntents','table-intent-bound');
 const tableIntents:TableIntent[]=o.tableIntents.map((x:unknown,i:number)=>{const p=`/options/tableIntents/${i}`;accounting?.visit('g10-options-intent-validation',p);if(!isObject(x))throw new ShapeError(p,'table-intent-invalid');if(x.kind==='create'){need(exact(x,['kind','table','record'])&&nonempty(x.table),p,'table-intent-invalid');validateRef(x.record,p+'/record');return {kind:'create',table:x.table,record:{module:x.record.module,element:x.record.element}};}if(x.kind==='remove'){need(exact(x,['kind','table','record','disposition'])&&nonempty(x.table)&&exact(x.disposition,['mode','reviewMarker'])&&x.disposition.mode==='irreversible-purge'&&nonempty(x.disposition.reviewMarker),p,'table-intent-invalid');validateRef(x.record,p+'/record');return {kind:'remove',table:x.table,record:{module:x.record.module,element:x.record.element},disposition:{mode:'irreversible-purge',reviewMarker:x.disposition.reviewMarker}};}throw new ShapeError(p,'table-intent-invalid');});
 unique(tableIntents,(x)=>JSON.stringify([x.kind,x.table]),'/options/tableIntents',accounting);
 o.backfills.forEach((x:any,i:number)=>{const p=`/options/backfills/${i}`;accounting?.visit('g10-options-backfill',p);need(exact(x,['table','column','operation','scopedRows'])&&nonempty(x.table)&&nonempty(x.operation)&&x.scopedRows===true,p,'backfill-invalid');validateRef(x.column,p+'/column');});
 o.defaultChanges.forEach((x:any,i:number)=>{const p=`/options/defaultChanges/${i}`;need(exact(x,['table','field'])&&nonempty(x.table),p,'default-change-invalid');validateRef(x.field,p+'/field');});
 o.conversions.forEach((x:any,i:number)=>{const p=`/options/conversions/${i}`;need(exact(x,['table','field','recipe','nulls','invalid','recovery'])&&nonempty(x.table)&&x.nulls==='preserve'&&x.invalid==='abort',p,'conversion-invalid');validateRef(x.field,p+'/field');const r=x.recipe;need(exact(r,['version','kind','parameters'])&&r.version==='umf.conversion-recipe/0.1'&&isObject(r.parameters),p+'/recipe','recipe-invalid');const empty=['numeric-exact','text-date','date-text','text-instant','instant-text','text-uuid','uuid-text'].includes(r.kind);if(empty)need(exact(r.parameters,[]),p+'/recipe/parameters','recipe-parameters-invalid');else if(r.kind==='numeric-rescale')need(exact(r.parameters,['rounding'])&&['half-even','toward-zero'].includes(r.parameters.rounding),p+'/recipe/parameters','recipe-parameters-invalid');else if(r.kind==='date-instant')need(exact(r.parameters,['at','offset'])&&r.parameters.at==='00:00:00'&&r.parameters.offset==='Z',p+'/recipe/parameters','recipe-parameters-invalid');else if(r.kind==='instant-date')need(exact(r.parameters,['time','offset'])&&['require-midnight','discard'].includes(r.parameters.time)&&r.parameters.offset==='Z',p+'/recipe/parameters','recipe-parameters-invalid');else if(r.kind==='text-boolean'||r.kind==='boolean-text')need(exact(r.parameters,['trueToken','falseToken'])&&nonempty(r.parameters.trueToken,128)&&nonempty(r.parameters.falseToken,128)&&r.parameters.trueToken!==r.parameters.falseToken,p+'/recipe/parameters','recipe-parameters-invalid');else throw new ShapeError(p+'/recipe/kind','recipe-kind-invalid');validateRecovery(x.recovery,p+'/recovery');});
 unique(o.conversions,(x:any)=>JSON.stringify([x.table,x.field.module,x.field.element]),'/options/conversions',accounting);
 o.concurrentIndexes.forEach((x:any,i:number)=>need(exact(x,['table','index'])&&nonempty(x.table)&&nonempty(x.index),`/options/concurrentIndexes/${i}`,'index-selection-invalid'));
 o.validations.forEach((x:any,i:number)=>need(exact(x,['table','constraint','kind'])&&nonempty(x.table)&&nonempty(x.constraint)&&['check','foreignKey'].includes(x.kind),`/options/validations/${i}`,'validation-invalid'));
 const markerKinds=['drop-column','rename-column','change-column-type','tighten-not-null','relax-not-null','replace-check','replace-foreign-key','replace-index','replace-primary-key','change-policy','change-default','change-operation','change-operation-context','create-table','remove-table','table-removal-effects','retire-seed-history','conversion-effects'];
 o.reviewedChanges.forEach((x:any,i:number)=>{const p=`/options/reviewedChanges/${i}`;need(exact(x,['id','kind','path','oldDigest','newDigest'])&&nonempty(x.id,128)&&markerKinds.includes(x.kind)&&typeof x.path==='string'&&x.path.startsWith('/')&&hash(x.oldDigest)&&hash(x.newDigest),p,'review-marker-invalid');});
 for(const key of ['seedSets','retiredSeedSets']){o[key].forEach((v:any,i:number)=>{accounting?.visit('g10-options-seed-selection',`/options/${key}/${i}`);need(nonempty(v,256),`/options/${key}/${i}`,'seed-id-invalid');});unique(o[key],(v:string)=>v,`/options/${key}`,accounting);}
 o.retirements.forEach((x:any,i:number)=>{const p=`/options/retirements/${i}`;need(exact(x,['table','field','retention'])&&nonempty(x.table)&&exact(x.retention,['policyId','policyRevision','minimumRetentionMs'])&&nonempty(x.retention.policyId,128)&&safeInt(x.retention.policyRevision,1,Number.MAX_SAFE_INTEGER)&&safeInt(x.retention.minimumRetentionMs,0,315360000000),p,'retirement-invalid');validateRef(x.field,p+'/field');});
 o.restorations.forEach((x:any,i:number)=>{const p=`/options/restorations/${i}`;need(exact(x,['table','field','archive','newInstances'])&&nonempty(x.table),p,'restoration-invalid');validateRef(x.field,p+'/field');const a=x.archive;need(exact(a,['profile','providerId','archiveId','tableToken','targetCustody','retirementPlanDigest','retirementSourceDigest','fieldMeaningDigest'])&&a.profile==='umf.retired-field-archive-ref/0.1'&&[a.providerId,a.archiveId,a.tableToken].every((v:any)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v))&&hash(a.retirementPlanDigest)&&hash(a.retirementSourceDigest)&&hash(a.fieldMeaningDigest),p+'/archive','archive-ref-invalid');const n=x.newInstances;need(isObject(n)&&(n.mode==='refuse'&&exact(n,['mode'])||n.mode==='null'&&exact(n,['mode'])||n.mode==='fill'&&exact(n,['mode','expression'])&&isObject(n.expression)),p+'/newInstances','new-instances-invalid');});
 let archiveBytes=0;const archiveDigests:string[]=[];
 o.archiveSources.forEach((x:any,i:number)=>{const p=`/options/archiveSources/${i}`;accounting?.visit('g10-options-archive-validation',p);need(exact(x,['digest','source'])&&hash(x.digest)&&exact(x.source,['format','utf8'])&&x.source.format==='json'&&typeof x.source.utf8==='string',p,'archive-source-invalid');const bytes=accounting?accounting.scanUtf8(x.source.utf8,p+'/source/utf8'):new TextEncoder().encode(x.source.utf8).byteLength;need(bytes<=1048576,p+'/source/utf8','archive-source-too-large');need((accounting?sha256TextCharged(x.source.utf8,1048576,accounting,p+'/digest'):sha256Text(x.source.utf8,1048576))===x.digest,p+'/digest','archive-source-digest-mismatch');archiveBytes+=bytes;archiveDigests.push(x.digest);});
 unique(archiveDigests,x=>x,'/options/archiveSources',accounting);need(archiveBytes<=4194304,'/options/archiveSources','archive-aggregate-too-large');const optionsCanonical=accounting?canonicalCharged(o,accounting,'/options'):canonical(o);need(new TextEncoder().encode(optionsCanonical).byteLength<=6291456,'/options','options-too-large');
 return {tableIntents,backfills:o.backfills,defaultChanges:o.defaultChanges,conversions:o.conversions as G10Conversion[],concurrentIndexes:o.concurrentIndexes,validations:o.validations,reviewedChanges:o.reviewedChanges,seedSets:o.seedSets as string[],retiredSeedSets:o.retiredSeedSets as string[],retirements:o.retirements,restorations:o.restorations,archiveSources:o.archiveSources};
}
function validateHistory(h:unknown,previous:TableDeploymentBundle|null,predecessor:unknown,verifyG10?:HistoricalG10PlanVerifier,accounting?:AccountingContext):G10ValidatedRequest['history'] {
 need(exact(h,['profile','plans','executions'])&&h.profile==='umf.table-inventory-source-history/0.1'&&Array.isArray(h.plans)&&Array.isArray(h.executions)&&h.plans.length<=128&&h.executions.length===h.plans.length,'/history','history-profile-or-count');
 const historyCanonical=accounting?canonicalCharged(h,accounting,'/history'):canonical(h);
 need(new TextEncoder().encode(historyCanonical).byteLength<=25165824,'/history','history-too-large');
 const ids=new Set<string>(),digests=new Set<string>(),seenSeeds=new Set<string>();
 h.plans.forEach((p:any,i:number)=>{const path=`/history/plans/${i}`;accounting?.charge('historyMember',1,path);need(isObject(p)&&nonempty(p.id,128)&&hash(p.digest)&&nonempty(p.version,128)&&hash(p.toBundleDigest)&&(p.fromBundleDigest===null||hash(p.fromBundleDigest)),path,'historical-plan-header-invalid');need(!ids.has(p.id)&&!digests.has(p.digest),path,'historical-plan-duplicate');accounting?.visit('g10-history-id-and-digest-set',path,2);ids.add(p.id);digests.add(p.digest);if(i===0)need(p.predecessor===null,path+'/predecessor','history-chain-invalid');else{const prev=h.plans[i-1];need(exact(p.predecessor,['id','digest'])&&p.predecessor.id===prev.id&&p.predecessor.digest===prev.digest,path+'/predecessor','history-chain-invalid');need(hash(p.fromBundleDigest)&&hash(p.toBundleDigest)&&p.fromBundleDigest===prev.toBundleDigest,path+'/fromBundleDigest','history-bundle-chain-invalid');}
 if(p.version==='umf.table-inventory-migration/0.1'){need(typeof verifyG10==='function',path,'historical-g10-context-required');verifyG10(p,i,{profile:h.profile,plans:h.plans.slice(0,i),executions:h.executions.slice(0,i)});}else{if(accounting)throw new ShapeError(path,'r2-unsupported-metered-history-family');const plan=verifyTableMigration(p);need(plan.digest===p.digest,path+'/digest','historical-plan-verification-failed');}const e=h.executions[i],ep=`/history/executions/${i}`;need(exact(e,['planDigest','entryDigest','seedOutcomes'])&&e.planDigest===p.digest&&hash(e.entryDigest)&&Array.isArray(e.seedOutcomes),ep,'history-execution-invalid');
 const seedIds=new Set<string>();e.seedOutcomes.forEach((s:any,j:number)=>{const sp=`${ep}/seedOutcomes/${j}`;accounting?.charge('historyMember',1,sp);need(exact(s,['id','definitionDigest','originalSourceDigest','execution','proof'])&&nonempty(s.id,256)&&hash(s.definitionDigest)&&hash(s.originalSourceDigest)&&s.execution==='confirmed',sp,'seed-outcome-invalid');need(!seedIds.has(s.id)&&!seenSeeds.has(s.id),sp,'seed-outcome-duplicate');accounting?.visit('g10-history-seed-outcome-set',sp,2);seedIds.add(s.id);seenSeeds.add(s.id);const q=s.proof;need(isObject(q),sp+'/proof','seed-proof-invalid');if(q.kind==='atomic-publication')need(exact(q,['kind','entryDigest'])&&hash(q.entryDigest)&&q.entryDigest===e.entryDigest,sp+'/proof','seed-proof-invalid');else if(q.kind==='phase')need(exact(q,['kind','phaseId','phaseDigest','phaseReceiptDigest','entryDigest'])&&nonempty(q.phaseId,128)&&hash(q.phaseDigest)&&hash(q.phaseReceiptDigest)&&hash(q.entryDigest)&&q.entryDigest===e.entryDigest,sp+'/proof','seed-proof-invalid');else throw new ShapeError(sp+'/proof','seed-proof-invalid');});
 });
 if(previous===null){need(predecessor===null&&h.plans.length===0,'/history','initial-history-not-empty');}
 else {need(isObject(predecessor)&&h.plans.length>0,'/history','installed-history-required');const last=h.plans.at(-1);need(last.id===predecessor.id&&last.digest===predecessor.digest&&last.toBundleDigest===previous.bundleDigest,'/history','history-terminal-does-not-match-predecessor');}
 return {profile:h.profile,plans:h.plans,executions:h.executions.map((execution:any)=>({planDigest:execution.planDigest,entryDigest:execution.entryDigest,seedOutcomes:execution.seedOutcomes}))};
}
function validateBundleEnvelope(v:unknown,path:string,accounting?:AccountingContext):TableDeploymentBundle {
 const keys=['version','canonicalization','source','sourceDigest','configuration','configurationDigest','module','profile','steps','expectedCatalog','seedSets','bundleDigest','nativeQualified'];
 const sourceDigest=accounting&&isObject(v)&&isObject(v.source)&&typeof v.source.utf8==='string'?sha256TextCharged(v.source.utf8,33554432,accounting,`${path}/source/utf8`):isObject(v)&&isObject(v.source)&&typeof v.source.utf8==='string'?sha256Text(v.source.utf8):null;
 const configurationDigest=accounting&&isObject(v)&&isObject(v.configuration)?hashCanonicalCharged(v.configuration,accounting,`${path}/configuration`):isObject(v)&&isObject(v.configuration)?hashCanonical(v.configuration):null;
 need(exact(v,keys)&&['umf.table-deployment/0.1','umf.table-deployment/0.2'].includes(v.version)&&v.canonicalization==='RFC8785'&&exact(v.source,['format','utf8'])&&['json','yaml'].includes(v.source.format)&&typeof v.source.utf8==='string'&&hash(v.sourceDigest)&&sourceDigest===v.sourceDigest&&isObject(v.configuration)&&hash(v.configurationDigest)&&configurationDigest===v.configurationDigest&&nonempty(v.module)&&v.profile==='postgresql18/0.1'&&Array.isArray(v.expectedCatalog?.tables)&&Array.isArray(v.expectedCatalog?.columns)&&Array.isArray(v.expectedCatalog?.keys)&&Array.isArray(v.expectedCatalog?.checks)&&Array.isArray(v.expectedCatalog?.foreignKeys)&&Array.isArray(v.expectedCatalog?.indexes)&&Array.isArray(v.steps)&&Array.isArray(v.seedSets)&&v.nativeQualified===false&&hash(v.bundleDigest),path,'deployment-bundle-envelope-invalid');
 const catalogKeys=Object.hasOwn(v.expectedCatalog,'comments')?['comments','tables','columns','keys','checks','foreignKeys','indexes']:['tables','columns','keys','checks','foreignKeys','indexes'];
 need(exact(v.expectedCatalog,catalogKeys),`${path}/expectedCatalog`,'catalog-envelope-invalid');
 if(Object.hasOwn(v.expectedCatalog,'comments'))need(Array.isArray(v.expectedCatalog.comments),`${path}/expectedCatalog/comments`,'comments-invalid');
 return accounting?verifyTableDeploymentWithAccounting(v as TableDeploymentBundle,accounting).bundle:verifyTableDeployment(v);
}
export function validateG10RequestShape(request:unknown,verifyG10?:HistoricalG10PlanVerifier,accounting?:AccountingContext):G10ValidatedRequest {
 need(exact(request,['id','predecessor','previous','next','options','history'])&&nonempty(request.id,128),'/','request-shape-invalid');
 // `exact` has established the closed envelope; keep the narrowed record local
 // and construct each validated output instead of forwarding untrusted values.
 const r=request;
 const id=r.id;
 let predecessor:G10ValidatedRequest['predecessor']=null;
 let previous:TableDeploymentBundle|null=null;
 if(r.previous===null)need(r.predecessor===null,'/predecessor','initial-pair-invalid');else{need(isObject(r.predecessor)&&exact(r.predecessor,['id','digest'])&&nonempty(r.predecessor.id,128)&&hash(r.predecessor.digest),'/predecessor','predecessor-invalid');predecessor={id:r.predecessor.id,digest:r.predecessor.digest};previous=validateBundleEnvelope(r.previous,'/previous',accounting);need(previous.source.format==='json','/previous/source/format','g10-json-required');}
 const next=validateBundleEnvelope(r.next,'/next',accounting);need(next.source.format==='json','/next/source/format','g10-json-required');
 accounting?.visit('g10-request-validation','/',6);
 const options=validateOptions(r.options,accounting),history=validateHistory(r.history,previous,predecessor,verifyG10,accounting);
 validateG05SourceSelections(previous,next,options);
 return {id,predecessor,previous,next,options,history};
}

/** Validate a complete original history against its installed source terminal. */
export function validateTableInventorySourceHistory(value:unknown,previous:TableDeploymentBundle|null,verifyG10?:HistoricalG10PlanVerifier,accounting?:AccountingContext):TableInventorySourceHistory{
 const plans=isObject(value)&&Array.isArray(value.plans)?value.plans:[];
 const last=plans.at(-1);
 const predecessor=previous===null?null:isObject(last)&&typeof last.id==='string'&&typeof last.digest==='string'?{id:last.id,digest:last.digest}:null;
 return validateHistory(value,previous,predecessor,verifyG10,accounting) as TableInventorySourceHistory;
}


/** Closed discovery-only selector. It deliberately has no review marker strings. */
export interface TableInventoryDiscoverySelector {
 version:'umf.table-inventory-discovery/0.1';
 tableIntents:TableInventoryDiscoveryIntent[];
 conversions:TableInventoryDiscoveryConversion[];
 retiredSeedSets:string[];
 retirements:TableInventoryRetirement[];
 restorations:TableInventoryRestoration[];
 archiveSources:TableInventoryArchiveSource[];
}
export type TableInventoryReference={module:string;element:string};
export type TableInventoryTableIntent=
 |{kind:'create';table:string;record:TableInventoryReference}
 |{kind:'remove';table:string;record:TableInventoryReference;disposition:{mode:'irreversible-purge';reviewMarker:string}};
export type TableInventoryDiscoveryIntent=
 |{kind:'create';table:string;record:TableInventoryReference}
 |{kind:'remove';table:string;record:TableInventoryReference;disposition:{mode:'irreversible-purge'}};
export type TableInventoryDiscoveryConversion=Omit<TableInventoryConversion,'recovery'> & {recovery:{mode:'irreversible'}|Exclude<TableInventoryConversion['recovery'],{mode:'irreversible'}>};
export interface TableInventoryConversion {table:string;field:TableInventoryReference;recipe:{version:'umf.conversion-recipe/0.1';kind:string;parameters:import('../model/types').JsonObject};nulls:'preserve';invalid:'abort';recovery:{mode:'irreversible';reviewMarker:string}|{mode:'retained-originals';policy:{id:string;revision:string}}|{mode:'round-trip';proofProfile:'umf.exact-integer-widening-roundtrip/0.1'}}
export interface TableInventoryRetirement {table:string;field:TableInventoryReference;retention:{policyId:string;policyRevision:number;minimumRetentionMs:number}}
export interface TableInventoryArchiveSource {digest:string;source:{format:'json';utf8:string}}
export interface TableInventoryRestoration {table:string;field:TableInventoryReference;archive:{profile:'umf.retired-field-archive-ref/0.1';providerId:string;archiveId:string;tableToken:string;targetCustody:import('../model/types').Json;retirementPlanDigest:string;retirementSourceDigest:string;fieldMeaningDigest:string};newInstances:{mode:'refuse'}|{mode:'null'}|{mode:'fill';expression:import('../model/types').Json}}
export type TableInventoryReviewedChangeKind='drop-column'|'rename-column'|'change-column-type'|'tighten-not-null'|'relax-not-null'|'replace-check'|'replace-foreign-key'|'replace-index'|'replace-primary-key'|'change-policy'|'change-default'|'change-operation'|'change-operation-context'|'create-table'|'remove-table'|'table-removal-effects'|'retire-seed-history'|'conversion-effects';
export interface TableInventoryMigrationMarker {id:string;kind:TableInventoryReviewedChangeKind;path:string;oldDigest:string;newDigest:string}
export interface TableInventoryMigrationOptions {
 version:'umf.table-inventory-migration-options/0.1';
 tableIntents:TableInventoryTableIntent[];
 backfills:{table:string;column:TableInventoryReference;operation:string;scopedRows:true}[];
 defaultChanges:{table:string;field:TableInventoryReference}[];
 conversions:TableInventoryConversion[];
 concurrentIndexes:{table:string;index:string}[];
 validations:{table:string;constraint:string;kind:'check'|'foreignKey'}[];
 reviewedChanges:TableInventoryMigrationMarker[];
 seedSets:string[];retiredSeedSets:string[];
 retirements:TableInventoryRetirement[];restorations:TableInventoryRestoration[];archiveSources:TableInventoryArchiveSource[];
}
export interface TableInventoryHistoryExecution {planDigest:string;entryDigest:string;seedOutcomes:TableInventorySeedOutcome[]}
export interface TableInventorySeedOutcome {id:string;definitionDigest:string;originalSourceDigest:string;execution:'confirmed';proof:{kind:'atomic-publication';entryDigest:string}|{kind:'phase';phaseId:string;phaseDigest:string;phaseReceiptDigest:string;entryDigest:string}}
export type TableInventoryHistoryPlan=import('./inventory').TableInventoryMigrationPlan|import('./index').TableMigrationPlan;
export interface TableInventorySourceHistory {profile:'umf.table-inventory-source-history/0.1';plans:TableInventoryHistoryPlan[];executions:TableInventoryHistoryExecution[]}
export interface TableInventoryMigrationRequest {id:string;predecessor:{id:string;digest:string}|null;previous:TableDeploymentBundle|null;next:TableDeploymentBundle;options:TableInventoryMigrationOptions;history:TableInventorySourceHistory}
