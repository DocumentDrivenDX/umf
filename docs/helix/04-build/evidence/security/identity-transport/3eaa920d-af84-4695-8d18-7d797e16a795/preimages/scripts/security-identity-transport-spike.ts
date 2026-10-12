/** Source-qualified pure owner identity transport spike; no backend admission. */
import {chromium} from 'playwright';
import {securityFixture} from '../tests/security/fixture';
const out='docs/helix/04-build/evidence/security/identity-transport/'+crypto.randomUUID();
const paths=[...new Bun.Glob('src/**/*.{ts,json}').scanSync('.'),...new Bun.Glob('tests/security/*.ts').scanSync('.'),'scripts/security-identity-transport-spike.ts'].sort();
const digests:Record<string,string>={};const hash=(raw:Uint8Array)=>new Bun.CryptoHasher('sha256').update(raw).digest('hex');
for(const path of paths){const bytes=new Uint8Array(await Bun.file(path).arrayBuffer());digests[path]=hash(bytes);await Bun.write(out+'/preimages/'+path,bytes);}
const run=async(name:string,args:string[])=>{const p=Bun.spawn(args,{stdout:'pipe',stderr:'pipe'});const [stdout,stderr,exitCode]=await Promise.all([new Response(p.stdout).text(),new Response(p.stderr).text(),p.exited]);await Bun.write(out+'/'+name+'.log',stdout+stderr);if(exitCode)throw Error(name+' failed');return exitCode;};
await run('unit',['bun','test','tests/security/identity-transport.test.ts','tests/security/dependencies.test.ts']);
await run('typecheck',['bun','node_modules/typescript/bin/tsc','--noEmit']);
await run('tools-typecheck',['bun','node_modules/typescript/bin/tsc','-p','tsconfig.tools.json']);
const built=await Bun.build({entrypoints:['src/index.ts'],outdir:out+'/bundle',target:'browser',format:'esm'});if(!built.success)throw Error('Browser bundle failed');
const bundle=built.outputs.find(a=>a.kind==='entry-point')!;const bundleBytes=new Uint8Array(await bundle.arrayBuffer());
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){return new URL(req.url).pathname==='/umf.js'?new Response(bundleBytes,{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><title>Identity transport verification</title>');}});
let browser;let observed:unknown;let browserVersion='';
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});browserVersion=browser.version();const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.port}`);
 observed=await page.evaluate(async(f)=>{
  const path='/umf.js';const owner=await import(path);const checks:{id:string;passed:boolean}[]=[];
  const check=(id:string,actual:unknown,expected:unknown)=>checks.push({id,passed:JSON.stringify(actual)===JSON.stringify(expected)});
  const result=owner.securityIdentityTransportDependencies(f.policy,f.resolution);
  check('complete-identity-fields',result.fields.map((r:any)=>r.elementId),['active','assignmentId','assignmentProject','assignmentStaff','ownerId','ownerProject','ownerResource','projectId','resourceId','staffId']);
  check('separate-policy-reads',result.policyFields.length,8);check('selected-records',result.records.map((r:any)=>r.type.elementId),['Assignment','Ownership','Project','Resource','Staff']);
  const compound=JSON.parse(JSON.stringify(f));compound.resolution.documents[0].document.modules[0].elements.find((e:any)=>e.id==='Assignment').keys[0].fields=[{module:'m',element:'assignmentStaff'},{module:'m',element:'assignmentId'}];
  check('original-compound-order',owner.securityIdentityTransportDependencies(compound.policy,compound.resolution).records.find((r:any)=>r.type.elementId==='Assignment').keyFields.map((r:any)=>r.elementId),['assignmentStaff','assignmentId']);
  const association=JSON.parse(JSON.stringify(f));association.policy.rules=[{id:'association-reader',effect:'permit',actions:['read'],target:[{documentId:'domain',moduleId:'m',elementId:'Ownership'}],condition:{op:'literal',value:true}}];
  check('association-target-identity-closure',owner.securityIdentityTransportDependencies(association.policy,association.resolution).records.map((r:any)=>r.type.elementId),['Ownership','Project','Resource','Staff']);
  const future=JSON.parse(JSON.stringify(f));future.policy.future={opaque:['preserve',null]};const before=JSON.stringify(future);let refused=false;try{owner.securityIdentityTransportDependencies(future.policy,future.resolution);}catch{refused=true;}
  check('unknown-refusal-and-source-preservation',[refused,JSON.stringify(future)===before],[true,true]);return checks;
 },JSON.parse(JSON.stringify(securityFixture())));
}finally{if(browser)await browser.close();server.stop(true);}
if(!Array.isArray(observed)||observed.length!==6||observed.some(r=>!r.passed))throw Error('Browser identity transport mismatch');
for(const [path,digest] of Object.entries(digests))if(hash(new Uint8Array(await Bun.file(path).arrayBuffer()))!==digest)throw Error('Original source changed');
const receipt={status:'owner-component-passed',bun:Bun.version,chromium:browserVersion,sourceDigests:digests,bundleSha256:hash(bundleBytes),unitTests:11,browserChecks:observed,scope:'UMF.security0.1/core0.8 typed record/association identity and endpoint closure only. Browser exported source bundle, Bun unit controls and library typecheck. No backend provider, trusted fact reconstruction, authenticated issuer/caller, disclosure/query closure or admission. Toolchain/dependency delivery is not hermetic.'};
await Bun.write(out+'/receipt.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({status:receipt.status,evidence:out,sourcePins:paths.length,browserChecks:observed.length}));
