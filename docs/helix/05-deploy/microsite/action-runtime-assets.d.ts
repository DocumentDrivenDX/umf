/** Inert intent-record types retained by neutral IndexedDB custody utilities.
 * No callable provider, compiler, loader or old-format admission surface. */
declare module '*truss-browser/store.js' {
 interface Artifact {mediaType:string;utf8:string;sha256:string}
 export interface SealReference {profile:'truss-browser-seal-reference/0.1';storeId:string;incarnation:string;requestKey:string;attempt:string;manifestSha256:string;planSha256:string;modelSha256:string}
 export type SealOutcome={outcome:'sealed';reference:SealReference;manifest:Artifact;receipt:Artifact}
 |{outcome:'conflict';code:'request_key_conflict';reference:SealReference}
 |{outcome:'unknown';code:'storage_outcome_unknown';reference:SealReference}
 |{outcome:'unresolved';code:'not_found';reference:SealReference}
 |{outcome:'refused';code:string;control:{requestKey:string;attempt:string};reason:string}
 |{outcome:'failure';code:string;control:{requestKey:string;attempt:string};reference?:SealReference;sqlState?:string;reason:string;settlement:'not_dispatched'|'current_attempt_rolled_back'};
 export interface LoadInput {target:{documentId:string;module:string;record:string};rows:{fields:{module:string;field:string;value:string}[]}[];request:{requestKey:string;attempt:string}}
}
