// SPDX-License-Identifier: MIT OR Apache-2.0
// Installed-package qualification for the two Rust-selected CSV Boolean APIs.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {cp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {extname, join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const repo=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const archive=resolve(process.argv[2]??'');
const output=process.argv[3]?resolve(process.argv[3]):null;
if(!process.argv[2])throw new Error('Usage: bun scripts/rust-migration/r8/csv-boolean-default-route-installed.mjs <umf-sdk.tgz> [receipt.json]');
const packet=JSON.parse(await readFile(join(repo,'scripts/rust-migration/r5/csv-boolean-default-route/predecessor.json'),'utf8'));
assert.equal(packet.format,'umf-r5-csv-boolean-default-route-predecessor/1');
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const temp=join(tmpdir(),'umf-r8-csv-installed-'+process.pid+'-'+Date.now());
await mkdir(temp,{recursive:true});
const root=join(temp,'node_modules/@umf/core');
await mkdir(root,{recursive:true});
const run=async(command,args,cwd=temp)=>{
 const child=Bun.spawn([command,...args],{cwd,stdout:'pipe',stderr:'pipe'});
 const [stdout,stderr]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text()]);
 const code=await child.exited;
 return {code,stdout:stdout.trim(),stderr:stderr.trim()};
};
const assertPass=(result,label)=>assert.equal(result.code,0,`${label} failed (${result.code})\n${result.stdout}\n${result.stderr}`);
function buildCaseSet(route,source){
 const request=(token,sourceContext={source:'original.csv',row:1,column:'active',unknown:{retained:['雪',null]}})=>({profile:'umf.csv-boolean-lexical/1.0.0',field:{module:'domain',element:'patients.active'},token,sourceContext});
 const outcome=run=>{try{return {status:'accepted',value:run()}}catch(error){return {status:'refused',name:error.name,prototype:Object.getPrototypeOf(error)?.constructor?.name??null,code:error.code??null,path:error.path??'',message:error.message}}};
 const cases={};
 for(const token of ['true','false','True','False'])cases[`token:${token}`]=route.validateCsvBooleanLexical(source,request(token));
 const constrained=structuredClone(source);constrained.modules[0].elements.find(e=>e.id==='patients.active').allowedValues=[{boolean:false}];cases.allowedValueMismatch=route.validateCsvBooleanLexical(constrained,request('True'));
 const unknown=structuredClone(source);unknown.modules[0].elements.find(e=>e.id==='patients.active').facets={futureBooleanRule:{meaning:'unknown'}};cases.unknownSelectedSemantics=route.validateCsvBooleanLexical(unknown,request('true'));
 cases.wrongFieldKind=outcome(()=>route.validateCsvBooleanLexical(source,{...request('true'),field:{module:'domain',element:'patients.birth_date'}}));
 const arrayField=structuredClone(source);arrayField.modules[0].elements.find(e=>e.id==='patients.active').cardinality='array';cases.wrongFieldCardinality=outcome(()=>route.validateCsvBooleanLexical(arrayField,request('true')));
 cases.unsupportedToken=outcome(()=>route.validateCsvBooleanLexical(source,{...request('true'),token:'TRUE'}));
 cases.requestShapeBeforeSourceInspection=outcome(()=>route.validateCsvBooleanLexical({}, {...request('true'),profile:'future'}));
 let reads=0;const guarded=Object.defineProperty({},'umf',{enumerable:true,get(){reads++;return '0.10.0'}});
 cases.invalidReceiptBeforeExpectedInput={result:outcome(()=>route.verifyCsvBooleanLexical({},guarded,request('true'))),expectedSourceReads:reads};
 let validReads=0;const validGuarded=Object.defineProperty({},'umf',{enumerable:true,get(){validReads++;return '0.10.0'}});
 cases.validReceiptThenExpectedGetter={result:outcome(()=>route.verifyCsvBooleanLexical(route.validateCsvBooleanLexical(source,request('true')),validGuarded,request('true'))),expectedSourceReads:validReads};
 const pairRequest=sourceContext=>({profile:'umf.csv-boolean-lexical/1.0.0',field:{module:'domain',element:'patients.active'},sourceContext});
 const bytes=value=>new TextEncoder().encode(JSON.stringify(value)).length;
 const base=pairRequest('');const baseBytes=bytes({source,request:base});const exact=pairRequest('x'.repeat(4_000_000-baseBytes));const over=pairRequest(`${exact.sourceContext}x`);
 cases.inputByteLimit={limit:4_000_000,exactPairBytes:bytes({source,request:exact}),exact:outcome(()=>route.validateCsvBooleanLexical(source,exact)),overPairBytes:bytes({source,request:over}),over:outcome(()=>route.validateCsvBooleanLexical(source,over))};
 const empty=route.validateCsvBooleanLexical(source,request('true',''));const receiptBytes=bytes(empty);const atReceipt=request('true','x'.repeat(4_000_000-receiptBytes));const overReceipt=request('true',`${atReceipt.sourceContext}x`);
 cases.receiptByteLimit={limit:4_000_000,exactReceiptBytes:bytes(route.validateCsvBooleanLexical(source,atReceipt)),exact:outcome(()=>route.validateCsvBooleanLexical(source,atReceipt)),over:outcome(()=>route.validateCsvBooleanLexical(source,overReceipt))};
 return cases;
}
const canonical=value=>JSON.stringify(value,(key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(name=>[name,item[name]])):item);
let server,browser;
try{
 const extract=await run('tar',['-xzf',archive,'--strip-components=1','-C',root]);assertPass(extract,'archive extraction');
 const archiveBytes=await readFile(archive);
 const archiveManifest=JSON.parse(await readFile(join(root,'manifest.json'),'utf8'));
 const sdkManifest=JSON.parse(await readFile(join(root,'dist/rust-default-manifest.json'),'utf8'));
 const pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
 assert.equal(archiveManifest.profile,'umf.sdk.distribution.rust-default/1');
 assert.equal(archiveManifest.releaseStatus,'private-r7-default-route-qualification-not-publishable');
 assert.equal(archiveManifest.sourceTransformStatus,'fixed-point');
 assert.equal(archiveManifest.sourceTreeSha256,sdkManifest.sourceClosure.sha256);
 assert.equal(archiveManifest.capturedLiveSourceTreeSha256,sdkManifest.sourceClosure.capturedLiveSha256);
 assert.equal(archiveManifest.sourceTreeSha256,archiveManifest.capturedLiveSourceTreeSha256);
 assert.equal(pkg.exports['.'].node,'./dist/umf-node.js');
 assert.equal(pkg.exports['.'].browser,'./dist/umf-browser.js');
 assert.equal(pkg.exports['.'].import,'./dist/umf-browser.js');
 assert.equal(pkg.exports['./reference'].import,'./dist/umf.js');
 for(const [name,digest] of Object.entries(archiveManifest.sha256))assert.equal(sha256(await readFile(join(root,name))),digest,`archive member digest: ${name}`);

 const source=JSON.parse(await readFile(join(root,'dist/spec/domain-packs/medical/ontology.json'),'utf8'));
 await writeFile(join(temp,'packet.json'),JSON.stringify(packet));
 const nodeProbe=`import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import * as root from '@umf/core';import * as reference from '@umf/core/reference';const packet=JSON.parse(await readFile('./packet.json','utf8'));const source=${JSON.stringify(source)};${buildCaseSet.toString()};const canonical=${canonical.toString()};assert(import.meta.resolve('@umf/core').endsWith('/dist/umf-node.js'));assert(import.meta.resolve('@umf/core/reference').endsWith('/dist/umf.js'));assert.ok(canonical(buildCaseSet(root,source))===canonical(packet.cases),'full frozen predecessor case set differs');assert.equal(typeof reference.validateCsvBooleanLexical,'function');console.log(JSON.stringify({node:process.version,root:import.meta.resolve('@umf/core'),reference:import.meta.resolve('@umf/core/reference'),cases:Object.keys(packet.cases).length}));`;
 await writeFile(join(temp,'installed-probe.mjs'),nodeProbe);
 const node=await run('node',['installed-probe.mjs']);assertPass(node,'installed Node replay');
 const bun=await run('bun',['installed-probe.mjs']);assertPass(bun,'installed Bun replay');

 const nativeAddonControls={};
 for(const runtime of ['node','bun'])for(const mode of ['missing','corrupt']){
  const badBase=join(temp,`bad-${runtime}-${mode}`),badRoot=join(badBase,'node_modules/@umf/core');await mkdir(badRoot,{recursive:true});await cp(root,badRoot,{recursive:true});
  if(mode==='missing')await rm(join(badRoot,'dist/umf_core_node.node'));
  else await writeFile(join(badRoot,'dist/umf_core_node.node'),new Uint8Array([0,1,2,3]));
  const probe=await run(runtime,['--input-type=module','-e',"await import('@umf/core')"],badBase);
  assert.notEqual(probe.code,0,`${runtime} ${mode} native addon unexpectedly imported`);
  assert.match(probe.stderr,/umf_core_node\.node|dlopen|MODULE_NOT_FOUND|ERR_DLOPEN_FAILED/i,`${runtime} ${mode} refusal lacked native addon boundary: ${probe.stderr}`);
  nativeAddonControls[`${runtime}-${mode}`]={refused:true,diagnostic:probe.stderr.split('\n').at(-1)};
 }

 const browserRoot='/node_modules/@umf/core/dist/umf-browser.js';
 const browserProbe=`import * as root from '@umf/core';import * as reference from '@umf/core/reference';const packet=await(await fetch('/packet.json')).json();${buildCaseSet.toString()};const canonical=${canonical.toString()};const source=await(await fetch('/source.json')).json();const actual=buildCaseSet(root,source);if(canonical(actual)!==canonical(packet.cases))throw new Error('full frozen predecessor case set differs');if(typeof process!=='undefined'||typeof Buffer!=='undefined')throw new Error('Node globals present');if(typeof reference.validateCsvBooleanLexical!=='function')throw new Error('reference import missing');window.csvProbe={cases:Object.keys(actual).length,malformedReceiptExpectedSourceReads:actual.invalidReceiptBeforeExpectedInput.expectedSourceReads}`
 const html=`<!doctype html><meta charset="utf-8"><script type="importmap">${JSON.stringify({imports:{'@umf/core':browserRoot,'@umf/core/reference':'/node_modules/@umf/core/dist/umf.js'}})}</script><script type="module" src="/browser-probe.js"></script>`;
 const pageErrors=[],badResponses=[],requests=[];
 server=createServer(async(req,res)=>{const path=new URL(req.url??'/', 'http://127.0.0.1').pathname;const relative=path==='/'?'index.html':path.slice(1);requests.push(relative);if(relative==='index.html'){res.writeHead(200,{'content-type':'text/html'});res.end(html);return}if(relative==='browser-probe.js'){res.writeHead(200,{'content-type':'text/javascript'});res.end(browserProbe);return}if(relative==='source.json'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(source));return}if(relative==='packet.json'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(packet));return}try{const bytes=await readFile(join(temp,relative));res.writeHead(200,{'content-type':extname(relative)==='.wasm'?'application/wasm':extname(relative)==='.js'?'text/javascript':'application/octet-stream'});res.end(bytes)}catch{badResponses.push(relative);res.writeHead(404);res.end('not found')}});
 await new Promise(resolveListen=>server.listen(0,'127.0.0.1',resolveListen));const address=server.address();assert(address&&typeof address!=='string');
 browser=await chromium.launch({headless:true});const page=await browser.newPage();page.on('pageerror',error=>pageErrors.push(String(error)));await page.goto(`http://127.0.0.1:${address.port}/`);await page.waitForFunction(()=>Boolean(window.csvProbe),undefined,{timeout:60000});
 const browserResult=await page.evaluate(()=>({probe:window.csvProbe,userAgent:navigator.userAgent}));assert.deepEqual(pageErrors,[]);assert.equal(browserResult.probe.cases,Object.keys(packet.cases).length);assert(requests.includes('node_modules/@umf/core/dist/umf_core_wasm_bg.wasm'));
 const receipt={format:'umf.r8.csv-boolean-default-route-installed/1',status:'pass',archive:{path:archive,sha256:sha256(archiveBytes),bytes:archiveBytes.byteLength,manifestSha256:sha256(await readFile(join(root,'manifest.json')))},sourceClosure:{sha256:sdkManifest.sourceClosure.sha256,capturedLiveSha256:sdkManifest.sourceClosure.capturedLiveSha256,fileCount:sdkManifest.sourceClosure.fileCount,transform:sdkManifest.sourceClosure.transform},predecessorSha256:sha256(await readFile(join(repo,'scripts/rust-migration/r5/csv-boolean-default-route/predecessor.json'))),harnessSha256:sha256(await readFile(fileURLToPath(import.meta.url))),packageHelperSha256:sha256(await readFile(join(repo,'scripts/rust-migration/r8/csv-boolean-default-route-package.py'))),packageRoutes:{node:pkg.exports['.'].node,browser:pkg.exports['.'].browser,import:pkg.exports['.'].import,reference:pkg.exports['./reference'].import},operations:['validateCsvBooleanLexical','verifyCsvBooleanLexical'],node:node.stdout,bun:bun.stdout,chromium:{version:browser.version(),userAgent:browserResult.userAgent,...browserResult.probe,wasmRequested:requests.includes('node_modules/@umf/core/dist/umf_core_wasm_bg.wasm')},nativeAddonControls,qualification:'Private installed archive replay for the two CSV Boolean exports only; not a full SDK, retirement, or release qualification.'};
 if(output){await mkdir(resolve(output,'..'),{recursive:true});await writeFile(output,JSON.stringify(receipt,null,2)+'\n')};console.log(JSON.stringify(receipt,null,2));
}finally{await browser?.close();if(server)await new Promise(done=>server.close(done));await rm(temp,{recursive:true,force:true});}
