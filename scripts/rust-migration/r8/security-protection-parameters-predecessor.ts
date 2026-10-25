// SPDX-License-Identifier: MIT OR Apache-2.0
// Freeze exact current V2 typed-parameter admission outcomes for Rust planning.
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateProtectionParameters,checkProtectionParametersWithinBudget} from '../../../src/extensions/security/protection/parameters';
import {ProtectionLiteralBudget} from '../../../src/extensions/security/protection/literals';
import {domainFixture,domainRef} from '../../../tests/security/protection/domain-fixture';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const output=resolve(root,'docs/helix/04-build/evidence/rust-migration/r8-security-protection-parameters/predecessor.json');
const sha=async(path:string)=>createHash('sha256').update(await readFile(resolve(root,path))).digest('hex');
const normalize=(value:unknown)=>JSON.parse(JSON.stringify(value));
function outcome(fn:()=>unknown){try{return {status:'returned',value:normalize(fn())};}catch(error){const e=error as Error&{code?:string;path?:string};return {status:'threw',name:e.name,code:e.code??null,path:e.path??null,message:e.message};}}
const cases:any[]=[];
const f=domainFixture();
const run=(p:any,c:any,k:any)=>validateProtectionParameters(p,c,k);
const add=(id:string,input:unknown,fn:()=>unknown,snapshot?:{policy?:any;catalog?:any;closure?:any;hostOnly?:boolean})=>cases.push({id,input,...(snapshot?.hostOnly?{}:{sources:{policy:normalize(snapshot?.policy??f.policy),catalog:normalize(snapshot?.catalog??f.catalog),closure:normalize(snapshot?.closure??f.closure)}}),outcome:outcome(fn)});

add('parameters.valid-integer-and-range-bucket','default fixture; validates both typed literals',()=>run(f.policy,f.catalog,f.closure));
const wrongType=structuredClone(f.catalog);wrongType.transforms[0].parameters[0].value={string:'wrong'};add('parameters.literal-family-mismatch','integer Field receives string literal',()=>run(f.policy,wrongType,f.closure),{catalog:wrongType});
const malformed=structuredClone(f.catalog);malformed.transforms[0].parameters[0].value={integerToken:'01'};add('parameters.noncanonical-integer-token','integer token has a leading zero',()=>run(f.policy,malformed,f.closure),{catalog:malformed});
const largeExpansion=structuredClone(f.catalog);largeExpansion.transforms[0].parameters[0].value={integerToken:'1e1000000'};add('parameters.numeric-expansion-work-bound','small exponent token requests huge exact integer expansion',()=>run(f.policy,largeExpansion,f.closure),{catalog:largeExpansion});
const longStringCatalog=structuredClone(f.catalog);longStringCatalog.transforms[0].parameters=[{name:'value',field:domainRef('parameter'),value:{string:'x'.repeat(4097)}}];const longStringClosure:any=structuredClone(f.closure);longStringClosure.documents[0].document.modules[0].elements[2].scalarType='string';add('parameters.canonical-literal-size-bound','canonical string literal exceeds the 4096-unit catalog bound',()=>run(f.policy,longStringCatalog,longStringClosure),{catalog:longStringCatalog,closure:longStringClosure});
const tooMany=structuredClone(f.catalog);tooMany.transforms[0].parameters=Array.from({length:33},(_,i)=>({name:`p${i}`,field:domainRef('parameter'),value:{integerToken:'1'}}));add('parameters.parameter-count-schema-bound','33 parameter declarations on one transform',()=>run(f.policy,tooMany,f.closure),{catalog:tooMany});
const catalogUnknown=structuredClone(f.catalog);catalogUnknown.transforms[0].futureTransform={opaque:'preserved'};add('parameters.unknown-catalog-member-blocks-check','unknown transform member retained but blocks typed admission',()=>run(f.policy,catalogUnknown,f.closure),{catalog:catalogUnknown});
const policyUnknown=structuredClone(f.policy);policyUnknown.futurePolicy={opaque:'preserved'};const invalidUnderUnknown=structuredClone(f.catalog);invalidUnderUnknown.transforms[0].parameters[0].value={string:'wrong'};add('parameters.unknown-policy-refusal-precedes-literal-check','unknown policy member and invalid literal',()=>run(policyUnknown,invalidUnderUnknown,f.closure),{policy:policyUnknown,catalog:invalidUnderUnknown});
const unknownCoreClosure:any=structuredClone(f.closure);unknownCoreClosure.documents[0].document.modules[0].elements[2].futureMeaning=true;add('parameters.unknown-core-member-blocks-check','unknown core Field member with otherwise valid literals',()=>run(f.policy,f.catalog,unknownCoreClosure),{closure:unknownCoreClosure});
const spentBudget=new ProtectionLiteralBudget();spentBudget.step(100_000);add('parameters.pre-spent-budget-first-literal-fault','internal caller has spent 100000 literal-work units before entering helper',()=>checkProtectionParametersWithinBudget(f.policy,f.catalog,f.closure,spentBudget));
let getterCalls=0;const hostilePolicy={...f.policy,get futurePolicy(){getterCalls++;return 'must not run';}};add('parameters.policy-accessor-not-invoked', {hostShape:'policy accessor'},()=>{const result=run(hostilePolicy,f.catalog,f.closure);return {status:result.status,diagnostics:result.diagnostics,getterCalls,policy:result.policy};},{hostOnly:true});

const sourceFiles=[
 'src/extensions/security/protection/parameters.ts','src/extensions/security/protection/literals.ts','src/extensions/security/protection/domains.ts','src/extensions/security/protection/references.ts','src/extensions/security/protection/catalog.ts','src/extensions/security/policy-representation-v2.ts','src/extensions/security/protection/core-fields.ts','src/model/schema-literals.ts','src/validation/literal-kernel.ts','src/validation/current-policy.ts','src/model/types.ts','tests/security/protection/domain-fixture.ts','spec/extensions/security-v0.2/package.json','spec/extensions/security-protection/package.json','spec/extensions/security-protection/domain-resolution.schema.json','docs/helix/02-design/contracts/CONTRACT-062-security-semantics.md'
];
const scriptPath='scripts/rust-migration/r8/security-protection-parameters-predecessor.ts';
const packet={format:'umf-r8-security-protection-parameters-typescript-predecessor/1',runtime:{bun:Bun.version},sourceHashes:Object.fromEntries(await Promise.all(sourceFiles.map(async path=>[path,await sha(path)]))),captureScriptSha256:await sha(scriptPath),caseCount:cases.length,cases};
const serialized=JSON.stringify(packet,null,2)+'\n';
if(process.argv.includes('--check')){if(await readFile(output,'utf8')!==serialized)throw new Error('Frozen security parameter predecessor changed; review before refresh');}
else{await mkdir(dirname(output),{recursive:true});await writeFile(output,serialized);}
console.log(JSON.stringify({mode:process.argv.includes('--check')?'check':'write',output,caseCount:cases.length,packetSha256:createHash('sha256').update(serialized).digest('hex')}));
