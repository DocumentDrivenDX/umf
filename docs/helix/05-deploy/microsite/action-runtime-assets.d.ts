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
   close(owner:LocalOwner):Promise<void>;
  }
 };
 export function openBrowserStore(input:{name:string;layoutSql:string}):Promise<StoreOpen>;
}
