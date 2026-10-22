/** Exercise the actual package exports after the standard library build. */
import {createHash} from 'node:crypto';
const name='@umf/core',api=await import(name);
for(const key of ['readProtectionSource','writeProtectionSource','inspectProtectionCatalog','requireProtectionInterpretation'])if(typeof api[key]!=='function')throw Error('Missing built package export '+key);
const field={documentId:'d',moduleId:'m',elementId:'f'};
const source={vocabulary:'umf.security.protection',version:'0.1.0',id:'c',revision:'r',transforms:[{id:'t',version:'1',kind:'mask',function:'constant',inputDomain:field,outputDomain:field,determinism:'deterministic',reversibility:'none',disclosureProfile:[],queryUse:{},parameters:[]}]};
const result=api.inspectProtectionCatalog(source);
if(result.valid!==true||result.complete!==false)throw Error('Built wire inspection differs');
let refusal='';try{api.requireProtectionInterpretation(source);}catch(error:any){refusal=error.code;}
if(refusal!=='PROTECTION_UNIMPLEMENTED')throw Error('Built package unexpectedly admits interpretation');
for(const format of ['json','yaml'])if(JSON.stringify(api.readProtectionSource(api.writeProtectionSource(source,format),format))!==JSON.stringify(source))throw Error('Built source roundtrip differs');
const paths=['package.json','src/index.ts','src/extensions/security/protection/catalog.ts','tools/security/protection-package-smoke.ts','dist/umf.js','dist/src/index.d.ts','dist/src/extensions/security/protection/catalog.d.ts'];
const sourceDigests=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
const receipt={status:'built-package-metadata-passed',bun:Bun.version,sourceDigests,refusal,formats:['json','yaml'],acceptanceCasesPromoted:[],scope:'Built package entrypoint and emitted declaration artifact presence for protection wire metadata; no transform interpretation, full dependency provenance or native qualification.'};
await Bun.write('docs/helix/04-build/evidence/security/protection-wire-20261015/package-smoke.json',JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({status:receipt.status,bun:receipt.bun,refusal}));
