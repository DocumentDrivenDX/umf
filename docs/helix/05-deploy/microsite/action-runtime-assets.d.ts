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
 interface LocalOwner {readonly [ownerBrand]:true}
 export type StoreOpen={outcome:'unavailable';reason:'store_in_use'}|{
  outcome:'available';owner:LocalOwner;store:{
   info(owner:LocalOwner):unknown;
   catalog(owner:LocalOwner):Promise<unknown>;
   registerDocument(owner:LocalOwner,input:{documentId:string;documentRevision:string;sourceUtf8:string}):Promise<unknown>;
   close(owner:LocalOwner):Promise<void>;
  }
 };
 export function openBrowserStore(input:{name:string;layoutSql:string}):Promise<StoreOpen>;
}
