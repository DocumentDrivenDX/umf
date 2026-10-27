// SPDX-License-Identifier: MIT OR Apache-2.0
// Freeze the current TypeScript outcomes for the opt-in protection query-property inspector.
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {inspectProtectionQueryProperties} from '../../../src/extensions/security/protection/queries';
import {domainFixture,domainRef} from '../../../tests/security/protection/domain-fixture';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const directory=resolve(root,'docs/helix/04-build/evidence/rust-migration/r8-security-protection-query-properties');
const output=resolve(directory,'predecessor.json');
const hostOutput=resolve(directory,'host-observations.json');
const sha=async(path:string)=>createHash('sha256').update(await readFile(resolve(root,path))).digest('hex');
const normalize=(value:unknown)=>JSON.parse(JSON.stringify(value));
function outcome(fn:()=>unknown){try{return {status:'returned',value:normalize(fn())};}catch(error){const e=error as Error&{code?:string;path?:string};return {status:'threw',name:e.name,code:e.code??null,path:e.path??null,message:e.message};}}
const cases:any[]=[];
type Fixture=ReturnType<typeof domainFixture>;
const useInput=(operator:string,required:any[]=['equality'],more:any={})=>({ruleIndex:0,disclosureIndex:0,operator,required,...more});
const operation=(f:Fixture,use:any)=>({operation:'inspectProtectionQueryProperties',sources:normalize({policy:f.policy,catalog:f.catalog,closure:f.closure}),input:normalize(use),outcome:outcome(()=>inspectProtectionQueryProperties(f.policy,f.catalog,f.closure,use))});
const add=(id:string,description:string,operations:any[])=>cases.push({id,description,operations});

{
 const f=domainFixture();f.catalog.transforms[0].queryUse.join='disclosed';
 add('query.valid-deterministic-join','Deterministic transform implies equality for a disclosed join',[operation(f,useInput('join'))]);
}
for(const operator of ['predicate','join','group','order','aggregate']){
 const f=domainFixture(),t=f.catalog.transforms[0],required=operator==='order'?['order']:operator==='aggregate'?['nullity']:['equality'];
 t.determinism='random';t.disclosureProfile=required;t.queryUse[operator]='disclosed';
 add(`query.operator-${operator}`,'Disclosed operator with its required property retained',[operation(f,useInput(operator,required))]);
}
{
 const f=domainFixture(),t=f.catalog.transforms[0];t.disclosureProfile=[];t.queryUse={join:'disclosed',group:'disclosed',order:'disclosed'};
 add('query.implied-order-and-missing-length','Join/group imply equality and order implies order while caller-required length remains missing',[operation(f,useInput('join',['length'])),operation(f,useInput('order',['length']))]);
}
{
 const f=domainFixture();f.catalog.transforms[0].queryUse.join='disclosed';f.catalog.transforms[0].disclosureProfile=['equality'];
 add('query.authored-implied-deduplication','Authored equality is retained once when determinism also implies it',[operation(f,useInput('join',['equality','equality']))]);
}
{
 const f=domainFixture();f.catalog.transforms[0].queryUse.join='disclosed';
 add('query.missing-required-property','Disclosed use refuses when required property is absent',[operation(f,useInput('join',['length']))]);
}
add('query.operator-prohibited-by-absence','Missing queryUse mode is prohibited',[operation(domainFixture(),useInput('join'))]);
{
 const f=domainFixture();f.catalog.transforms[0].queryUse.predicate='original-authorized';
 add('query.original-action-required','Original-authorized mode is reported without granting access',[operation(f,useInput('predicate'))]);
}
{
 const f=domainFixture(),t=f.catalog.transforms[0];delete t.function;t.kind='tokenize';t.determinism='random';t.disclosureProfile=['equality'];t.queryUse={join:'disclosed'};t.custody={owner:'o',keyRef:'k',formatPreserving:false,storageEffect:'stored-transformed',propagation:{history:'h',snapshots:'s',exports:'e',feeds:'f',caches:'c'}};
 add('query.random-token-join-refused','Random tokenize join is refused even with authored equality',[operation(f,useInput('join'))]);
}
{
 const f=domainFixture();f.catalog.transforms[0].queryUse.aggregate='disclosed';f.catalog.transforms[0].disclosureProfile=[{kind:'range',bucket:{field:domainRef('parameter'),value:{integerToken:'100'}}}];
 add('query.range-identity-canonical-numeric','Range requirement matches exact Field and core-normalized integer literal identity',[operation(f,useInput('aggregate',[{kind:'range',bucket:{field:domainRef('parameter'),value:{integerToken:'1e2'}}}]))]);
}
{
 const f=domainFixture();f.catalog.transforms[0].queryUse.aggregate='disclosed';f.catalog.transforms[0].disclosureProfile=[{kind:'range',bucket:{field:domainRef('parameter'),value:{integerToken:'100'}}}];
 add('query.range-identity-distinct-field','Equal range literals on a different qualified Field do not match',[operation(f,useInput('aggregate',[{kind:'range',bucket:{field:domainRef('input'),value:{integerToken:'100'}}}]))]);
}
{
 const f=domainFixture();f.catalog.transforms[0].queryUse.aggregate='disclosed';
 add('query.range-unknown-field-refused','Range requirement refuses when its exact Field is absent from closure',[operation(f,useInput('aggregate',[{kind:'range',bucket:{field:domainRef('absent'),value:{integerToken:'1'}}}]))]);
}
{
 const f=domainFixture();
 add('query.invalid-use-shape','Empty required list and unknown use member fail structural admission',[operation(f,useInput('join',[])),operation(f,useInput('join',['equality'],{originalAction:'pretend'}))]);
}
{
 const f=domainFixture(),stale=structuredClone(f);stale.catalog.revision='other';
 add('query.invalid-selection-and-source-pin','Invalid rule selection and stale catalog pin refuse',[operation(f,useInput('join',['equality'],{ruleIndex:9})),operation(stale,useInput('join'))]);
}
{
 const f=domainFixture();f.catalog.transforms[0].futureTransform={opaque:'retained'};
 add('query.unknown-catalog-meaning','Unknown catalog transform content refuses the check while retaining its source',[operation(f,useInput('join'))]);
}
{
 const f=domainFixture(),t=f.catalog.transforms[0];delete t.function;t.kind='tokenize';t.determinism='random';t.disclosureProfile=['equality'];t.queryUse={group:'disclosed'};t.custody={owner:'o',keyRef:'k',formatPreserving:false,storageEffect:'stored-transformed',propagation:{history:'h',snapshots:'s',exports:'e',feeds:'f',caches:'c'}};
 add('query.random-token-group-refused','Random tokenize group is refused even with authored equality',[operation(f,useInput('group'))]);
}

const sourceFiles=[
 'src/extensions/security/protection/queries.ts','src/extensions/security/protection/parameters.ts','src/extensions/security/protection/literals.ts','src/extensions/security/protection/domains.ts','src/extensions/security/protection/references.ts','src/extensions/security/protection/catalog.ts','src/extensions/security/protection/core-fields.ts','src/extensions/security/policy-representation-v2.ts','src/model/json.ts','src/model/schema-literals.ts','src/validation/literal-kernel.ts','src/model/types.ts','tests/security/protection/domain-fixture.ts','spec/extensions/security-protection/schema.json','spec/extensions/security-protection/package.json','spec/extensions/security-v0.2/package.json','docs/helix/02-design/contracts/CONTRACT-062-security-semantics.md','docs/helix/02-design/contracts/CONTRACT-063-security-enforcement.md'
];
const scriptPath='scripts/rust-migration/r8/security-protection-query-properties-predecessor.ts';
const sourceHashes=Object.fromEntries(await Promise.all(sourceFiles.map(async path=>[path,await sha(path)])));
const scriptSha256=await sha(scriptPath);
const operationCount=cases.reduce((total,item)=>total+item.operations.length,0);
const json={format:'umf-r8-security-protection-query-properties-typescript-predecessor/2',runtime:{bun:Bun.version},sourceHashes,captureScriptSha256:scriptSha256,caseCount:cases.length,operationCount,cases};
let getterCalls=0;
const getterUse={ruleIndex:0,disclosureIndex:0,operator:'join',required:['equality'],get future(){getterCalls++;return true;}};
const getterSources=domainFixture();
const getterResult=outcome(()=>inspectProtectionQueryProperties(getterSources.policy,getterSources.catalog,getterSources.closure,getterUse));
const getterObservation={id:'query.use-accessor-not-invoked',operation:'inspectProtectionQueryProperties',sources:normalize(getterSources),inputShape:{ruleIndex:0,disclosureIndex:0,operator:'join',required:['equality'],future:{kind:'enumerable-accessor',getterInvoked:getterCalls}},outcome:{...getterResult,getterCalls}};
let proxyOwnKeysCalls=0;
const proxyUse=new Proxy({ruleIndex:0,disclosureIndex:0,operator:'join',required:['equality']},{ownKeys(target){proxyOwnKeysCalls++;return Reflect.ownKeys(target);}});
const proxySources=domainFixture();
const proxyObservation={id:'query.use-proxy-own-keys-observed',operation:'inspectProtectionQueryProperties',sources:normalize(proxySources),inputShape:{kind:'Proxy',target:{ruleIndex:0,disclosureIndex:0,operator:'join',required:['equality']},ownKeysTrap:'increments ownKeysCalls then returns Reflect.ownKeys(target)'},outcome:{...outcome(()=>inspectProtectionQueryProperties(proxySources.policy,proxySources.catalog,proxySources.closure,proxyUse)),ownKeysCalls:proxyOwnKeysCalls}};
const host={format:'umf-r8-security-protection-query-properties-host-observations/2',runtime:{bun:Bun.version},sourceHashes,captureScriptSha256:scriptSha256,observations:[getterObservation,proxyObservation]};
const jsonText=JSON.stringify(json,null,2)+'\n',hostText=JSON.stringify(host,null,2)+'\n';
if(process.argv.includes('--check')){
 if(await readFile(output,'utf8')!==jsonText)throw new Error('Frozen query-property predecessor changed; review before refresh');
 if(await readFile(hostOutput,'utf8')!==hostText)throw new Error('Frozen query-property host observations changed; review before refresh');
}else{await mkdir(dirname(output),{recursive:true});await writeFile(output,jsonText);await writeFile(hostOutput,hostText);}
console.log(JSON.stringify({mode:process.argv.includes('--check')?'check':'write',output,hostOutput,caseCount:cases.length,operationCount,hostObservationCount:host.observations.length,packetSha256:createHash('sha256').update(jsonText).digest('hex'),hostObservationsSha256:createHash('sha256').update(hostText).digest('hex')}));
