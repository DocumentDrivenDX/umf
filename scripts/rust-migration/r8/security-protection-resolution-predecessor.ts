// SPDX-License-Identifier: MIT OR Apache-2.0
// Freeze exact current source/domain resolver outcomes for internal Rust planning.
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {resolveSecurityProtectionSources} from '../../../src/extensions/security/protection/references';
import {resolveSecurityProtectionDomains} from '../../../src/extensions/security/protection/domains';
import {domainFixture} from '../../../tests/security/protection/domain-fixture';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const output=resolve(root,'docs/helix/04-build/evidence/rust-migration/r8-security-protection-resolution/predecessor.json');
const sha=async(path:string)=>createHash('sha256').update(await readFile(resolve(root,path))).digest('hex');
const normalize=(value:unknown)=>JSON.parse(JSON.stringify(value));
function outcome(fn:()=>unknown){try{return {status:'returned',value:normalize(fn())};}catch(error){const e=error as Error&{code?:string;path?:string};return {status:'threw',name:e.name,code:e.code??null,path:e.path??null,message:e.message};}}
const cases:any[]=[];
const add=(id:string,stage:'source'|'domains',input:unknown,fn:()=>unknown,snapshot?:{policy?:any;catalog?:any;closure?:any;hostOnly?:boolean})=>cases.push({id,stage,input,...(snapshot?.hostOnly?{}:{sources:{policy:normalize(snapshot?.policy??f.policy),catalog:normalize(snapshot?.catalog??f.catalog),...(stage==='domains'?{closure:normalize(snapshot?.closure??f.closure)}:{})}}),outcome:outcome(fn)});
const f=domainFixture();
const source=(p:any=f.policy,c:any=f.catalog)=>resolveSecurityProtectionSources(p,c);
const domains=(p:any=f.policy,c:any=f.catalog,k:any=f.closure)=>resolveSecurityProtectionDomains(p,c,k);
const summarizeSource=(p:any=f.policy,c:any=f.catalog)=>{const r=source(p,c);return {status:r.status,complete:r.complete,authority:r.authority,references:r.references,diagnostics:r.diagnostics,retainsPolicy:JSON.stringify(r.policy)===JSON.stringify(p),retainsCatalog:JSON.stringify(r.catalog)===JSON.stringify(c)};};
const summarizeDomains=(p:any=f.policy,c:any=f.catalog,k:any=f.closure)=>{const r=domains(p,c,k);return {status:r.status,complete:r.complete,authority:r.authority,domains:r.domains,diagnostics:r.diagnostics,retainsClosure:JSON.stringify(r.closure)===JSON.stringify(k)};};
add('source.exact-policy-catalog-pins','source',{policyPin:f.policy.protection,catalog:{id:f.catalog.id,revision:f.catalog.revision}},()=>summarizeSource());
for(const [key,value] of [['id','foreign'],['revision','stale']] as const){const c=structuredClone(f.catalog);c[key]=value;add(`source.catalog-pin-${key}-mismatch`,'source',{policyPin:f.policy.protection,catalogPin:{id:c.id,revision:c.revision}},()=>summarizeSource(f.policy,c),{catalog:c});}
const noProtection=structuredClone(f.policy);delete noProtection.protection;add('source.policy-protection-pin-missing','source',{},()=>summarizeSource(noProtection),{policy:noProtection});
const wrongTransform=structuredClone(f.policy);wrongTransform.rules[0].disclosure[0].disposition.version='stale';add('source.transform-version-reference-missing','source',{transform:'transform',version:'stale'},()=>summarizeSource(wrongTransform),{policy:wrongTransform});
const policyUnknown=structuredClone(f.policy);policyUnknown.futurePolicy={opaque:'kept'};add('source.policy-unknown-member-retained','source',{member:'/futurePolicy'},()=>summarizeSource(policyUnknown),{policy:policyUnknown});
const catalogUnknown=structuredClone(f.catalog);catalogUnknown.transforms[0].futureTransform={opaque:'kept'};add('source.catalog-unknown-member-retained','source',{member:'/transforms/0/futureTransform'},()=>summarizeSource(f.policy,catalogUnknown),{catalog:catalogUnknown});
const invalidPolicyWithUnknownCatalog=structuredClone(f.policy);invalidPolicyWithUnknownCatalog.version='future';const unknownCatalogWithInvalidPolicy=structuredClone(f.catalog);unknownCatalogWithInvalidPolicy.futureCatalog={opaque:'kept'};add('source.catalog-unknown-retained-despite-policy-schema-error','source',{policyVersion:invalidPolicyWithUnknownCatalog.version,member:'/futureCatalog'},()=>summarizeSource(invalidPolicyWithUnknownCatalog,unknownCatalogWithInvalidPolicy),{policy:invalidPolicyWithUnknownCatalog,catalog:unknownCatalogWithInvalidPolicy});
const duplicateTransformCatalog=structuredClone(f.catalog);duplicateTransformCatalog.transforms.push({...structuredClone(duplicateTransformCatalog.transforms[0]),futureTransform:{distinct:true}});add('source.duplicate-transform-identity-refused-before-lookup','source',{identity:[duplicateTransformCatalog.transforms[0].id,duplicateTransformCatalog.transforms[0].version]},()=>summarizeSource(f.policy,duplicateTransformCatalog),{catalog:duplicateTransformCatalog});
const badBoth=structuredClone(f.policy);badBoth.version='future';const badCatalog=structuredClone(f.catalog);badCatalog.version='future';add('source.policy-errors-precede-catalog-errors','source',{policyVersion:badBoth.version,catalogVersion:badCatalog.version},()=>summarizeSource(badBoth,badCatalog),{policy:badBoth,catalog:badCatalog});
add('domains.exact-pins-qualified-fields','domains',{policyPin:f.policy.protection,catalogPin:{id:f.catalog.id,revision:f.catalog.revision},domainPins:f.closure.pins},()=>summarizeDomains());
const staleClosure:any=structuredClone(f.closure);staleClosure.documents[0].revision='stale';add('domains.stale-domain-revision','domains',{domainPin:staleClosure.pins[0],documentRevision:staleClosure.documents[0].revision},()=>summarizeDomains(f.policy,f.catalog,staleClosure),{closure:staleClosure});
const closureUnknown:any=structuredClone(f.closure);closureUnknown.documents[0].document.modules[0].elements[0].futureMeaning=true;add('domains.unknown-core-member-blocks-resolution','domains',{member:'/documents/0/document/modules/0/elements/0/futureMeaning'},()=>summarizeDomains(f.policy,f.catalog,closureUnknown),{closure:closureUnknown});
const unknownPolicy=structuredClone(f.policy);unknownPolicy.futurePolicy={kept:true};add('domains.unknown-policy-member-blocks-resolution','domains',{member:'/futurePolicy'},()=>summarizeDomains(unknownPolicy),{policy:unknownPolicy});
const sourceAndClosureBad=structuredClone(f.policy);sourceAndClosureBad.protection.id='stale';const malformedClosure={pins:[],documents:[],future:true};add('domains.closure-schema-diagnostic-before-source-refusal','domains',{policyPin:sourceAndClosureBad.protection,closure:malformedClosure},()=>summarizeDomains(sourceAndClosureBad,f.catalog,malformedClosure),{policy:sourceAndClosureBad,closure:malformedClosure});
let getterCalls=0;const hostileClosure={get pins(){getterCalls++;return [];}};add('domains.accessor-closure-refused-without-getter','domains',{hostShape:'pins accessor'},()=>{const r=domains(f.policy,f.catalog,hostileClosure);return {status:r.status,diagnostics:r.diagnostics,getterCalls};},{hostOnly:true});

const sourceFiles=['src/extensions/security/policy-representation-v2.ts','src/extensions/security/protection/catalog.ts','src/extensions/security/protection/references.ts','src/extensions/security/protection/domains.ts','src/extensions/security/protection/core-fields.ts','src/extensions/security/core-source-candidate.ts','src/model/json.ts','src/validation/document.ts','tests/security/protection/domain-fixture.ts','spec/extensions/security-v0.2/package.json','spec/extensions/security-protection/package.json','spec/extensions/security-protection/domain-resolution.schema.json','docs/helix/02-design/contracts/CONTRACT-062-security-semantics.md'];
const scriptPath='scripts/rust-migration/r8/security-protection-resolution-predecessor.ts';
const packet={format:'umf-r8-security-protection-resolution-typescript-predecessor/1',runtime:{bun:Bun.version},sourceHashes:Object.fromEntries(await Promise.all(sourceFiles.map(async path=>[path,await sha(path)]))),captureScriptSha256:await sha(scriptPath),caseCount:cases.length,cases};
const serialized=JSON.stringify(packet,null,2)+'\n';
if(process.argv.includes('--check')){if(await readFile(output,'utf8')!==serialized)throw new Error('Frozen security protection resolution predecessor changed; review before refresh');}
else{await mkdir(dirname(output),{recursive:true});await writeFile(output,serialized);}
console.log(JSON.stringify({mode:process.argv.includes('--check')?'check':'write',output,caseCount:cases.length,packetSha256:createHash('sha256').update(serialized).digest('hex')}));
