// SPDX-License-Identifier: MIT OR Apache-2.0
// Installed raw-profile route qualification for a source-pinned private SDK archive.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {copyFile, mkdir, readFile, readdir, rm, symlink, writeFile} from 'node:fs/promises';
import {extname, join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const repo=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const archive=resolve(process.argv[2]??'');
const output=process.argv[3]?resolve(process.argv[3]):null;
const expectedClosure=process.argv[4]??null;
if(!process.argv[2])throw new Error('Usage: bun scripts/rust-migration/r8/raw-profile-current-installed.mjs <umf-sdk.tgz> [receipt.json] [source-closure-sha256]');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const canonical=value=>JSON.stringify(value,(key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(name=>[name,item[name]])):item);
const files=['logical.json','lakebase.json','unity-catalog.json','spark-delta.json'];
const fixturePaths=Object.fromEntries(files.map(name=>[name,join(repo,'fixtures/binding/raw-profiles',name)]));
const fixtureBytes=Object.fromEntries(await Promise.all(files.map(async name=>[name,await readFile(fixturePaths[name])])));
const fixtures=Object.fromEntries(files.map(name=>[name.replace('.json',''),JSON.parse(fixtureBytes[name])]));
const rawCases=[];
for(const system of ['lakebase','unity-catalog','spark-delta']){
 const binding=fixtures[system],logical=fixtures.logical,profile=binding.extensions['umf.binding'];
 const target={platform:system,majorVersion:profile.target.version};
 rawCases.push({name:system,binding,logical,target,module:'sales'});
 const missing=structuredClone(logical);delete missing.modules[0].elements[1].members;
 rawCases.push({name:system+'-missing-members',binding,logical:missing,target,module:'sales'});
 rawCases.push({name:system+'-target-version-mismatch',binding,logical,target:{...target,majorVersion:target.majorVersion+'.1'},module:'sales'});
}
const casePayload=JSON.stringify(rawCases);
const temp=join(tmpdir(),`umf-r8-raw-profile-current-installed-${process.pid}-${Date.now()}`);
const packageRoot=join(temp,'node_modules/@umf/core');
const run=async(command,args,cwd=temp)=>{const child=Bun.spawn([command,...args],{cwd,stdout:'pipe',stderr:'pipe'});const [stdout,stderr]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text()]);return{code:await child.exited,stdout:stdout.trim(),stderr:stderr.trim()}};
const assertPass=(result,label)=>assert.equal(result.code,0,`${label} failed (${result.code})\n${result.stdout}\n${result.stderr}`);
const probeSource=`
import assert from 'node:assert/strict';
import * as root from '@umf/core';import * as reference from '@umf/core/reference';
const cases=${casePayload};
const canonical=${canonical.toString()};
const outcome=(fn,c)=>{try{return{ok:true,value:fn(c.binding,c.logical,c.target,c.module)}}catch(e){return{ok:false,error:{name:e.name,code:e.code??null,path:e.path??'',message:e.message??String(e)}}}};
const all=api=>Object.fromEntries(cases.map(c=>[c.name,outcome(api.inspectRawTableBinding,c)]));
const def=all(root),ref=all(reference);assert.equal(canonical(def),canonical(ref),'default/reference raw-profile route parity');
const base=cases[0],make=()=>structuredClone(base.binding);
let getterCalls=0;const hostile=make();Object.defineProperty(hostile,'future',{enumerable:true,configurable:true,get(){getterCalls++;throw new Error('getter invoked')}});
const host={default:outcome((b,l,t,m)=>root.inspectRawTableBinding(b,l,t,m),{...base,binding:hostile}),reference:outcome((b,l,t,m)=>reference.inspectRawTableBinding(b,l,t,m),{...base,binding:hostile}),getterCalls};
assert.equal(getterCalls,0,'accessor admission never invokes getter');assert.equal(canonical(host.default),canonical(host.reference),'accessor error parity');
console.log(JSON.stringify({runtime:typeof Bun==='undefined'?'Node '+process.version:'Bun '+Bun.version,entry:import.meta.resolve('@umf/core'),referenceEntry:import.meta.resolve('@umf/core/reference'),caseCount:cases.length,results:def,hostShape:host}));
`;
let browser,server;
try{
 await mkdir(packageRoot,{recursive:true});
 assertPass(await run('tar',['-xzf',archive,'--strip-components=1','-C',packageRoot]),'archive extraction');
 const archiveBytes=await readFile(archive),manifest=JSON.parse(await readFile(join(packageRoot,'manifest.json'),'utf8'));
 const sdk=JSON.parse(await readFile(join(packageRoot,'dist/rust-default-manifest.json'),'utf8'));
 const pkg=JSON.parse(await readFile(join(packageRoot,'package.json'),'utf8'));
 assert.equal(manifest.profile,'umf.sdk.distribution.rust-default/1');assert.equal(manifest.releaseStatus,'private-r7-default-route-qualification-not-publishable');
 assert.equal(manifest.sourceTransformStatus,'fixed-point');assert.equal(manifest.sourceTransformCount,0);
 if(expectedClosure)assert.equal(manifest.sourceTreeSha256,expectedClosure,'pinned source closure');
 assert.equal(manifest.sourceTreeSha256,sdk.sourceClosure.sha256);assert.equal(manifest.capturedLiveSourceTreeSha256,sdk.sourceClosure.capturedLiveSha256);assert.equal(manifest.sourceTreeSha256,manifest.capturedLiveSourceTreeSha256);
 assert.equal(pkg.exports['.'].node,'./dist/umf-node.js');assert.equal(pkg.exports['.'].browser,'./dist/umf-browser.js');assert.equal(pkg.exports['.'].import,'./dist/umf-browser.js');assert.equal(pkg.exports['./reference'].import,'./dist/umf.js');
 for(const [name,digest]of Object.entries(manifest.sha256))assert.equal(sha(await readFile(join(packageRoot,name))),digest,`archive member digest: ${name}`);
 for(const [name,bytes]of Object.entries(fixtureBytes))assert.equal(sha(bytes),sha(await readFile(fixturePaths[name])),`fixture changed during capture: ${name}`);
 await writeFile(join(temp,'raw-profile-probe.mjs'),probeSource);
 const node=await run('node',['raw-profile-probe.mjs']);assertPass(node,'installed Node replay');
 const bun=await run('bun',['raw-profile-probe.mjs']);assertPass(bun,'installed Bun replay');
 const nodeResult=JSON.parse(node.stdout),bunResult=JSON.parse(bun.stdout);
 assert.equal(canonical(nodeResult.results),canonical(bunResult.results),'Node/Bun outcome parity');
 assert.equal(canonical(nodeResult.hostShape),canonical(bunResult.hostShape),'Node/Bun admission parity');
 const nativeFailureControls={};
 for(const runtime of ['node','bun'])for(const mode of ['missing','corrupt']){
  const badBase=join(temp,`bad-${runtime}-${mode}`),badRoot=join(badBase,'node_modules/@umf/core');
  await mkdir(join(badRoot,'dist'),{recursive:true});await writeFile(join(badRoot,'package.json'),await readFile(join(packageRoot,'package.json')));
  for(const item of await readdir(join(packageRoot,'dist')))if(!['umf_core_node.node','umf-node.js'].includes(item))await symlink(join(packageRoot,'dist',item),join(badRoot,'dist',item));
  await copyFile(join(packageRoot,'dist/umf-node.js'),join(badRoot,'dist/umf-node.js'));
  if(mode==='corrupt')await writeFile(join(badRoot,'dist/umf_core_node.node'),new Uint8Array([0,1,2,3]));
  const damaged=`try{await import('@umf/core');console.log(JSON.stringify({status:'imported'}))}catch(e){console.log(JSON.stringify({status:'import-refused',name:e.name,code:e.code??null}))}`;
  await writeFile(join(badBase,'probe.mjs'),damaged);const result=await run(runtime,['probe.mjs'],badBase);assertPass(result,`${runtime} ${mode} addon control`);
  const parsed=JSON.parse(result.stdout);assert.equal(parsed.status,'import-refused',`${runtime} ${mode} addon must refuse`);nativeFailureControls[`${runtime}-${mode}`]=parsed;
 }
 const routeBase=`import * as root from '@umf/core';import * as reference from '@umf/core/reference';const cases=await(await fetch('/cases')).json();const canon=${canonical.toString()};const out=api=>Object.fromEntries(cases.map(c=>{try{return[c.name,{ok:true,value:api.inspectRawTableBinding(c.binding,c.logical,c.target,c.module)}]}catch(e){return[c.name,{ok:false,error:{name:e.name,code:e.code??null,path:e.path??'',message:e.message??String(e)}}]}}));const results=out(root),referenceResults=out(reference);if(canon(results)!==canon(referenceResults))throw Error('browser default/reference mismatch');const c=cases[0],binding=structuredClone(c.binding);let getterCalls=0;Object.defineProperty(binding,'future',{enumerable:true,get(){getterCalls++;throw Error('getter invoked')}});const capture=api=>{try{return{ok:true,value:api.inspectRawTableBinding(binding,c.logical,c.target,c.module)}}catch(e){return{ok:false,error:{name:e.name,code:e.code??null,path:e.path??'',message:e.message??String(e)}}}};const hostShape={default:capture(root),reference:capture(reference),getterCalls};if(getterCalls||canon(hostShape.default)!==canon(hostShape.reference))throw Error('browser admission mismatch');window.rawProfileProbe={results,hostShape,nodeGlobalsAbsent:!('process'in globalThis)&&!('Buffer'in globalThis)&&!('Bun'in globalThis)};`;
 const html=`<!doctype html><meta charset="utf-8"><script type="importmap">${JSON.stringify({imports:{'@umf/core':'/node_modules/@umf/core/dist/umf-browser.js','@umf/core/reference':'/node_modules/@umf/core/dist/umf.js'}})}</script><script type="module" src="/probe.js"></script>`;
 const requests=[];server=createServer(async(req,res)=>{const path=new URL(req.url??'/','http://localhost').pathname.slice(1)||'index.html';requests.push(path);if(path==='index.html'){res.writeHead(200,{'content-type':'text/html'});res.end(html);return}if(path==='probe.js'){res.writeHead(200,{'content-type':'text/javascript'});res.end(routeBase);return}if(path==='cases'){res.writeHead(200,{'content-type':'application/json'});res.end(casePayload);return}try{const data=await readFile(join(temp,path));res.writeHead(200,{'content-type':extname(path)==='.wasm'?'application/wasm':'text/javascript'});res.end(data)}catch{res.writeHead(404);res.end()}});
 await new Promise(resolveListen=>server.listen(0,'127.0.0.1',resolveListen));const address=server.address();assert(address&&typeof address!=='string');
 browser=await chromium.launch({headless:true});const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(String(error)));await page.goto(`http://127.0.0.1:${address.port}/`);
 await page.waitForFunction(()=>Boolean(window.rawProfileProbe),undefined,{timeout:60000});assert.deepEqual(errors,[]);const browserResult=await page.evaluate(()=>window.rawProfileProbe);
 assert.deepEqual(browserResult.nodeGlobalsAbsent,true);assert.equal(canonical(browserResult.results),canonical(nodeResult.results),'Chromium/Node outcomes');assert.equal(canonical(browserResult.hostShape),canonical(nodeResult.hostShape),'Chromium/Node admission shape');
 const wasmRequested=requests.some(path=>path.endsWith('umf_core_wasm_bg.wasm'));assert.equal(wasmRequested,true,'Chromium requested packaged WASM');
 const receipt={format:'umf.r8.raw-profile-current-installed/1',status:'pass',archive:{path:archive,sha256:sha(archiveBytes),bytes:archiveBytes.byteLength,manifestSha256:sha(await readFile(join(packageRoot,'manifest.json'))),verifiedMemberCount:Object.keys(manifest.sha256).length,sourceClosureSha256:manifest.sourceTreeSha256,capturedLiveSourceSha256:manifest.capturedLiveSourceTreeSha256,sourceFileCount:manifest.sourceFileCount??sdk.sourceClosure.fileCount,transform:{status:manifest.sourceTransformStatus,generatedInputCount:manifest.sourceTransformCount??0}},packageVersion:pkg.version,routes:{node:pkg.exports['.'].node,browser:pkg.exports['.'].browser,reference:pkg.exports['./reference'].import},fixtures:Object.fromEntries(Object.entries(fixtureBytes).map(([name,bytes])=>[name,sha(bytes)])),harnessSha256:sha(await readFile(fileURLToPath(import.meta.url))),runtime:{node:nodeResult,bun:bunResult,chromium:{version:browser.version(),caseCount:rawCases.length,nodeGlobalsAbsent:browserResult.nodeGlobalsAbsent,wasmRequested,results:browserResult.results,hostShape:browserResult.hostShape}},nativeFailureControls,qualification:'Installed private archive qualification for the bounded raw-profile fixture/admission cohort only; no native Lakebase, Unity Catalog, or Spark execution, full SDK, retirement, platform matrix, or release claim.'};
 if(output)await writeFile(output,JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt,null,2));
}finally{await browser?.close();if(server)await new Promise(done=>server.close(done));await rm(temp,{recursive:true,force:true})}
