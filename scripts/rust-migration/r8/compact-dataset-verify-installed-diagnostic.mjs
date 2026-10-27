// SPDX-License-Identifier: MIT OR Apache-2.0
// Installed-archive replay for verifyCoreDatasetValuesCompact.
// Source-coherent qualification requires explicit archive/closure pins and packaged input pins.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile,rm,realpath} from 'node:fs/promises';
import {extname,join,resolve,posix} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const repo=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const archive=resolve(process.argv[2]??join(repo,'.cache/sdk-distribution/cohorts/bdb716aa/umf-sdk.tgz'));
const expectedArchiveSha=process.argv[3]??'242336e7d6d1ea88434b31fcb908f47b4522f021690ccb55b95ccbc27c8dac50';
const expectedClosure=process.argv[4]??'bdb716aa53ab9c45f058266534580bd59d50b725de77ce3dd07b156fba68dbd1';
const output=process.argv[5]?resolve(process.argv[5]):null;
const packet=join(repo,'docs/helix/04-build/evidence/rust-migration/r8-compact-dataset-verify-source');
const caseNames=['commerce-complete','stale-source-input-canonical-skipped','stale-source-expected-input-copy-limit','near-limit-accepted','near-limit-first-refused'];
const harnessPath='scripts/rust-migration/r8/compact-dataset-verify-installed-diagnostic.mjs';
const packetPaths=['docs/helix/04-build/evidence/rust-migration/r8-compact-dataset-verify-source/index.json',...caseNames.map(name=>`docs/helix/04-build/evidence/rust-migration/r8-compact-dataset-verify-source/frozen-${name}.json`)];
const qualificationInputPaths=[harnessPath,...packetPaths];
const explicitPins=Boolean(process.argv[2]&&process.argv[3]&&process.argv[4]);
const sha=b=>createHash('sha256').update(b).digest('hex');
const canonical=v=>Array.isArray(v)?`[${v.map(canonical).join(',')}]`:v!==null&&typeof v==='object'?`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`:JSON.stringify(v);
const capture=fn=>{try{return{kind:'return',value:fn()}}catch(e){return{kind:'throw',name:e?.name??'',failure:{code:e?.code??'',message:String(e?.message??e),path:e?.path??''}}}};
const frozen={};
for(const name of caseNames)frozen[name]=JSON.parse(await readFile(join(packet,`frozen-${name}.json`),'utf8'));
const expected=(caseFile,c)=>c.result!==undefined?{kind:'return',value:c.result}:{kind:'throw',name:'UmfError',failure:{code:c.thrown.code,message:c.thrown.message,path:c.thrown.path??''}};
const qualify=(explicit,missing,fixedPoint)=>explicit&&missing.length===0&&fixedPoint;
const compareInputPins=(paths,pins,actual)=>{
  for(const path of paths)if(pins[path]!==undefined&&pins[path]!==actual[path])throw new Error(`source closure input pin mismatch: ${path}`);
  return paths.filter(path=>typeof pins[path]!=='string');
};
assert.deepEqual(compareInputPins(['expected'],{},{}),['expected']);
assert.throws(()=>compareInputPins(['expected'],{expected:'0'.repeat(64)},{expected:'1'.repeat(64)}),/source closure input pin mismatch/);
const temp=join(tmpdir(),`umf-r8-compact-verify-${process.pid}-${Date.now()}`);
const run=async(cmd,args,cwd=repo)=>{const executable=cmd==='tar'?'/usr/bin/tar':cmd==='node'?Bun.which('node'):cmd==='bun'?Bun.which('bun'):cmd;const p=Bun.spawn([executable,...args],{cwd,env:process.env,stdout:'pipe',stderr:'pipe'});const [out,err]=await Promise.all([new Response(p.stdout).text(),new Response(p.stderr).text()]);const code=await p.exited;assert.equal(code,0,`${cmd} ${args.join(' ')} failed\n${out}\n${err}`);return out.trim()};
const traced=(label,events,target={})=>new Proxy(target,{ownKeys(t){events.push(label);return Reflect.ownKeys(t)}});
const exercise=(root,reference,files,dispatch)=>{
  const rows=Object.entries(files).map(([id,c])=>{
    const beforeReference=dispatch();
    const r=capture(()=>reference.verifyCoreDatasetValuesCompact(c.receipt,c.current,c.expectedInput));
    const referenceCalls=dispatch()-beforeReference;
    assert.equal(referenceCalls,0,'reference operation unexpectedly dispatched native code');
    assert.equal(canonical(r),canonical(expected(id,c)),`installed reference ${id}`);
    const beforeDefault=dispatch();
    const value=capture(()=>root.verifyCoreDatasetValuesCompact(c.receipt,c.current,c.expectedInput));
    const defaultCalls=dispatch()-beforeDefault;
    assert.equal(canonical(value),canonical(expected(id,c)),`installed default ${id}`);
    assert(defaultCalls>0,`default route did not dispatch for ${id}`);
    return{id,reference:r,default:value,referenceCalls,defaultCalls};
  });
  const base=files['commerce-complete'];
  const controls=api=>{
    const malformedTrace=[];
    const malformed=capture(()=>api.verifyCoreDatasetValuesCompact({},traced('current',malformedTrace),traced('expectedInput',malformedTrace,base.expectedInput)));
    assert.equal(malformed.kind,'throw');assert.equal(malformed.failure.code,'CORE_DATASET_COMPACT_RECEIPT');assert.deepEqual(malformedTrace,[]);
    const order=[];
    const stale=capture(()=>api.verifyCoreDatasetValuesCompact(base.receipt,traced('current',order,{}),traced('expectedInput',order,base.expectedInput)));
    assert.equal(stale.kind,'throw');assert.equal(stale.failure.code,'CORE_DATASET_COMPACT_RECEIPT');
    assert(order.lastIndexOf('current')<order.indexOf('expectedInput'),'current must be copied before expectedInput');
    const sentinel=new Error('caller proxy ownKeys sentinel');let caught;
    try{api.verifyCoreDatasetValuesCompact(base.receipt,new Proxy({}, {ownKeys(){throw sentinel}}),base.expectedInput)}catch(e){caught=e}
    assert.equal(caught,sentinel,'caller proxy error identity');
    return{malformedReceipt:{failure:malformed.failure,trace:malformedTrace},staleCurrent:{failure:stale.failure,trace:order},callerProxyErrorIdentity:true};
  };
  return{rows,hostControls:controls(root),referenceControls:controls(reference)};
};
try{
  const archiveBytes=await readFile(archive);assert.equal(sha(archiveBytes),expectedArchiveSha,'pinned archive SHA-256');
  const listing=(await run('tar',['-tzf',archive])).split('\n').filter(Boolean);
  for(const member of listing){const n=posix.normalize(member);assert(!member.startsWith('/')&&!n.startsWith('../')&&!n.split('/').includes('..'),`unsafe archive path ${member}`)}
  await mkdir(temp,{recursive:true});const root=join(temp,'node_modules/@umf/core');await mkdir(root,{recursive:true});await run('tar',['-xzf',archive,'--strip-components=1','-C',root]);
  const manifest=JSON.parse(await readFile(join(root,'manifest.json'))),pkg=JSON.parse(await readFile(join(root,'package.json'))),rustManifest=JSON.parse(await readFile(join(root,'dist/rust-default-manifest.json')));
  assert.equal(manifest.profile,'umf.sdk.distribution.rust-default/1');
  assert.equal(manifest.sourceTreeSha256,expectedClosure);assert.equal(manifest.sourceTreeSha256,rustManifest.sourceClosure.sha256);
  assert.equal(pkg.name,'@umf/core');assert.equal(pkg.exports['.'].node,'./dist/umf-node.js');assert.equal(pkg.exports['.'].browser,'./dist/umf-browser.js');assert.equal(pkg.exports['./reference'].import,'./dist/umf.js');
  for(const [member,digest] of Object.entries(manifest.sha256))assert.equal(sha(await readFile(join(root,member))),digest,`archive member hash ${member}`);
  const sourceInputs=rustManifest.sourceClosure.inputs??{};
  const currentInputHashes=Object.fromEntries(await Promise.all(qualificationInputPaths.map(async path=>[path,sha(await readFile(join(repo,path)))])));
  const missingInputPins=compareInputPins(qualificationInputPaths,sourceInputs,currentInputHashes);
  const inputPins=qualificationInputPaths.map(path=>({path,expectedSha256:sourceInputs[path]??null,currentSha256:currentInputHashes[path],pinned:sourceInputs[path]===currentInputHashes[path]}));
  const fixedPoint=manifest.sourceTransformStatus==='fixed-point'&&manifest.sourceTransformCount===0&&rustManifest.sourceClosure.transform?.status==='fixed-point'&&rustManifest.sourceClosure.transform?.generatedInputs?.length===0&&rustManifest.sourceClosure.sha256===rustManifest.sourceClosure.capturedLiveSha256;
  // Guard the qualification gate itself: no pins, no fixed point, or implicit
  // expected hashes can ever produce a qualified receipt.
  assert.equal(qualify(false,[],true),false);assert.equal(qualify(true,['input'],true),false);assert.equal(qualify(true,[],false),false);
  const qualified=qualify(explicitPins,missingInputPins,fixedPoint);
  const helpers=`const canonical=${canonical.toString()},capture=${capture.toString()},expected=${expected.toString()};function assert(v,m){if(!v)throw Error(m??'assert failed')}assert.equal=(a,b,m)=>{if(a!==b)throw Error(m??'assert.equal failed')};assert.deepEqual=(a,b,m)=>{if(canonical(a)!==canonical(b))throw Error(m??'assert.deepEqual failed')};const traced=${traced.toString()};`;
  const probe=`import * as root from '@umf/core';import * as reference from '@umf/core/reference';import {createRequire} from 'node:module';import {readFile} from 'node:fs/promises';${helpers}const req=createRequire(import.meta.url);const addon=req('./node_modules/@umf/core/dist/umf_core_node.node');const original=addon.executeRequestWire;let nativeCalls=0;addon.executeRequestWire=function(...a){nativeCalls++;return Reflect.apply(original,this,a)};const files=JSON.parse(await readFile('./frozen.json','utf8'));const exercise=${exercise.toString()};const result=exercise(root,reference,files,()=>nativeCalls);console.log(JSON.stringify({runtime:typeof Bun==='undefined'?'Node '+process.version:'Bun '+Bun.version,defaultRoot:new URL(import.meta.resolve('@umf/core')).pathname,referenceRoot:new URL(import.meta.resolve('@umf/core/reference')).pathname,...result}));`;
  await writeFile(join(temp,'probe.mjs'),probe);await writeFile(join(temp,'frozen.json'),JSON.stringify(frozen));
  const node=JSON.parse(await run('node',['probe.mjs'],temp));const bun=JSON.parse(await run('bun',['probe.mjs'],temp));
  const canonicalPackageRoot=await realpath(root);
  for(const [label,r] of [['Node',node],['Bun',bun]]){assert.equal(r.rows.length,5);assert.equal(r.defaultRoot,join(canonicalPackageRoot,'dist/umf-node.js'),`${label} installed default package root`);assert.equal(r.referenceRoot,join(canonicalPackageRoot,'dist/umf.js'),`${label} installed reference package root`);assert.deepEqual(r.hostControls,r.referenceControls,`${label} route controls`);assert(r.rows.every(row=>row.reference.kind===expected(row.id,frozen[row.id]).kind));}
  assert.equal(canonical(node.rows),canonical(bun.rows),'Node/Bun parity');
  const browserProbe=`import * as root from '@umf/core';import * as reference from '@umf/core/reference';${helpers}const files=await(await fetch('/frozen.json')).json();const exercise=${exercise.toString()};window.replay=exercise(root,reference,files,()=>window.__wasmCalls.filter(name=>name==='executeRequestWire'||name==='execute_request_wire').length);if(typeof process!=='undefined'||typeof Buffer!=='undefined')throw Error('Node global leaked into browser');`;
  const bootstrap=`window.__wasmCalls=[];const wrap=instance=>({exports:Object.fromEntries(Object.entries(instance.exports).map(([name,value])=>[name,typeof value==='function'?function(...args){window.__wasmCalls.push(String(name));return Reflect.apply(value,instance.exports,args)}:value]))});for(const method of ['instantiate','instantiateStreaming']){const original=WebAssembly[method];if(typeof original!=='function')continue;WebAssembly[method]=async function(...args){const result=await Reflect.apply(original,this,args);return result&&result.instance?{...result,instance:wrap(result.instance)}:wrap(result)}};`;
  const html=`<!doctype html><meta charset="utf-8"><script>${bootstrap}</script><script type="importmap">${JSON.stringify({imports:{'@umf/core':'/node_modules/@umf/core/dist/umf-browser.js','@umf/core/reference':'/node_modules/@umf/core/dist/umf.js'}})}</script><script type="module" src="/probe-browser.js"></script>`;
  const requests=[],external=[],errors=[];let browser;
  try{browser=await chromium.launch({headless:true,timeout:30000,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage();page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>{if(!r.url().startsWith('http://umf.local/'))external.push(r.url())});await page.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin!=='http://umf.local'){external.push(url.href);await route.abort();return}const pathname=decodeURIComponent(url.pathname);requests.push(pathname);if(pathname==='/'){await route.fulfill({status:200,contentType:'text/html',body:html});return}if(pathname==='/probe-browser.js'){await route.fulfill({status:200,contentType:'text/javascript',body:browserProbe});return}if(pathname==='/frozen.json'){await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(frozen)});return}try{const body=await readFile(join(temp,pathname.slice(1)));await route.fulfill({status:200,contentType:extname(pathname)==='.wasm'?'application/wasm':'text/javascript',body})}catch{await route.fulfill({status:404,body:'missing'})}});await page.goto('http://umf.local/');await page.waitForFunction(()=>Boolean(window.replay),undefined,{timeout:300000});const cr=await page.evaluate(()=>({replay:window.replay,agent:navigator.userAgent}));assert.deepEqual(errors,[]);assert.deepEqual(external,[],'browser external requests');assert(requests.some(p=>p.endsWith('.wasm')),'browser must load WASM');assert.equal(canonical(cr.replay.rows),canonical(node.rows),'Chromium/Node parity');assert.deepEqual(cr.replay.hostControls,cr.replay.referenceControls);
    const casePins=await Promise.all(caseNames.map(async name=>({name,sha256:sha(await readFile(join(packet,`frozen-${name}.json`)))})));
    const compactRows=rows=>rows.map(({id,reference,default:actual,referenceCalls,defaultCalls})=>({id,reference:reference.kind==='return'?'return':reference.failure,default:actual.kind==='return'?'return':actual.failure,referenceCalls,defaultCalls,referenceCanonicalSha256:sha(Buffer.from(canonical(reference))),defaultCanonicalSha256:sha(Buffer.from(canonical(actual)))}));
    const receipt={format:'umf.r8.compact-dataset-verify-installed/2',status:qualified?'qualified-pass':'diagnostic-pass',qualification:qualified?'Source-coherent installed archive replay: explicit archive and source-closure SHA-256 pins match; package source closure pins this exact replay harness and the six frozen packet files byte-for-byte; build reports a zero-transform fixed point.':'Diagnostic replay only: qualification requires explicit archive and source-closure SHA-256 arguments, packaged sourceClosure.inputs pins for this exact harness and all six frozen packet files, matching current bytes, and a zero-transform fixed point.',qualificationGate:{explicitArchiveAndClosurePins:explicitPins,sourceClosureInputPinsComplete:missingInputPins.length===0,missingInputPins,fixedPoint,transformStatus:manifest.sourceTransformStatus,transformCount:manifest.sourceTransformCount,inputs:inputPins},archive:{path:archive,sha256:sha(archiveBytes),bytes:archiveBytes.length,sourceClosure:manifest.sourceTreeSha256,sourceTransformCount:manifest.sourceTransformCount,packageName:pkg.name,packageVersion:pkg.version,manifestSha256:sha(await readFile(join(root,'manifest.json'))),verifiedArchiveMembers:Object.keys(manifest.sha256).length,defaultRoot:node.defaultRoot,referenceRoot:node.referenceRoot},packet:{indexSha256:sha(await readFile(join(packet,'index.json'))),cases:casePins},runtimes:{node:node.runtime,bun:bun.runtime,chromium:{version:browser.version(),userAgent:cr.agent}},dispatch:{node:compactRows(node.rows).map(({id,referenceCalls,defaultCalls})=>({id,referenceNativeCalls:referenceCalls,defaultNativeCalls:defaultCalls})),bun:compactRows(bun.rows).map(({id,referenceCalls,defaultCalls})=>({id,referenceNativeCalls:referenceCalls,defaultNativeCalls:defaultCalls})),chromium:compactRows(cr.replay.rows).map(({id,referenceCalls,defaultCalls})=>({id,referenceWasmCalls:referenceCalls,defaultWasmCalls:defaultCalls}))},browser:{nodeGlobalsAbsent:true,externalRequests:external,requestedWasm:requests.some(p=>p.endsWith('.wasm')),packageDefaultPath:'/node_modules/@umf/core/dist/umf-browser.js',packageReferencePath:'/node_modules/@umf/core/dist/umf.js'},rows:{node:compactRows(node.rows),bun:compactRows(bun.rows),chromium:compactRows(cr.replay.rows)},hostControls:node.hostControls};
    if(output){await mkdir(resolve(output,'..'),{recursive:true});await writeFile(output,JSON.stringify(receipt,null,2)+'\n')}console.log(JSON.stringify(receipt,null,2));
  }finally{await browser?.close()}
}finally{await rm(temp,{recursive:true,force:true})}
