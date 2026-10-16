import {admitAccessRequest,AccessInputError} from './admission/index';
import {packageAccessFiles,hashCanonical,sha256Text} from './bundle/index';
import {emitPythonAccess} from './targets/python/index';
import type {AccessRequest,AccessProfile,AccessResult} from './ir/index';
export type {AccessRequest,AccessProfile,AccessResult,GeneratedFile,AccessSymbol} from './ir/index';
/** Pure stage-one construction point; no host filesystem or network API. */
export function generateAccessPackage(request:AccessRequest,profile:AccessProfile):AccessResult {
 try{
 const a=admitAccessRequest(request,profile);
 if(a.diagnostics.length)return packageAccessFiles(a.request,a.profile,[],[],a.dispositions,a.obligations,a.diagnostics);
 const inputDigest=hashCanonical({request:a.request,profile:a.profile});
 const emitted=emitPythonAccess(a.ir,a.request,inputDigest,sha256Text(a.request.sources.find(source=>source.id===a.request.logical)!.text));
 return packageAccessFiles(a.request,a.profile,emitted.texts,emitted.symbols,a.dispositions,a.obligations,a.diagnostics);
 }catch(error){if(error instanceof Error&&error.message==='INPUT')throw new AccessInputError('INPUT','');throw error;}
}
export {diffAccessPackages,type AccessSymbolChange} from './admission/index';
