import {createNativeGraphConditionRequest} from './truss-graph-condition-request';
/** Original draft compiler over the exact reversible native graph source.
 * Diagnostic binding input only; no public admission or actor authorization. */
import {createHash} from 'node:crypto';
const foundationPath='docs/helix/04-build/evidence/security/truss-graph-compiler-input.json';
const proofPath='docs/helix/04-build/evidence/security/original-graph-ir-formal.json';
const foundation=await Bun.file(foundationPath).json(),proof=await Bun.file(proofPath).json();
const binary='/private/tmp/umf-security-weft-bridge-target/debug/examples/security_candidate_ir';
const digest=async(path:string)=>createHash('sha256').update(await Bun.file(path).bytes()).digest('hex');
const pins:Record<string,string>={...foundation.sourceDigests,...proof.sourceDigests};
for(const [path,hash] of Object.entries(pins))if(await digest(path)!==hash)throw Error('Stale original graph/compiler basis');
for(const path of [foundationPath,proofPath,binary,'tools/security/truss-graph-condition-input.ts','tools/security/truss-graph-condition-request.ts'])pins[path]=await digest(path);
if(pins[binary]!==proof.binarySha256)throw Error('Original compiler binary differs');
const request=createNativeGraphConditionRequest(foundation.request.modules);
const process=Bun.spawn([binary],{stdin:new Blob([JSON.stringify(request)]),stdout:'pipe',stderr:'pipe'});
const [exitCode,stdout,stderr]=await Promise.all([process.exited,new Response(process.stdout).text(),new Response(process.stderr).text()]);
if(exitCode)throw Error(stderr);const rules=JSON.parse(stdout);
if(rules.length!==1||rules[0].id!=='membership'||rules[0].condition.exists?.witness!=='opaqueExistential')throw Error('Original graph compiler output differs');
for(const [path,hash] of Object.entries(pins))if(await digest(path)!==hash)throw Error('Original source changed');
await Bun.write('docs/helix/04-build/evidence/security/truss-graph-condition-input.json',JSON.stringify({status:'passed-original-draft-graph-condition',nativeImplementationQualified:false,sourceDigests:pins,binarySha256:pins[binary],request,rules,scope:'Original draft0.2 compiler IR over unchanged core0.8 reversible native graph document with original primary Key metadata retained. No public compiler admission, authenticated mapping or backend acceptance.'},null,2)+'\n');
console.log(JSON.stringify({status:'passed-original-draft-graph-condition',rules:rules.length}));
