import {createHash} from 'node:crypto';
import packet from '../../tests/security/protection/disclosure-fixtures.json';
const name='@umf/core',api=await import(name),f=structuredClone(packet.base),rows:any[]=[];
for(const format of ['json','yaml'] as const){
 const result=api.inspectSecurityDisclosureV2(f.batch,f.policy,f.catalog,f.closure);
 const text=api.encodeSecurityDisclosureV2(f.batch,f.policy,f.catalog,f.closure,format);
 const value=api.decodeSecurityDisclosureV2(text,f.policy,f.catalog,f.closure,format);
 if(result.status!=='validated-disclosure'||result.complete!==false||result.authority!==false||JSON.stringify(value)!==JSON.stringify(f.batch)||!Object.isFrozen(value))throw Error('Actual built package roundtrip differs');
 rows.push({format,roundtrip:true,authority:false});
}
f.batch.policy.revision='stale';const refused=api.inspectSecurityDisclosureV2(f.batch,f.policy,f.catalog,f.closure);
if(refused.status!=='refused'||refused.batch!==null)throw Error('Built package admitted stale source pin');
const paths=['package.json','src/index.ts','src/extensions/security/protection/disclosure.ts','tests/security/protection/disclosure-fixtures.json','tools/security/protection-disclosure-package-smoke.ts','dist/umf.js','dist/src/index.d.ts','dist/src/extensions/security/protection/disclosure.d.ts'];
const sourceDigests=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
await Bun.write('docs/helix/04-build/evidence/security/protection-disclosure-20261015/package-smoke.json',JSON.stringify({status:'built-package-disclosure-passed',bun:Bun.version,sourceDigests,observations:rows,staleRefusal:true,scope:'Actual built package API/declaration and JSON/YAML data smoke; no transform execution, row authorization or native qualification.'},null,2)+'\n');console.log(JSON.stringify({status:'built-package-disclosure-passed',bun:Bun.version}));
