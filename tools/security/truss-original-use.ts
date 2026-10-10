/** Reviewed host bridge; actual owner replay is the native installer's prerequisite. */
import {lowerSecurityRowPredicate} from '/Users/erik/Projects/truss/packages/postgresql/src/security-predicate.ts';
import {lowerSecurityOriginalUseProgram,lowerOriginalUsePreExecutionChecks,lowerOriginalUseTextRowsReturn} from '/Users/erik/Projects/truss/packages/postgresql/src/security-query-use.ts';
import {OriginalSecurityPreparation} from './truss-original-preparation';
const packet=JSON.parse(await Bun.stdin.text());
if(Object.keys(packet).length!==1||!Object.hasOwn(packet,'request'))throw Error('ORIGINAL_PREPARATION_REFUSED');
const foundation=await Bun.file('docs/helix/04-build/evidence/security/weft-original-use.json').json();
const host=new OriginalSecurityPreparation('/private/tmp/umf-security-weft-bridge-target/debug/examples/security_mapping_handoff',foundation.sourceDigests,foundation.artifacts[0].handoff.profile.sha256);
const handle=await host.prepare(JSON.stringify(packet.request));
const {program,request,handoff}=host.render(handle);
const artifact={request,handoff};
const ontology=JSON.parse(request.ontologyJson),binding=JSON.parse(request.bindingJson),types=binding.types;
const canonical=(v:any):any=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const expectedHandoffSha256=new Bun.CryptoHasher('sha256').update(JSON.stringify(canonical(handoff))).digest('hex');
const input={handoff,expectedHandoffSha256,bindingJson:request.bindingJson,ontologyJson:request.ontologyJson,queryProfileJson:request.queryProfileJson,expectedProfileSha256:foundation.artifacts[0].handoff.profile.sha256,target:{documentId:'domain',moduleId:'m',elementId:'Resource'},subject:ontology.subject,types,home:binding.home};
const preExecutionChecks=lowerOriginalUsePreExecutionChecks(program);
const checkedReturn=lowerOriginalUseTextRowsReturn(program);
let forgedProgramRefused=false;try{lowerOriginalUsePreExecutionChecks({...program,admission:[]});}catch{forgedProgramRefused=true;}
if(!forgedProgramRefused)throw Error('Copied query program unexpectedly rendered');
let forgedReturnRefused=false;try{lowerOriginalUseTextRowsReturn({...program,sql:'SELECT 1',admission:[]});}catch{forgedReturnRefused=true;}
if(!forgedReturnRefused)throw Error('Copied query return unexpectedly rendered');
const readPredicate=lowerSecurityRowPredicate({logicalPlan:artifact.handoff.securityLogicalPlan,action:'read',target:{documentId:'domain',moduleId:'m',elementId:'Resource'},subject:ontology.subject,types,subjectLoginColumn:'native_login'});
console.log(JSON.stringify({...program,preExecutionChecks,checkedReturn,forgedProgramRefused,forgedReturnRefused,readPredicate,input}));
