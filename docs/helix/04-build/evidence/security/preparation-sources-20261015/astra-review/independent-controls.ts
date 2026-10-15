/** Astra read-only runtime review replay. This file is outside the repository. */
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {preparationSourcesFixture} from '/Users/erik/.codex/worktrees/security-action-source-custody/umf/tests/security/preparation-sources-fixture';
import {compilePreparationSourceObligations as compile,derivePreparationSubjectKey as derive,preparationSourceArtifact as artifact} from '/Users/erik/.codex/worktrees/security-action-source-custody/umf/tools/security/protection-preparation-sources';
const root='/Users/erik/.codex/worktrees/security-action-source-custody/umf';
const source=root+'/tools/security/protection-preparation-sources.ts';
const hash=(b:Uint8Array|string)=>createHash('sha256').update(b).digest('hex');
const sourceSha256=hash(readFileSync(source));
const change=(p:any,k:string,f:(v:any)=>void)=>{const v=JSON.parse(p[k].utf8);f(v);p[k]=artifact(v);};
const lower=(p:any,f:(v:any)=>void)=>change(p,'loweringInvocation',v=>{const r=JSON.parse(v.response);f(r);v.response=JSON.stringify(r);});
const controls:[string,(p:any)=>void][]=[
 ['query-prohibited',p=>change(p,'ontology',v=>v.entities[1].fields[0].queryUse={predicate:'prohibited'})],
 ['query-original-action',p=>change(p,'ontology',v=>v.entities[1].fields[0].queryUse={predicate:'original-authorized'})],
 ['field-parameter',p=>lower(p,v=>v.parameters[0].field.element='product-name')],
 ['value-parameter',p=>lower(p,v=>v.parameters[0].value.string='other')],
 ['key-column',p=>lower(p,v=>v.columns[2].field.element='product-name')],
 ['native-order',p=>lower(p,v=>v.ordering.direction='desc')],
 ['preflight-missing',p=>lower(p,v=>v.preflight.pop())],
 ['preflight-parameter',p=>lower(p,v=>v.preflight[0].parameters=[{value:'x'}])],
 ['unknown-lower',p=>lower(p,v=>v.future={mandatory:true})],
 ['unknown-lower-request',p=>change(p,'loweringInvocation',v=>{const r=JSON.parse(v.loweringRequest);r.future=true;v.loweringRequest=JSON.stringify(r);})],
 ['unknown-registration',p=>change(p,'loweringInvocation',v=>{const r=JSON.parse(v.registrationRequest);r.future=true;v.registrationRequest=JSON.stringify(r);})],
];
const correspondence=controls.map(([name,f])=>{const p=preparationSourcesFixture();f(p);let error:string|null=null;try{compile(p);}catch(e){error=String(e);}if(!error)throw Error('Accepted '+name);return {name,expected:'refuse',observed:'refused',error};});
const queryPositives=[undefined,'disclosed'].map(mode=>{const p=preparationSourcesFixture();if(mode)change(p,'ontology',v=>v.entities[1].fields[0].queryUse={predicate:mode});const r=compile(p);if(r.authority!==false||r.complete!==false)throw Error('Authority claim');return {name:mode??'omitted',observed:'accepted-non-authoritative'};});
const utf8hex=(s:string)=>Buffer.from(s,'utf8').toString('hex');
const packet=preparationSourcesFixture();
type CodecCase={name:string;hex:string;expected:string|null};
const positives:[string,string][]=[['alice','alice'],['empty-string',''],['composed','é'],['decomposed','e\u0301'],['astral','😀'],['bom-inside-string','\ufeff'],['tab-and-newline','\t\n'],['slash','/'],['quote','"'],['backslash','\\'],['exact-4096-byte-carrier','a'.repeat(4094)]];
const cases:CodecCase[]=positives.map(([name,value])=>({name,hex:utf8hex(JSON.stringify(value)),expected:value}));
for(const [name,raw] of [
 ['escaped-ascii','"\\u0061"'],['escaped-slash','"\\/"'],['leading-whitespace',' "alice"'],['raw-nul','"\0"'],['escaped-nul','"\\u0000"'],['escaped-high-surrogate','"\\ud800"'],['array','["alice"]'],['null','null'],['carrier-4097-bytes',JSON.stringify('a'.repeat(4095))],['escaped-low-surrogate','"\\udfff"'],
] as [string,string][])cases.push({name,hex:utf8hex(raw),expected:null});
for(const [name,hex] of [
 ['bom-outside-json','efbbbf'+utf8hex('"alice"')],['overlong-utf8','22c0af22'],['utf8-surrogate','22eda08022'],['above-unicode-max','22f490808022'],['unterminated-utf8','22e282'],['odd-hex','2'],['empty-carrier',''],
] as [string,string][])cases.push({name,hex,expected:null});
if(cases.length!==28)throw Error('Codec count');
// Independent UMFK1 String tuple byte expectation: fixed tag/header + unsigned LEB128 UTF8 length.
function expectedReceipt(value:string){const bytes=Buffer.from(value),length:number[]=[];let n=bytes.byteLength;do{let b=n%128;n=Math.floor(n/128);if(n)b+=128;length.push(b);}while(n);return '554d464b310104'+Buffer.from(length).toString('hex')+bytes.toString('hex');}
const codec=cases.map(c=>{let result:any,error:string|null=null;try{result=derive(packet.subjectMapping,packet.coreClosure,c.hex);}catch(e){error=String(e);}if(c.expected===null){if(!error)throw Error('Accepted codec '+c.name);return {name:c.name,carrierHex:c.hex,expected:'refuse',observed:'refused',error};}if(error)throw Error(c.name+': '+error);const receipt=expectedReceipt(c.expected);if(result.receipt.bytesHex!==receipt||result.key[0].string!==c.expected||result.authority!==false)throw Error('Codec mismatch '+c.name);return {name:c.name,carrierHex:c.hex,expected:'accept-exact',observed:'accepted-exact',receiptHex:receipt};});
if(hash(readFileSync(source))!==sourceSha256)throw Error('Source changed during replay');
console.log(JSON.stringify({protocol:'astra-preparation-source-independent-review/1',passed:true,runtime:{kind:'Bun-host',version:Bun.version,browserExecution:false,nativeExecution:false},source,sourceSha256,probeSha256:hash(readFileSync(import.meta.path)),correspondenceCount:correspondence.length,correspondence,queryPositives,codecCount:codec.length,codec,note:'Fresh retained replay of the prior inline review controls; no prior probe file existed. Scope is source correspondence and codec behavior only.'},null,2));
