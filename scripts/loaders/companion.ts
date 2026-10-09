import {readFile,realpath} from 'node:fs/promises';
import {resolve,relative,isAbsolute,dirname} from 'node:path';
import {inspectDomainPackLoader} from '../../src/domain-packs/loader';
import {hash} from './state';
import {readBounded,type ByteBudget} from './bytes';
export const companionRoot=resolve(import.meta.dir,'../../spec/loader-companion/1.0.0');
export async function verifyCompanion(pack:any,root:string,trustedRoot=companionRoot,budget?:ByteBudget):Promise<[string,Uint8Array][]> {
 const result=inspectDomainPackLoader(pack.loader);if(!result.valid)throw Error('LOADER_METADATA');
 // The trusted installed release, not the pack, selects the allowed code closure.
 const trusted=JSON.parse(new TextDecoder().decode(await readBounded(resolve(trustedRoot,'release.json'),1024*1024)));
 const artifacts=pack.loader.artifacts;
 if(JSON.stringify(artifacts.map((a:any)=>({reference:a.reference,sha256:a.sha256})))!==JSON.stringify(trusted.artifacts))throw Error('UNTRUSTED_COMPANION');
 const base=await realpath(root),entries:[string,Uint8Array][]=[];
 for(const artifact of artifacts){
  const actual=await realpath(resolve(root,artifact.reference)),inside=relative(base,actual);
  if(isAbsolute(artifact.reference)||inside==='..'||inside.startsWith('../')||isAbsolute(inside))throw Error('COMPANION_PATH');
  const bytes=await readBounded(actual,10*1024*1024,budget);
  if(hash(bytes)!==artifact.sha256||hash(await readBounded(resolve(trustedRoot,artifact.reference),10*1024*1024))!==artifact.sha256)throw Error('COMPANION_HASH');
  entries.push([artifact.reference,bytes]);
 }
 return entries;
}
