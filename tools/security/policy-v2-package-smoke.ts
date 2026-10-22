/** Exercise actual built package exports, independently of direct source imports. */
import {createHash} from 'node:crypto';
import {evaluationFixture} from '../../tests/security/evaluation-fixture';
const name='@umf/core',api=await import(name);
for(const key of ['inspectSecurityPolicyV2Source','upgradeSecurityPolicySource','downgradeSecurityPolicySource','resolveSecurityProtectionSources','evaluateSecurityPolicyV2LegacyAccess'])if(typeof api[key]!=='function')throw Error('Missing package export '+key);
const f=evaluationFixture(),field=f.policy.rules[0]!.disclosure![0]!.field,outputType={...field,elementId:'staffId'};
f.policy.rules[0]!.disclosure![0]!.disposition={kind:'transformed',transform:'constant',version:'0.1.0',field:outputType,value:{string:'redacted'}};
const upgraded=api.upgradeSecurityPolicySource(f.policy,'p2');if(upgraded.status!=='migrated')throw Error('Built package migration refused');
const request={action:'read',output:[field]},cut={...f.cut,policyRevision:'p2'};
const result=api.evaluateSecurityPolicyV2LegacyAccess(upgraded.target,f.resolution,cut,request,f.resource);
const expected={decision:'permit',output:[{field,disposition:'transformed',outputType,value:{string:'redacted'}}]};
if(JSON.stringify(result.result)!==JSON.stringify(expected)||result.authority!==false)throw Error('Built package semantic embedding differs');
if(api.evaluateSecurityPolicyV2LegacyAccess(upgraded.target,f.resolution,f.cut,request,f.resource).result.decision!=='indeterminate')throw Error('Built package stale attestation admitted');
const paths=['package.json','src/index.ts','src/extensions/security/policy-v2-legacy-access.ts','src/extensions/security/policy-representation-v2.ts','tools/security/policy-v2-package-smoke.ts','dist/umf.js','dist/src/index.d.ts','dist/src/extensions/security/policy-v2-legacy-access.d.ts'];
const sourceDigests=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
await Bun.write('docs/helix/04-build/evidence/security/policy-v2-20261015/package-smoke.json',JSON.stringify({status:'built-package-passed',bun:Bun.version,sourceDigests,expected,observed:result.result,acceptanceCasesPromoted:[],scope:'Actual built package export and legacy embedding smoke only; no full provenance/general0.2/native qualification.'},null,2)+'\n');
console.log(JSON.stringify({status:'built-package-passed',bun:Bun.version}));
