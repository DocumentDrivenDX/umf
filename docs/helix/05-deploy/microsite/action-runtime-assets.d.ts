// Consumption surfaces for exact vendored JavaScript assets; no implementation.
declare module '*action-compiler/weft_wasm.js' {
 export default function initialize():Promise<unknown>;
 export class MutationCompiler {
  constructor(configuration:string);
  compile_json(request:string):string;
 }
}
declare module '*truss-browser/store.js' {
 const ownerBrand:unique symbol;
 const actionBrand:unique symbol,grantBrand:unique symbol;
 interface LocalOwner {readonly [ownerBrand]:true}
 export interface LocalAction {readonly [actionBrand]:true}
 export interface SelectionReadGrant {readonly [grantBrand]:true}
 interface Artifact {mediaType:string;utf8:string;sha256:string}
 export interface StoreInfo {storeId:string;incarnation:string}
 const workBrand:unique symbol;
 export interface FrozenWork {readonly [workBrand]:true}
 export interface Materialization {work:FrozenWork;plan:Artifact;manifest:Artifact;count:number;batches:{ordinal:number;start:number;count:number}[]}
 export interface SealReference {profile:'truss-browser-seal-reference/0.1';storeId:string;incarnation:string;requestKey:string;attempt:string;manifestSha256:string;planSha256:string;modelSha256:string}
 export type SealOutcome={outcome:'sealed';reference:SealReference;manifest:Artifact;receipt:Artifact}
 |{outcome:'conflict';code:'request_key_conflict';reference:SealReference}
 |{outcome:'unknown';code:'storage_outcome_unknown';reference:SealReference}
 |{outcome:'unresolved';code:'not_found';reference:SealReference}
 |{outcome:'refused';code:string;control:{requestKey:string;attempt:string};reason:string}
 |{outcome:'failure';code:string;control:{requestKey:string;attempt:string};reference?:SealReference;sqlState?:string;reason:string;settlement:'not_dispatched'|'current_attempt_rolled_back'};
 export interface LoadInput {target:{documentId:string;module:string;record:string};rows:{fields:{module:string;field:string;value:string}[]}[];request:{requestKey:string;attempt:string}}
 export type LoadOutcome={outcome:'loaded';request:{requestKey:string;attempt:string};objects:{id:string;typeId:string;version:string}[];journal:string[]}|{outcome:'refused'|'unresolved'|'conflict'|'unknown'|'failure';code:string;[key:string]:unknown};
 export interface JobRef {namespace:string;id:string}
 export interface SubmitInput {key:string;reference:SealReference;control:{requestKey:string;attempt:string}}
 export interface ClaimInput {job:JobRef;control:{requestKey:string;attempt:string}}
 export interface JobState {status:'queued'|'running'|'reconciling'|'stopped'|'completed'|'cancelled';job:JobRef;manifestSha256:string;nextBatch:number;committedBatches:number;unresolvedBatch:number|null;stop:{batch:number;code:string}|null}
 export type SubmitResult={status:'submitted';state:JobState}|{status:'conflict';code:'TOKEN_REUSE'}|{status:'unsupported';code:string}|{status:'control-unknown';operation:'submit';control:SubmitInput['control']}|{status:'control-failure';operation:'submit';control:SubmitInput['control'];code:'CONTROL_NONCOMMIT';settlement:'current_attempt_rolled_back'}|{status:'unresolved';code:'not_found';operation:'submit';control:SubmitInput['control']};
 export type ClaimResult={status:'claimed';job:JobRef;batch:number;fence:string;leaseUntil:string}|{status:'idle';job:JobRef}|{status:'conflict';code:'TOKEN_REUSE'}|{status:'unsupported';code:string}|{status:'control-unknown';operation:'claim';control:ClaimInput['control']}|{status:'control-failure';operation:'claim';control:ClaimInput['control'];code:'CONTROL_NONCOMMIT';settlement:'current_attempt_rolled_back'}|{status:'unresolved';code:'not_found';operation:'claim';control:ClaimInput['control']};
 export interface ExecuteInput {job:JobRef;batch:number;fence:string}
 export interface ItemResult {ordinal:number;result:{status:'committed';token:string;noOp:boolean;identity:{id:string;typeId:string};version:string;changes:{propertyId:string;before:{string:string};after:{string:string}}[];verification:{profile:'truss-browser-set-verification/0.1';requiredEffects:true;frame:true;keysUnchanged:true}}}
 export type BatchOutcome={status:'committed';job:JobRef;batch:number;manifestSha256:string;items:ItemResult[];receipt:Artifact}|{status:'conflict'|'rejected';job:JobRef;batch:number;code:string;item:number}|{status:'failed';job:JobRef;batch:number;code:string}|{status:'indeterminate';job:JobRef;batch:number}|{status:'unsupported';code:string};
 export type CancelInput=ClaimInput;
 export type CancelResult={status:'cancelled'|'state';state:JobState}|{status:'cancel-requested';job:JobRef}|{status:'unsupported';code:string}|{status:'conflict';code:'TOKEN_REUSE'}|{status:'control-unknown';operation:'cancel';control:ClaimInput['control']}|{status:'control-failure';operation:'cancel';control:ClaimInput['control'];code:'CONTROL_NONCOMMIT';settlement:'current_attempt_rolled_back'}|{status:'unresolved';code:'not_found';operation:'cancel';control:ClaimInput['control']};
 export interface FeedCursor {profile:'truss-browser-feed-cursor/0.1';storeId:string;incarnation:string;afterSeq:string}
 export interface LogicalJournalObject {id:string;typeId:string;version:string;createdAt:string;updatedAt:string;fields:{module:string;field:string;name:string;value:string}[]}
 export type JournalContext={kind:'load';request:ClaimInput['control'];index:string}|{kind:'batch';job:JobRef;batch:number;item:number};
 export interface JournalEntry {context:JournalContext;sequence:string;transactionId:string;at:string;operation:'create'|'property';catalogRevision:string;target:{documentId:string;module:string;record:string};before:LogicalJournalObject|null;after:LogicalJournalObject;change:null|{module:string;field:string;name:string;before:string;after:string};event:Artifact;origin:Artifact}
 export type FeedPage={status:'page';profile:'truss-browser-journal-page/0.1';events:JournalEntry[];cursor:FeedCursor;hasMore:boolean}|{status:'refused';code:'CURSOR_SCOPE'|'READ_LIMIT'|'STORE_NOT_OPEN'};
 export type StoreOpen={outcome:'unavailable';reason:'store_in_use'}|{
  outcome:'available';owner:LocalOwner;store:{
   info(owner:LocalOwner):StoreInfo;
   catalog(owner:LocalOwner):Promise<unknown>;
   registerDocument(owner:LocalOwner,input:{documentId:string;documentRevision:string;sourceUtf8:string}):Promise<unknown>;
   registerAction(owner:LocalOwner,input:{module:string;action:string}):Promise<{action:LocalAction;model:Artifact;modelPin:unknown;actionPin:unknown;preparation:Artifact}>;
   grantSelectionRead(owner:LocalOwner,action:LocalAction):Promise<{grant:SelectionReadGrant;declaration:unknown}>;
   materialize(owner:LocalOwner,action:LocalAction,grant:SelectionReadGrant,input:{sql:string;parameters:Record<string,{string:string}>;batchSize:number;maxItems:number}):Promise<Materialization>;
   seal(owner:LocalOwner,action:LocalAction,grant:SelectionReadGrant,work:FrozenWork,input:{requestKey:string;attempt:string}):Promise<SealOutcome>;
   recoverSeal(owner:LocalOwner,action:LocalAction,grant:SelectionReadGrant,reference:SealReference):Promise<SealOutcome>;
   loadObjects(owner:LocalOwner,input:LoadInput):Promise<LoadOutcome>;
   recoverLoad(owner:LocalOwner,input:LoadInput):Promise<LoadOutcome>;
   readObjects(owner:LocalOwner,target:LoadInput['target']):Promise<{id:string;typeId:string;version:string;fields:{module:string;field:string;value:string}[]}[]>;
   submit(owner:LocalOwner,action:LocalAction,grant:SelectionReadGrant,input:SubmitInput):Promise<SubmitResult>;
   recoverSubmit(owner:LocalOwner,action:LocalAction,grant:SelectionReadGrant,input:SubmitInput):Promise<SubmitResult>;
   claim(owner:LocalOwner,action:LocalAction,grant:SelectionReadGrant,input:ClaimInput):Promise<ClaimResult>;
   recoverClaim(owner:LocalOwner,action:LocalAction,grant:SelectionReadGrant,input:ClaimInput):Promise<ClaimResult>;
   reviewJob(owner:LocalOwner,action:LocalAction,grant:SelectionReadGrant,input:JobRef):Promise<{state:JobState;manifest:Artifact}|{status:'unsupported';code:'JOB_UNAVAILABLE'}>;
   executeBatch(owner:LocalOwner,action:LocalAction,grant:SelectionReadGrant,input:ExecuteInput):Promise<BatchOutcome>;
   recoverBatch(owner:LocalOwner,action:LocalAction,grant:SelectionReadGrant,input:ExecuteInput):Promise<BatchOutcome>;
   cancel(owner:LocalOwner,action:LocalAction,grant:SelectionReadGrant,input:CancelInput):Promise<CancelResult>;
   recoverCancel(owner:LocalOwner,action:LocalAction,grant:SelectionReadGrant,input:CancelInput):Promise<CancelResult>;
   readFeed(owner:LocalOwner,input:{cursor:FeedCursor|null;limit:number}):Promise<FeedPage>;
   close(owner:LocalOwner):Promise<void>;
  }
 };
 export function openBrowserStore(input:{name:string;layoutSql:string}):Promise<StoreOpen>;
}
