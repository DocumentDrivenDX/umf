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
 export type StoreOpen={outcome:'unavailable';reason:'store_in_use'}|{
  outcome:'available';owner:LocalOwner;store:{
   info(owner:LocalOwner):unknown;
   catalog(owner:LocalOwner):Promise<unknown>;
   registerDocument(owner:LocalOwner,input:{documentId:string;documentRevision:string;sourceUtf8:string}):Promise<unknown>;
   registerAction(owner:LocalOwner,input:{module:string;action:string}):Promise<{action:LocalAction;model:Artifact;modelPin:unknown;actionPin:unknown;preparation:Artifact}>;
   grantSelectionRead(owner:LocalOwner,action:LocalAction):Promise<{grant:SelectionReadGrant;declaration:unknown}>;
   close(owner:LocalOwner):Promise<void>;
  }
 };
 export function openBrowserStore(input:{name:string;layoutSql:string}):Promise<StoreOpen>;
}
