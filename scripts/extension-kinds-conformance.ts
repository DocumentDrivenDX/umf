// SPDX-License-Identifier: MIT OR Apache-2.0
/** @covers US-904-AC8 */
import {chromium} from 'playwright';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {mkdir} from 'node:fs/promises';
import {encodeRequestWire,fromWire} from '../bindings/core/node/src/wire.js';
const root=resolve(import.meta.dir,'..');
const corpusPath=resolve(root,'fixtures/extension-kinds/conformance.json');
const cases=await Bun.file(corpusPath).json() as {name:string;document:unknown;registrations:unknown[];expected:{valid:boolean;entries:number;status?:string}}[];
const nodePackage=process.env.UMF_KIND_NODE_PACKAGE;
const python=process.env.UMF_KIND_PYTHON;
if(!nodePackage||!python)throw Error('Set UMF_KIND_NODE_PACKAGE and UMF_KIND_PYTHON to installed artifacts outside the checkout');
if(resolve(nodePackage).startsWith(root+'/')||resolve(python).startsWith(root+'/'))throw Error('Installed qualification cannot run from the checkout');
const hash=(v:string|Uint8Array)=>createHash('sha256').update(v).digest('hex');
const inputs=['Cargo.lock','spec/metamodel/umf.yaml','spec/metamodel/generated/manifest.json','crates/umf-core/src/kinds.rs','crates/umf-core/src/registry.rs','crates/umf-core/src/engine.rs','crates/umf-core/src/constraints.rs','crates/umf-core-wire/src/lib.rs','bindings/core/node/index.js','bindings/core/wasm/index.js','bindings/core/python/src/lib.rs','python/src/umf/registry.py','python/src/umf/validation.py','fixtures/extension-kinds/conformance.json','fixtures/extension-kinds/dashboard.yaml','fixtures/extension-kinds/dashboard-package.json','tests/extension-kinds/browser-entry.ts','tests/extension-kinds/support.ts','scripts/extension-kinds-conformance.ts','scripts/extension-kinds-node.mjs','scripts/extension-kinds-python.py'];
const snapshot=async()=>Object.fromEntries(await Promise.all(inputs.map(async path=>[path,hash(await Bun.file(resolve(root,path)).bytes())])));
const before=await snapshot();
async function command(program:string,args:string[]){
  const child=Bun.spawn([program,...args],{cwd:root,stdout:'pipe',stderr:'pipe'});
  const [stdout,stderr,code]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);
  if(code)throw Error(program+' failed: '+stderr);return JSON.parse(stdout);
}
const nodeResults=await command(process.env.NODE??'node',['scripts/extension-kinds-node.mjs',nodePackage,root,corpusPath]);
const bunResults=await command(process.execPath,['scripts/extension-kinds-node.mjs',nodePackage,root,corpusPath]);
const pythonResults=await command(python,['scripts/extension-kinds-python.py',corpusPath]);
const pythonArtifact=await command(python,['-c',`import sys,json,hashlib,pathlib,umf,pydantic
root=pathlib.Path(umf.__file__).parent
paths=['spec/core/schema.json','spec/core/semantic-type-reference.schema.json','spec/core/extension-package.schema.json','spec/metamodel/generated/core-constraints.json','spec/metamodel/generated/domain-policy.json','spec/metamodel/generated/manifest.json']
print(json.dumps({'version':sys.version.split()[0],'pydantic':pydantic.__version__,'native':hashlib.sha256((root/'_rust_core.abi3.so').read_bytes()).hexdigest(),'resources':{p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in paths}}))`]);
for(const [path,digest] of Object.entries(pythonArtifact.resources))if(hash(await Bun.file(resolve(root,path)).bytes())!==digest)throw Error('Installed Python resource is stale: '+path);
for(const path of ['index.js','index.d.ts','src/wire.js'])if(hash(await Bun.file(resolve(nodePackage,path)).bytes())!==hash(await Bun.file(resolve(root,'bindings/core/node',path)).bytes()))throw Error('Installed Node source is stale: '+path);
const nodeVersion=await command(process.env.NODE??'node',['-e','console.log(JSON.stringify(process.versions.node))']);
const resources={coreSchema:await Bun.file('spec/core/schema.json').json(),referenceSchema:await Bun.file('spec/core/semantic-type-reference.schema.json').json(),packageSchema:await Bun.file('spec/core/extension-package.schema.json').json(),constraints:await Bun.file('spec/metamodel/generated/core-constraints.json').json(),domainPolicy:await Bun.file('spec/metamodel/generated/domain-policy.json').json()};
const cli=process.env.UMF_KIND_CLI??resolve(root,'target/debug/umf');
const requests=cases.flatMap(c=>[{op:'list-kinds',resources,registry:c.registrations},{op:'inspect-kinds',resources,registry:c.registrations,document:c.document}]);
const child=Bun.spawn([cli,'core','--stdin-wire'],{cwd:'/tmp',stdin:'pipe',stdout:'pipe',stderr:'pipe',env:{PATH:''}});
// Start draining before writing the bounded request stream.
const stdoutPromise=new Response(child.stdout).text(),stderrPromise=new Response(child.stderr).text();
child.stdin.write(requests.map(r=>encodeRequestWire(r)).join('\n')+'\n');await child.stdin.end();
const [cliOutput,cliErrors,cliCode]=await Promise.all([stdoutPromise,stderrPromise,child.exited]);
if(cliCode)throw Error('Native CLI failed: '+cliErrors);
const responses=cliOutput.trim().split('\n').map(line=>{const result=JSON.parse(line);if(result.status!=='ok')throw Error('CLI operation failed '+line);return fromWire(JSON.parse(result.wire));});
if(responses.length!==requests.length)throw Error('CLI response count differs');
const cliResults=cases.map((c,i)=>({name:c.name,listing:responses[i*2],inspection:responses[i*2+1]}));
const build=await Bun.build({entrypoints:['tests/extension-kinds/browser-entry.ts'],target:'browser',format:'esm'});
if(!build.success)throw Error(build.logs.join('\n'));const bundle=await build.outputs[0]!.text();
const server=Bun.serve({port:0,hostname:'127.0.0.1',fetch(request){
  const path=new URL(request.url).pathname;
  if(path==='/entry.js')return new Response(bundle,{headers:{'content-type':'text/javascript'}});
  const files:Record<string,string>={'/cases.json':corpusPath,'/package.json':resolve(root,'fixtures/extension-kinds/dashboard-package.json'),'/dashboard.yaml':resolve(root,'fixtures/extension-kinds/dashboard.yaml'),'/wasm/umf_core_wasm.js':resolve(root,'bindings/core/wasm/pkg/umf_core_wasm.js'),'/wasm/umf_core_wasm_bg.wasm':resolve(root,'bindings/core/wasm/pkg/umf_core_wasm_bg.wasm')};
  if(files[path])return new Response(Bun.file(files[path]!),{headers:{'content-type':path.endsWith('.wasm')?'application/wasm':path.endsWith('.js')?'text/javascript':'application/json'}});
  if(path==='/')return new Response('<!doctype html><title>Extension kinds conformance</title>');return new Response('missing',{status:404});
}});
let browser;let browserResult:any;let version='';const pageErrors:string[]=[],externalRequests:string[]=[];
try{
  browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});version=browser.version();
  const page=await browser.newPage();page.on('pageerror',error=>pageErrors.push(String(error)));page.on('request',request=>{if(new URL(request.url()).hostname!=='127.0.0.1')externalRequests.push(request.url());});
  await page.goto('http://127.0.0.1:'+server.port+'/');
  browserResult=await page.evaluate(async()=>{const path='/entry.js';const entry=await import(path);return entry.verify();});
}finally{await browser?.close();server.stop(true);}
if(pageErrors.length||externalRequests.length)throw Error('Browser failures '+JSON.stringify({pageErrors,externalRequests}));
const canonical=(v:any):string=>JSON.stringify(v,(_,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0)):value);
for(const [host,results] of Object.entries({node:nodeResults,bun:bunResults,python:pythonResults,cli:cliResults,chromium:browserResult.results})){
  if(!Array.isArray(results)||results.length!==cases.length)throw Error(host+' omitted cases');
  for(const [i,c] of cases.entries()){
    const actual=results[i];if(actual.name!==c.name||actual.inspection.sourceValidation.valid!==c.expected.valid||actual.inspection.entries.length!==c.expected.entries||c.expected.status&&actual.inspection.coverage[0]?.status!==c.expected.status)throw Error(host+' expected outcome differs: '+c.name+' '+JSON.stringify(actual));
    if(canonical(actual)!==canonical(nodeResults[i]))throw Error(host+' parity differs: '+c.name);
  }
}
if(canonical(before)!==canonical(await snapshot()))throw Error('Source changed during qualification');
const artifacts={nodeAddon:hash(await Bun.file(resolve(nodePackage,'umf_core_node.node')).bytes()),cli:hash(await Bun.file(cli).bytes()),wasm:hash(await Bun.file('bindings/core/wasm/pkg/umf_core_wasm_bg.wasm').bytes()),browserBundle:hash(bundle)};
const receipt={profile:'umf.extension-kinds.conformance/1',core:'0.10.0',catalog:'1.0.0',cases:cases.length,hosts:['native CLI (empty PATH)','installed Node package','installed Bun package','installed Python wheel','Chromium WASM'],mismatches:0,versions:{node:nodeVersion,bun:Bun.version,python:pythonArtifact.version,pydantic:pythonArtifact.pydantic,chromium:version},pythonArtifact,externalRequests:0,pageErrors:[],composition:browserResult.composition,sources:before,artifacts,limits:'Synthetic dashboard composition and generic classification only; no native BI system compatibility or platform-wide release qualification.'};
const output='docs/helix/04-build/evidence/extension-kinds';await mkdir(output,{recursive:true});await Bun.write(output+'/receipt.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
