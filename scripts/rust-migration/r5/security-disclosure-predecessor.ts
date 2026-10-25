// SPDX-License-Identifier: MIT OR Apache-2.0
// Freeze current legacy and V2 security-disclosure source outcomes.
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateSecurityDisclosure,encodeSecurityDisclosure,decodeSecurityDisclosure} from '../../../src/extensions/security/disclosure';
import {inspectSecurityDisclosureV2,encodeSecurityDisclosureV2,decodeSecurityDisclosureV2} from '../../../src/extensions/security/protection/disclosure';
import {securityFixture,ref} from '../../../tests/security/fixture';
import {domainFixture,domainRef} from '../../../tests/security/protection/domain-fixture';

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'../../..');
const output=resolve(root,'docs/helix/04-build/evidence/rust-migration/r8-security-truth-logic/disclosure-predecessor.json');
const sha=async(path:string)=>createHash('sha256').update(await readFile(resolve(root,path))).digest('hex');
const normalize=(value:unknown)=>JSON.parse(JSON.stringify(value));
function outcome(fn:()=>unknown){try{return {status:'returned',value:normalize(fn())};}catch(error){const e=error as Error & {code?:string;path?:string};return {status:'threw',name:e.name,code:e.code??null,path:e.path??null,message:e.message};}}
const cases:unknown[]=[];
const add=(id:string,input:unknown,fn:()=>unknown)=>cases.push({id,input,outcome:outcome(fn)});
const legacy=securityFixture();
legacy.resolution.documents[0]!.document.modules[0]!.elements.find(e=>e.id==='salary')!.nullability='absent-allowed';
const batch:any={version:'umf.security.disclosure/0.1.0',target:ref('Resource'),fields:[ref('salary')],rows:[
 [{field:ref('salary'),disposition:'original',value:null}],[{field:ref('salary'),disposition:'absent'}],[{field:ref('salary'),disposition:'withheld'}],
 [{field:ref('salary'),disposition:'original',value:{integerToken:'9007199254740993'}}],
 [{field:ref('salary'),disposition:'transformed',outputType:ref('resourceId'),value:{string:'restricted'}}],
]};
add('legacy.validate.valid-distinct-dispositions',{batch},()=>validateSecurityDisclosure(batch,legacy.policy,legacy.resolution));
add('legacy.encode.valid',{batch},()=>encodeSecurityDisclosure(batch,legacy.policy,legacy.resolution));
const legacyJson=encodeSecurityDisclosure(batch,legacy.policy,legacy.resolution);
add('legacy.decode.valid',{format:'json',source:legacyJson},()=>decodeSecurityDisclosure(legacyJson,legacy.policy,legacy.resolution));
for(const [name,source] of [['malformed','{"version":'],['duplicate-key','{"version":"a","version":"b"}'],['yaml','version: umf.security.disclosure/0.1.0\n']] as const)
 add(`legacy.decode.${name}`,{source},()=>decodeSecurityDisclosure(source,legacy.policy,legacy.resolution));
const extraBatch={...structuredClone(batch),futureExtension:{opaque:true}};
add('legacy.validate.unknown-top-member',{input:extraBatch},()=>validateSecurityDisclosure(extraBatch,legacy.policy,legacy.resolution));
const extraCell=structuredClone(batch);extraCell.rows[2]![0]!.futureExtension='opaque';
add('legacy.validate.unknown-cell-member',{input:extraCell},()=>validateSecurityDisclosure(extraCell,legacy.policy,legacy.resolution));
const wrongPolicy=structuredClone(legacy.policy) as any;wrongPolicy.version='unsupported';
add('legacy.validate.interpretation-before-batch-shape',{batch:{},policyVersion:wrongPolicy.version},()=>validateSecurityDisclosure({},wrongPolicy,legacy.resolution));
let legacyGetterCalls=0;const hostileLegacy:any={get version(){legacyGetterCalls++;return batch.version;}};
add('legacy.validate.accessor-source-refused-without-getter',{shape:'accessor'},()=>{const result=(()=>{try{return validateSecurityDisclosure(hostileLegacy,legacy.policy,legacy.resolution);}catch(e){return (e as Error).message;}})();return {result,getterCalls:legacyGetterCalls};});

const v2=domainFixture();
(v2.closure.documents[0]!.document.modules[0]!.elements[0]! as any).nullability='absent-allowed';
(v2.closure.documents[0]!.document.modules[0]!.elements[1]! as any).nullability='absent-allowed';
const batchV2:any={version:'umf.security.disclosure/0.2.0',policy:{id:'p',revision:'p1'},protection:{id:'catalog',revision:'c1'},domains:structuredClone(v2.closure.pins),columns:[{field:domainRef('input'),storageEffect:'canonical'}],rows:[
 [{disposition:'original',value:null}],[{disposition:'absent'}],[{disposition:'withheld'}],
 [{disposition:'original',value:{integerToken:'9007199254740993'}}],
 [{disposition:'transformed',selection:{ruleIndex:0,disclosureIndex:0},outputDomain:domainRef('output'),transform:{id:'transform',version:'t1'},value:{string:'restricted'}}],
]};
const inspect=(input:unknown=batchV2,policy:unknown=v2.policy,catalog:unknown=v2.catalog,closure:unknown=v2.closure)=>inspectSecurityDisclosureV2(input,policy,catalog,closure);
add('v2.inspect.valid-distinct-dispositions',{batch:batchV2},()=>inspect());
for(const format of ['json','yaml'] as const){
 add(`v2.encode.${format}`,{format,batch:batchV2},()=>encodeSecurityDisclosureV2(batchV2,v2.policy,v2.catalog,v2.closure,format));
 const encoded=encodeSecurityDisclosureV2(batchV2,v2.policy,v2.catalog,v2.closure,format);
 add(`v2.decode.${format}`,{format,source:encoded},()=>decodeSecurityDisclosureV2(encoded,v2.policy,v2.catalog,v2.closure,format));
}
const unknownBatch={...structuredClone(batchV2),futureExtension:{retained:'source'}};
add('v2.inspect.unknown-extension-retained-on-refusal',{input:unknownBatch},()=>{const r=inspect(unknownBatch);return {status:r.status,batch:r.batch,source:r.source,diagnostics:r.diagnostics};});
const malformedSource='{"version":';
add('v2.decode.malformed-source-generic-refusal',{source:malformedSource},()=>decodeSecurityDisclosureV2(malformedSource,v2.policy,v2.catalog,v2.closure));
add('v2.decode.duplicate-key-generic-refusal',{source:'{"version":"a","version":"b"}'},()=>decodeSecurityDisclosureV2('{"version":"a","version":"b"}',v2.policy,v2.catalog,v2.closure));
add('v2.encode.unknown-format-before-validation',{format:'unknown'},()=>encodeSecurityDisclosureV2({},null,null,null,'unknown' as any));
add('v2.decode.unknown-format-before-text-parse',{format:'unknown',source:'{'},()=>decodeSecurityDisclosureV2('{',null,null,null,'unknown' as any));
const mismatchedPin=structuredClone(batchV2);mismatchedPin.policy.revision='stale';
add('v2.inspect.semantic-refusal-retains-source',{input:mismatchedPin},()=>{const r=inspect(mismatchedPin);return {status:r.status,batch:r.batch,source:r.source,diagnostics:r.diagnostics};});
const invalidPolicy=structuredClone(v2.policy) as any;invalidPolicy.revision='';
add('v2.inspect.parameter-refusal-before-batch-shape',{input:{},policyRevision:invalidPolicy.revision},()=>inspect({},invalidPolicy));
let v2GetterCalls=0;const hostileV2:any={get version(){v2GetterCalls++;return batchV2.version;}};
add('v2.inspect.accessor-source-refused-without-getter',{shape:'accessor'},()=>{const r=inspect(hostileV2);return {status:r.status,source:r.source,batch:r.batch,diagnostics:r.diagnostics,getterCalls:v2GetterCalls};});
add('v2.decode.non-string-text-refusal',{textType:'null'},()=>decodeSecurityDisclosureV2(null as any,v2.policy,v2.catalog,v2.closure));
const unknownFormat=inspect(batchV2,v2.policy,v2.catalog,v2.closure);
add('v2.inspection-authority-is-always-false',{batch:batchV2},()=>({status:unknownFormat.status,complete:unknownFormat.complete,authority:unknownFormat.authority}));

const sources=['src/extensions/security/disclosure.ts','src/extensions/security/policy.ts','src/extensions/security/protection/disclosure.ts','src/extensions/security/protection/source.ts','src/extensions/security/protection/parameters.ts','src/extensions/security/protection/literals.ts','src/extensions/security/protection/references.ts','src/extensions/security/protection/domains.ts','src/model/serialization.ts','src/model/json.ts','tests/security/fixture.ts','tests/security/protection/domain-fixture.ts','docs/helix/02-design/contracts/CONTRACT-062-security-semantics.md'];
const packet={format:'umf-r8-security-disclosure-typescript-predecessor/1',runtime:{bun:Bun.version},sourceHashes:Object.fromEntries(await Promise.all(sources.map(async path=>[path,await sha(path)]))),captureScriptSha256:await sha('scripts/rust-migration/r5/security-disclosure-predecessor.ts'),caseCount:cases.length,cases};
const serialized=JSON.stringify(packet,null,2)+'\n';
if(process.argv.includes('--check')){if(await readFile(output,'utf8')!==serialized)throw new Error('Frozen security-disclosure predecessor changed; review before refresh');}
else{await mkdir(dirname(output),{recursive:true});await writeFile(output,serialized);}
console.log(JSON.stringify({mode:process.argv.includes('--check')?'check':'write',output,caseCount:cases.length,packetSha256:createHash('sha256').update(serialized).digest('hex')}));
