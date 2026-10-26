// SPDX-License-Identifier: MIT OR Apache-2.0
/** One-shot reuse of a complete, metered source recompilation inside G10 admission. */
import {canonicalCharged} from '../compilation/bundle/hash';
import {ownCanonicalComponent,type InventoryComponentJson} from './inventory-component-copy';
import {verifyTableDeploymentWithAccounting,type TableDeploymentBundle} from '../table-deployment';
import type {AccountingContext} from '../model/internal/accounting-context';

type VerifiedDeployment=ReturnType<typeof verifyTableDeploymentWithAccounting>;
type FrozenBundle=TableDeploymentBundle;
type CacheEntry={canonical:string;bundle:FrozenBundle};
type VerificationScope={byIndex:Map<string,CacheEntry[]>;slots:number};
const completed=new WeakMap<object,{accounting:AccountingContext;result:VerifiedDeployment}>();
const scopes=new WeakMap<object,VerificationScope>();
const MAX_RETAINED_BUNDLES=2*(128+1);
const BUNDLE_COPY_BYTES=25_165_824;

/** Fixed synchronous invocation scope. Nested fixed compiler entries reuse it. */
export function withVerifiedG10BundleScope<T>(accounting:AccountingContext,body:()=>T):T{
 const existing=scopes.get(accounting as object);if(existing)return body();
 const scope:VerificationScope={byIndex:new Map(),slots:0};scopes.set(accounting as object,scope);
 try{return body();}finally{scopes.delete(accounting as object);}
}
function freezeBundle(value:InventoryComponentJson,accounting:AccountingContext,path:string):InventoryComponentJson{
 const active=new Set<object>();
 const freeze=(item:InventoryComponentJson,at:string):void=>{
  if(item===null||typeof item!=='object')return;
  if(active.has(item))throw new TypeError(`R2_VERIFIED_BUNDLE_CYCLE:${at}`);
  accounting.visit('r2-verified-bundle-freeze-container',at);
  accounting.visit('r2-verified-bundle-freeze-active-entry',at);
  active.add(item);
  if(Array.isArray(item)){
   accounting.visit('r2-verified-bundle-freeze-array',at,item.length);
   for(let index=0;index<item.length;index++)freeze(item[index]!,`${at}/${index}`);
  }else{
   let count=0;
   for(const key in item)if(Object.hasOwn(item,key)){
    accounting.visit('r2-verified-bundle-freeze-key-count',at);
    count++;
   }
   accounting.visit('r2-verified-bundle-freeze-object',at,count+1);
   accounting.visit('r2-verified-bundle-freeze-keys-carrier',at,count);
   const keys=Object.keys(item);
   for(const key of keys){accounting.scanUtf8(key,at);freeze(item[key]!,`${at}/${key}`);}
  }
  Object.freeze(item);active.delete(item);
 };
 freeze(value,path);return value;
}
function sameCanonical(left:string,right:string,accounting:AccountingContext,path:string):boolean{
 if(left.length!==right.length)return false;
 accounting.visit('r2-verified-bundle-canonical-compare',path,Math.max(1,Math.ceil(left.length/4096)));
 for(let index=0;index<left.length;index++)if(left.charCodeAt(index)!==right.charCodeAt(index))return false;
 return true;
}
function storeVerifiedBundle(canonical:string,bundle:TableDeploymentBundle,accounting:AccountingContext,path:string,alreadyOwned=false):void{
 const scope=scopes.get(accounting as object);if(!scope||scope.slots>=MAX_RETAINED_BUNDLES)return;
 const index=bundle.bundleDigest;
 accounting.visit('r2-verified-bundle-cache-index-lookup',path);
 const indexBytes=accounting.scanUtf8(index,`${path}/cache-index`);
 const bucket=scope.byIndex.get(index);if(bucket){for(const entry of bucket)if(sameCanonical(canonical,entry.canonical,accounting,`${path}/existing-canonical-compare`))return;}
 const copied=alreadyOwned?bundle as unknown as InventoryComponentJson:ownCanonicalComponent(bundle,path,BUNDLE_COPY_BYTES,accounting);
 const frozenCopy=freezeBundle(copied,accounting,path);
 const copiedCanonical=canonicalCharged(frozenCopy,accounting,`${path}/frozen-canonical`);
 if(!sameCanonical(canonical,copiedCanonical,accounting,`${path}/frozen-canonical-compare`))throw new TypeError(`R2_VERIFIED_BUNDLE_COPY_MISMATCH:${path}`);
 const frozen=frozenCopy as unknown as FrozenBundle;
 const bytes=accounting.scanUtf8(canonical,`${path}/cache-key`);accounting.retainBytes('r2-verified-bundle-cache-key',bytes,`${path}/cache-key`);
 accounting.visit('r2-verified-bundle-cache-entry',path);
 accounting.retainBytes('r2-verified-bundle-cache-index',indexBytes,`${path}/cache-index`);
 accounting.visit('r2-verified-bundle-cache-entry-array-slot',path);accounting.visit('r2-verified-bundle-cache-entry-object',path);
 const entry={canonical,bundle:frozen};if(bucket)bucket.push(entry);else{const entries:CacheEntry[]=[];scope.byIndex.set(index,entries);entries.push(entry);}scope.slots++;
}
function cachedBundleBucket(digest:unknown,accounting:AccountingContext,path:string):CacheEntry[]|undefined{
 const scope=scopes.get(accounting as object);if(!scope||typeof digest!=='string')return undefined;
 accounting.visit('r2-verified-bundle-cache-index-lookup',path);
 accounting.scanUtf8(digest,`${path}/cache-index`);
 return scope.byIndex.get(digest);
}
function cachedBundle(canonical:string,entries:readonly CacheEntry[],accounting:AccountingContext,path:string):FrozenBundle|undefined{
 for(const entry of entries)if(sameCanonical(canonical,entry.canonical,accounting,`${path}/canonical-compare`))return entry.bundle;
 return undefined;
}
/** Read-only full-content query; the digest only selects a bounded bucket. */
export function lookupVerifiedG10Bundle(digest:string,canonicalCandidate:string|undefined,accounting:AccountingContext,path:string):{readonly indexed:boolean;readonly bundle?:TableDeploymentBundle}{
 const bucket=cachedBundleBucket(digest,accounting,path);if(!bucket){accounting.visit('r2-verified-bundle-cache-query-result',path);return Object.freeze({indexed:false});}
 if(canonicalCandidate===undefined){accounting.visit('r2-verified-bundle-cache-query-result',path);return Object.freeze({indexed:true});}
 const bundle=cachedBundle(canonicalCandidate,bucket,accounting,path);
 if(!bundle||bundle.bundleDigest!==digest){accounting.visit('r2-verified-bundle-cache-query-result',path);return Object.freeze({indexed:true});}
 accounting.visit('r2-verified-bundle-cache-hit',path);
 accounting.visit('r2-verified-bundle-cache-result-retention',path);
 return Object.freeze({indexed:true,bundle});
}


/** Fixed complete verifier and scope publisher; caller data never supplies a result. */
function verifyCompleteAndStore(input:TableDeploymentBundle,accounting:AccountingContext,path:string,retainVerifierOutput:boolean,expectedDigest?:InventoryComponentJson):VerifiedDeployment{
 const result=verifyTableDeploymentWithAccounting(input,accounting);
 if(expectedDigest!==undefined&&result.bundle.bundleDigest!==expectedDigest)throw new TypeError(`R2_VERIFIED_BUNDLE_DIGEST_MISMATCH:${path}`);
 storeVerifiedBundle(result.inputCanonical,result.bundle,accounting,path,retainVerifierOutput);
 return result;
}
/** Store only after the original verifier has completed every source and equality check. */
export function verifyAndRememberG10Deployment(input:TableDeploymentBundle,accounting:AccountingContext):TableDeploymentBundle{
 const result=verifyCompleteAndStore(input,accounting,'/verified-bundle-cache',false);
 completed.set(result.bundle,{accounting,result});
 return result.bundle;
}

/** Consume once, for the exact validated bundle and same meter; changed bytes refuse. */
export function consumeVerifiedG10Deployment(input:TableDeploymentBundle,accounting:AccountingContext,path:string):VerifiedDeployment|undefined{
 const result=completed.get(input);
 if(!result)return undefined;
 if(result.accounting!==accounting)return undefined;
 completed.delete(input);
 if(canonicalCharged(input,accounting,`${path}/verified-input`)!==result.result.inputCanonical)throw new Error(`R2_VERIFIED_BUNDLE_CHANGED:${path}`);
 return result.result;
}


/** Metered envelope reuse. Hits return only the frozen bundle, never verifier auxiliaries. */
export function verifyG10BundleForShape(input:TableDeploymentBundle,accounting:AccountingContext,path:string):TableDeploymentBundle{
 const owned=ownCanonicalComponent(input,path,BUNDLE_COPY_BYTES,accounting);
 const claimedDigest=owned!==null&&typeof owned==='object'&&!Array.isArray(owned)?(owned as Record<string,InventoryComponentJson>).bundleDigest:undefined;
 const bucket=cachedBundleBucket(claimedDigest,accounting,path);
 if(bucket){
  const inputCanonical=canonicalCharged(owned,accounting,`${path}/shape-input`),hit=cachedBundle(inputCanonical,bucket,accounting,path);
  if(hit){if(hit.bundleDigest!==claimedDigest)throw new TypeError(`R2_VERIFIED_BUNDLE_DIGEST_MISMATCH:${path}`);return hit;}
 }
 return verifyAndRememberG10Deployment(owned as unknown as TableDeploymentBundle,accounting);
}

/** Fixed source-use verifier. Cache hits expose only the independently frozen bundle. */
export function verifyScopedG10SourceBundle(input:TableDeploymentBundle,accounting:AccountingContext,path:string):TableDeploymentBundle{
 const owned=ownCanonicalComponent(input,path,BUNDLE_COPY_BYTES,accounting);
 const claimedDigest=owned!==null&&typeof owned==='object'&&!Array.isArray(owned)?(owned as Record<string,InventoryComponentJson>).bundleDigest:undefined;
 const bucket=cachedBundleBucket(claimedDigest,accounting,path);
 if(bucket){
  const inputCanonical=canonicalCharged(owned,accounting,`${path}/lineage-input`),hit=cachedBundle(inputCanonical,bucket,accounting,path);
  if(hit){if(hit.bundleDigest!==claimedDigest)throw new TypeError(`R2_VERIFIED_BUNDLE_DIGEST_MISMATCH:${path}`);return hit;}
 }
 const result=verifyCompleteAndStore(owned as unknown as TableDeploymentBundle,accounting,`${path}/verified-bundle-cache`,true,claimedDigest);
 // The fixed verifier's returned bundle is a new core copy, not the candidate
 // or any caller-owned object, and is private to this lineage call.
 const stored=cachedBundleBucket(result.bundle.bundleDigest,accounting,path);
 return stored?cachedBundle(result.inputCanonical,stored,accounting,path)??result.bundle:result.bundle;
}

/** Lineage-only exact-content reuse. Every miss runs the complete source verifier. */
export function verifyG10BundleForLineage(input:TableDeploymentBundle,accounting:AccountingContext,path:string):TableDeploymentBundle{
 return verifyScopedG10SourceBundle(input,accounting,path);
}
