// SPDX-License-Identifier: MIT OR Apache-2.0
// Installed-package qualification harness for the SEC Rust projection candidates.
// Usage: bun scripts/rust-migration/r8/sec-projection-candidate-installed.mjs <sdk.tgz> [receipt.json]
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {extname,join,resolve,posix} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {chromium} from 'playwright';

const repo=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const archive=resolve(process.argv[2]??'');
const receiptPath=process.argv[3]?resolve(process.argv[3]):null;
const defaultMode=process.env.UMF_SEC_VERIFY_DEFAULT==='1';
if(!process.argv[2])throw new Error('Usage: bun scripts/rust-migration/r8/sec-projection-candidate-installed.mjs <sdk.tgz> [receipt.json]');
const sha256=b=>createHash('sha256').update(b).digest('hex');
const canonical=v=>JSON.stringify(v,(k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(y=>[y,x[y]])):x);
const temp=join(tmpdir(),`umf-r8-sec-${process.pid}-${Date.now()}`);
const run=async(command,args,cwd=temp)=>{
 const p=Bun.spawn([command,...args],{cwd,stdout:'pipe',stderr:'pipe'});
 const output=Promise.all([new Response(p.stdout).text(),new Response(p.stderr).text()]);
 const timer=setTimeout(()=>p.kill(),300_000);
 try{const [code,[stdout,stderr]]=await Promise.all([p.exited,output]);return {code,stdout:stdout.trim(),stderr:stderr.trim()};}finally{clearTimeout(timer);}
};
const pass=(r,label)=>assert.equal(r.code,0,`${label} failed (${r.code})\n${r.stdout}\n${r.stderr}`);
const stage=s=>console.error(`[sec-projection-candidate-installed] ${s}`);
let browser,server,memorySampler;
try{
 const archiveBytes=await readFile(archive);assert.ok(archiveBytes.length);await mkdir(temp,{recursive:true});
 const listing=await run('tar',['-tzf',archive]);pass(listing,'archive listing');
 for(const member of listing.stdout.split('\n').filter(Boolean)){const n=posix.normalize(member);assert.ok(!member.startsWith('/')&&!n.startsWith('../')&&!n.split('/').includes('..'),`unsafe archive member: ${member}`);}
 const root=join(temp,'package');await mkdir(root,{recursive:true});pass(await run('tar',['-xzf',archive,'--strip-components=1','-C',root]),'archive extraction');
 const manifestBytes=await readFile(join(root,'manifest.json')),manifest=JSON.parse(manifestBytes);
 const sdkBytes=await readFile(join(root,'dist/rust-default-manifest.json')),sdk=JSON.parse(sdkBytes),pkg=JSON.parse(await readFile(join(root,'package.json')));
 assert.equal(pkg.exports['.'].node,'./dist/umf-node.js');assert.equal(pkg.exports['.'].browser,'./dist/umf-browser.js');assert.equal(pkg.exports['./reference'].import,'./dist/umf.js');
 for(const [member,digest] of Object.entries(manifest.sha256))assert.equal(sha256(await readFile(join(root,member))),digest,`archive member hash mismatch: ${member}`);
 for(const name of ['dist/umf_core_node.node','dist/umf_core_wasm_bg.wasm','dist/umf-node.js','dist/umf-browser.js','dist/umf.js'])assert.ok(manifest.sha256[name],`missing identity hash: ${name}`);
 assert.equal(manifest.profile,'umf.sdk.distribution.rust-default/1');assert.equal(manifest.sourceTransformStatus,'fixed-point');
 assert.equal(manifest.sourceTreeSha256,sdk.sourceClosure.sha256,'SDK/source closure identity');
 assert.equal(manifest.sourceTreeSha256,manifest.capturedLiveSourceTreeSha256,'captured live source identity');
 assert.equal(manifest.capturedLiveSourceTreeSha256,sdk.sourceClosure.capturedLiveSha256,'captured SDK source identity');
 stage(`package identity verified (${Object.keys(manifest.sha256).length} members)`);

 const predecessorPath=join(repo,'crates/umf-core/testdata/domain_pack_sec/predecessor-vectors.json');
 const admissionPath=join(repo,'crates/umf-core/testdata/domain_pack_sec/admission-vectors.json');
 const pinPath=join(repo,'crates/umf-core/testdata/domain_pack_sec/pinned-fixture-assertions.json');
 const predecessorBytes=await readFile(predecessorPath),admissionBytes=await readFile(admissionPath),pinBytes=await readFile(pinPath);
 const predecessor=JSON.parse(predecessorBytes),admission=JSON.parse(admissionBytes),pins=JSON.parse(pinBytes);
 const fixtures={};for(const pin of pins.sources){const b=await readFile(join(repo,pin.path));assert.equal(b.length,pin.bytes,pin.path+' byte pin');assert.equal(sha256(b),pin.sha256,pin.path+' digest pin');fixtures[pin.path]={text:b.toString('utf8'),sha256:sha256(b)};}
 const testdata={predecessor,admission,fixtures,runCap:process.env.UMF_SEC_RUN_OUTPUT_CAP==='1'};

 const probe=(rootApi,refApi,data,verifyDefault)=>{
  const capture=fn=>{try{return {ok:true,value:fn()};}catch(e){return {ok:false,error:{name:e?.name??'',code:e?.code??null,path:e?.path??null,message:e?.message??String(e)}};}};
  const run=(api,candidateNames)=>{
   const submissionsFn=api[candidateNames?'projectSecSubmissionsRustCandidate':'projectSecSubmissions'];
   const companyFactsFn=api[candidateNames?'projectSecCompanyFactsRustCandidate':'projectSecCompanyFacts'];
   const submissions={},companyFacts={};
   for(const c of data.predecessor.submissions)submissions[c.id]=capture(()=>submissionsFn(c.input,c.sourceId));
   for(const c of data.predecessor.companyFacts)companyFacts[c.id]=capture(()=>companyFactsFn(c.input,c.sourceId));
   for(const c of data.admission.malformed){submissions['malformed:'+c.id]=capture(()=>submissionsFn(c.input,'probe'));companyFacts['malformed:'+c.id]=capture(()=>companyFactsFn(c.input,'probe'));}
   for(const c of data.admission.surrogates){const fn=c.operation==='submissions'?submissionsFn:companyFactsFn;const op=c.operation==='submissions'?submissions:companyFacts;op['surrogate:'+c.id]=capture(()=>fn(c.input,'probe'));}
   for(const c of data.admission.sourceIds){const input='{"cik":"1","name":"A","filings":{"recent":{"accessionNumber":[],"filingDate":[],"reportDate":[],"form":[],"primaryDocument":[],"items":[]}}}';for(const [fn,set] of [[submissionsFn,submissions],[companyFactsFn,companyFacts]])set['sourceId:'+c.label]=capture(()=>fn(input,c.value));}
   for(const c of data.admission.nonString){const v=c.label==='undefined'?undefined:c.label==='null'?null:c.label==='number'?7:c.label==='boolean'?true:c.label==='array'?[]:{};for(const [fn,set] of [[submissionsFn,submissions],[companyFactsFn,companyFacts]])set['nonString:'+c.label]=capture(()=>fn(v,'probe'));}
   for(const [fn,set] of [[submissionsFn,submissions],[companyFactsFn,companyFacts]]){
    set.integerKeys=capture(()=>fn(data.admission.integerKeys.input,'probe'));
    set.rawSurrogate=capture(()=>fn(String.fromCharCode(...data.admission.rawSurrogate.inputUnits),'probe'));
   }
   const textPrefix='{"cik":"1","facts":{},"padding":"',textSuffix='"}';
   for(const c of data.admission.textLimits){const input=textPrefix+'x'.repeat(c.padding)+textSuffix;companyFacts['textLimit:'+c.inputLength]=capture(()=>companyFactsFn(input,'probe'));}
   for(const c of data.admission.valueLimits){let input='{"cik":"1","facts":{"t":{"C":{"units":{"USD":[';for(let i=0;i<c.observationCount;i++){if(i)input+=',';input+='{\"val\":0}';}input+=']},"unknown":null}}}}';companyFacts['valueLimit:'+c.observationCount]=capture(()=>companyFactsFn(input,'probe'));}
   for(const c of data.admission.depthLimits){let input='{"cik":"1","facts":{},"padding":'+'['.repeat(c.arrayDepth)+'null'+']'.repeat(c.arrayDepth)+'}';companyFacts['depthLimit:'+c.arrayDepth]=capture(()=>companyFactsFn(input,'probe'));}
   for(const [path,fixture] of Object.entries(data.fixtures)){
    if(path.includes('submissions'))submissions['fixture']=capture(()=>submissionsFn(fixture.text,'fixture/4962'));
    else companyFacts['fixture']=capture(()=>companyFactsFn(fixture.text,'fixture/4962'));
   }
   const invalid='{"cik":';submissions.parseBeforeInvalidSource=capture(()=>submissionsFn(invalid,null));
   companyFacts.parseBeforeInvalidSource=capture(()=>companyFactsFn(invalid,null));
   submissions.rootBeforeInvalidSource=capture(()=>submissionsFn('[]',null));
   companyFacts.rootBeforeInvalidSource=capture(()=>companyFactsFn('[]',null));
   return {submissions,companyFacts};
  };
  const runCap=api=>{
   if(!data.runCap)return null;
   // This cohort uses ASCII-only input and output, so JS string length equals
   // the Rust contract's UTF-16 code-unit count exactly.
   const cap=33_554_432,count=900;
   const makeInput=(labelUnits,extraUnits=0,invalidLast=false)=>{
    let input=`{"cik":"1","facts":{"t":{"C":{"label":"${'x'.repeat(labelUnits)}","units":{"USD":[`;
    for(let i=0;i<count;i++){if(i)input+=',';if(i===count-1)input+=invalidLast?'null':`{"val":0,"extra":"${'y'.repeat(extraUnits)}"}`;else input+='{"val":0}';}
    return input+']}}}}}';
   };
   const project=input=>api[verifyDefault?'projectSecCompanyFacts':'projectSecCompanyFactsRustCandidate'](input,'cap/probe');
   const base=project(makeInput(0,0)),baseLength=JSON.stringify(base).length;
   const labelUnits=Math.floor((cap-1-baseLength)/count),remainder=cap-1-baseLength-labelUnits*count;
   const exact=desired=>{
    const offset=desired-(cap-1),value=project(makeInput(labelUnits,remainder+offset));
    return {utf16Units:JSON.stringify(value).length};
   };
   const capMinusOne=exact(cap-1),atCap=exact(cap),above=capture(()=>project(makeInput(labelUnits,remainder+2)));
   const lateLabelUnits=Math.floor((cap-baseLength)/(count-1))+1;
   const late=capture(()=>project(makeInput(lateLabelUnits,0,true)));
   return {cap,baseLength,calibration:{labelUnits,remainder,lateLabelUnits},capMinusOne,atCap,above,lateInvalidAfterOversizePrefix:late};
  };
  const candidates=run(rootApi,true),defaults=verifyDefault?run(rootApi,false):null,reference=run(refApi,false),outputLimit=runCap(rootApi);
  return {candidate:candidates,default:defaults,reference,outputLimit,exports:{submissions:typeof rootApi.projectSecSubmissionsRustCandidate,companyFacts:typeof rootApi.projectSecCompanyFactsRustCandidate},defaultAliasIdentity:verifyDefault?{submissions:rootApi.projectSecSubmissions===rootApi.projectSecSubmissionsRustCandidate,companyFacts:rootApi.projectSecCompanyFacts===rootApi.projectSecCompanyFactsRustCandidate}:null};
 };
 const probeSource=`import * as candidate from ${JSON.stringify(pathToFileURL(join(root,'dist/umf-node.js')).href)};import * as reference from ${JSON.stringify(pathToFileURL(join(root,'dist/umf.js')).href)};import {readFile} from 'node:fs/promises';const data=JSON.parse(await readFile(${JSON.stringify(join(temp,'sec-data.json'))},'utf8'));const probe=${probe.toString()};const before=process.memoryUsage().rss;const result=probe(candidate,reference,data,${defaultMode});console.log(JSON.stringify({runtime:typeof Bun==='undefined'?'Node '+process.version:'Bun '+Bun.version,rssBefore:before,rssAfter:process.memoryUsage().rss,maxRss:process.resourceUsage().maxRSS,...result}));`;
 await writeFile(join(temp,'sec-data.json'),JSON.stringify(testdata));await writeFile(join(temp,'probe.mjs'),probeSource);
 const node=await run('node',['probe.mjs']),bun=await run('bun',['probe.mjs']);pass(node,'Node candidate/reference probe');pass(bun,'Bun candidate/reference probe');
 const nr=JSON.parse(node.stdout),br=JSON.parse(bun.stdout);for(const [runtime,result] of [['Node',nr],['Bun',br]]){assert.equal(result.exports.submissions,'function');assert.equal(result.exports.companyFacts,'function');}
 assert.equal(nr.candidate.submissions.fixture.value.filings.length,27,'pinned submissions filing cardinality');assert.equal(nr.candidate.companyFacts.fixture.value.length,144,'pinned CompanyFacts observation cardinality');
 const hostNeutral=result=>{const copy=structuredClone(result);for(const operation of ['submissions','companyFacts'])for(const label of ['null','undefined']){const error=copy[operation]['nonString:'+label]?.error;if(error?.name==='TypeError')error.message='[host-native null/undefined property access]';}return copy;};
 const compare={nodeReference:canonical(nr.candidate)===canonical(nr.reference),bunReference:canonical(br.candidate)===canonical(br.reference),nodeBun:canonical(hostNeutral(nr.candidate))===canonical(hostNeutral(br.candidate))};
 if(defaultMode){for(const r of [nr,br]){assert.equal(r.defaultAliasIdentity.submissions,true);assert.equal(r.defaultAliasIdentity.companyFacts,true);}compare.nodeDefaultReference=canonical(nr.default)===canonical(nr.reference);compare.bunDefaultReference=canonical(br.default)===canonical(br.reference);compare.nodeDefaultCandidate=canonical(nr.default)===canonical(nr.candidate);compare.bunDefaultCandidate=canonical(br.default)===canonical(br.candidate);}
 stage('Node and Bun candidate probes completed');

 const browserProbe=`import * as candidate from '/dist/umf-browser.js';import * as reference from '/dist/umf.js';const data=await(await fetch('/sec-data.json')).json();const probe=${probe.toString()};window.secResult={...probe(candidate,reference,data,${defaultMode}),userAgent:navigator.userAgent,nodeGlobalsAbsent:typeof process==='undefined'&&typeof Buffer==='undefined'};`;
 const html=`<!doctype html><meta charset="utf-8"><script type="module" src="/probe.js"></script>`;
 let badWasmMode=null;const requests=[],pageErrors=[];server=createServer(async(req,res)=>{const url=new URL(req.url??'/','http://localhost');requests.push(url.pathname);if(url.pathname==='/'){res.writeHead(200,{'content-type':'text/html'});res.end(html);return;}if(url.pathname==='/probe.js'){res.writeHead(200,{'content-type':'text/javascript'});res.end(browserProbe);return;}if(url.pathname==='/bad-probe.js'){res.writeHead(200,{'content-type':'text/javascript'});res.end(`try{const candidate=await import('/dist/umf-browser.js');candidate[${JSON.stringify(defaultMode?'projectSecCompanyFacts':'projectSecCompanyFactsRustCandidate')}]('{"cik":"1","facts":{}}','bad');window.badResult={refused:false}}catch(e){window.badResult={refused:true,name:e?.name??'',message:e?.message??String(e)}}`);return;}if(url.pathname.endsWith('.wasm')&&badWasmMode==='missing'){res.writeHead(404);res.end();return;}try{const path=url.pathname==='/sec-data.json'?join(temp,'sec-data.json'):join(root,url.pathname.slice(1));let bytes=await readFile(path);if(url.pathname.endsWith('.wasm')&&badWasmMode==='corrupt')bytes=Buffer.from([0,1,2,3]);res.writeHead(200,{'content-type':extname(path)==='.wasm'?'application/wasm':extname(path)==='.js'?'text/javascript':'application/octet-stream'});res.end(bytes);}catch{res.writeHead(404);res.end();}});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});const address=server.address();assert(address&&typeof address!=='string');
 browser=await chromium.launch({headless:true,timeout:30_000,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const harnessPid=process.pid;let browserDescendantPeak=null,browserDescendantSamples=0;
 const sampleBrowserDescendants=()=>{try{const rows=execFileSync('ps',['-axo','pid=,ppid=,rss=,comm='],{encoding:'utf8'}).trim().split('\n').filter(Boolean).map(line=>{const [pid,ppid,rss,...comm]=line.trim().split(/\s+/);return {pid:Number(pid),ppid:Number(ppid),rssKiB:Number(rss),command:comm.join(' ')};});const descendants=new Set([harnessPid]);let changed=true;while(changed){changed=false;for(const row of rows)if(descendants.has(row.ppid)&&!descendants.has(row.pid)){descendants.add(row.pid);changed=true;}}const processes=rows.filter(row=>row.pid!==harnessPid&&descendants.has(row.pid)&&row.command!=='ps').sort((a,b)=>a.pid-b.pid);const rssKiB=processes.reduce((sum,row)=>sum+row.rssKiB,0);browserDescendantSamples++;if(!browserDescendantPeak||rssKiB>browserDescendantPeak.rssKiB)browserDescendantPeak={rssKiB,processes};}catch{}}
 sampleBrowserDescendants();memorySampler=setInterval(sampleBrowserDescendants,100);const page=await browser.newPage();page.on('pageerror',e=>pageErrors.push(String(e)));
 await page.goto(`http://127.0.0.1:${address.port}/`,{timeout:30_000});await page.waitForFunction(()=>Boolean(window.secResult),undefined,{timeout:300_000});
 const cr=await page.evaluate(()=>window.secResult);clearInterval(memorySampler);sampleBrowserDescendants();assert.deepEqual(pageErrors,[]);assert.equal(cr.nodeGlobalsAbsent,true);assert(requests.includes('/dist/umf_core_wasm_bg.wasm'),'Chromium loaded packaged WASM');
 compare.chromiumReference=canonical(cr.candidate)===canonical(cr.reference);compare.chromiumNode=canonical(hostNeutral(cr.candidate))===canonical(hostNeutral(nr.candidate));
 if(defaultMode){assert.equal(cr.defaultAliasIdentity.submissions,true);assert.equal(cr.defaultAliasIdentity.companyFacts,true);compare.chromiumDefaultReference=canonical(cr.default)===canonical(cr.reference);compare.chromiumDefaultCandidate=canonical(cr.default)===canonical(cr.candidate);compare.defaultNodeBun=canonical(hostNeutral(nr.default))===canonical(hostNeutral(br.default));compare.defaultChromiumNode=canonical(hostNeutral(cr.default))===canonical(hostNeutral(nr.default));}
 stage('Chromium candidate/reference probe completed');
 const boundaryResults=[nr.outputLimit,br.outputLimit,cr.outputLimit].filter(Boolean);
 if(boundaryResults.length){for(const [i,b] of boundaryResults.entries()){assert.equal(b.capMinusOne.utf16Units,b.cap-1,`output cap−1 exact boundary at runtime ${i}`);assert.equal(b.atCap.utf16Units,b.cap,`output cap exact boundary at runtime ${i}`);assert.equal(b.above.ok,false,`output cap+1 rejected at runtime ${i}`);assert.equal(b.above.error.code,'LIMIT',`output cap+1 code at runtime ${i}`);assert.equal(b.lateInvalidAfterOversizePrefix.ok,false,`late invalid row rejected at runtime ${i}`);assert.notEqual(b.lateInvalidAfterOversizePrefix.error.code,'LIMIT',`late invalid row precedes output cap at runtime ${i}`);}}

 // Failure controls run only against the extracted temporary copy and restore every byte.
 const verifyMembers=async()=>{for(const [member,digest] of Object.entries(manifest.sha256)){const bytes=await readFile(join(root,member));if(sha256(bytes)!==digest)throw new Error(`member hash mismatch: ${member}`);}};
 const controls={};for(const member of ['dist/umf_core_node.node','dist/umf_core_wasm_bg.wasm']){
  const path=join(root,member),original=await readFile(path),digest=sha256(original);
  await rm(path);controls[member]={missingRejected:false};
  try{await verifyMembers();}catch{controls[member].missingRejected=true;}
  assert.equal(controls[member].missingRejected,true);
  const altered=Buffer.from(original);altered[0]^=0xff;await writeFile(path,altered);
  controls[member].corruptRejected=false;try{await verifyMembers();}catch{controls[member].corruptRejected=true;}
  await writeFile(path,original);assert.equal(sha256(await readFile(path)),digest);
  assert.equal(controls[member].corruptRejected,true);
 }
 controls.nativeRuntime={};
 for(const runtime of ['node','bun'])for(const mode of ['missing','corrupt']){
  const nativePath=join(root,'dist/umf_core_node.node'),nativeBytes=await readFile(nativePath);if(mode==='missing')await rm(nativePath);else await writeFile(nativePath,new Uint8Array([0,1,2,3]));
  const result=await run(runtime,['--input-type=module','-e',`try{const m=await import(${JSON.stringify(pathToFileURL(join(root,'dist/umf-node.js')).href)});m[${JSON.stringify(defaultMode?'projectSecSubmissions':'projectSecSubmissionsRustCandidate')}]('{"cik":"1","name":"A","filings":{"recent":{"accessionNumber":[],"filingDate":[],"reportDate":[],"form":[],"primaryDocument":[],"items":[]}}}','x');console.log(JSON.stringify({refused:false}))}catch(e){console.log(JSON.stringify({refused:true,name:e?.name??'',code:e?.code??null}))}`]);
  if(mode==='missing')await writeFile(nativePath,nativeBytes);else await writeFile(nativePath,nativeBytes);
  assert.equal(result.code,0,`${runtime} ${mode} native control process`);const observation=JSON.parse(result.stdout);assert.equal(observation.refused,true,`${runtime} ${mode} native candidate unexpectedly ran`);controls.nativeRuntime[`${runtime}-${mode}`]=observation;
 }
 controls.wasmRuntime={};
 for(const mode of ['missing','corrupt']){badWasmMode=mode;const badPage=await browser.newPage();await badPage.goto(`http://127.0.0.1:${address.port}/?bad=${mode}`);await badPage.addScriptTag({type:'module',url:`http://127.0.0.1:${address.port}/bad-probe.js`}).catch(()=>{});await badPage.waitForFunction(()=>Boolean(window.badResult),undefined,{timeout:30_000});const observation=await badPage.evaluate(()=>window.badResult);assert.equal(observation.refused,true,`${mode} WASM candidate unexpectedly ran`);controls.wasmRuntime[mode]=observation;await badPage.close();}
 badWasmMode=null;
 const capEvidence=process.env.UMF_SEC_RUN_OUTPUT_CAP==='1'?{status:'run-in-node-bun-chromium'}:{status:'not-run',reason:'set UMF_SEC_RUN_OUTPUT_CAP=1 to allocate and project the 32 MiB boundary cohort'};

 const failures=[];
 for(const [runtime,result] of [['Node',nr],['Bun',br],['Chromium',cr]]){
  for(const operation of ['submissions','companyFacts']){
   const set=result.candidate[operation];
   const vectors=operation==='submissions'?predecessor.submissions:predecessor.companyFacts;
   for(const vector of vectors){const got=set[vector.id],want=vector.expected;if(want.ok){if(!got?.ok||canonical(got.value)!==canonical(want.value))failures.push(`${runtime}/${operation}/${vector.id} differs from frozen predecessor value`);}else if(got?.ok||got?.error?.name!==want.error.name||got?.error?.message!==want.error.message)failures.push(`${runtime}/${operation}/${vector.id} differs from frozen predecessor error`);}
  }
  for(const [operation,set] of [['submissions',result.candidate.submissions],['companyFacts',result.candidate.companyFacts]]){
   const expectedMalformed=admission.malformed;
   for(const c of expectedMalformed){const got=set['malformed:'+c.id],want=c[operation];if(!got||got.ok!==want.ok||(!want.ok&&(got.error.name!==want.error.name||got.error.code!==want.error.code||got.error.path!==want.error.path||got.error.message!==want.error.message)))failures.push(`${runtime}/${operation}/malformed:${c.id} differs from frozen admission result`);}
   for(const c of admission.sourceIds){const got=set['sourceId:'+c.label],want=c[operation];if(!got||got.ok!==want.ok||(!want.ok&&(got.error.name!==want.error.name||got.error.message!==want.error.message)))failures.push(`${runtime}/${operation}/sourceId:${c.label} differs from frozen admission result`);}
   for(const c of admission.nonString){if(runtime!=='Bun'&&(c.label==='null'||c.label==='undefined'))continue;const got=set['nonString:'+c.label],want=c[operation];if(!got||got.ok!==want.ok||(!want.ok&&(got.error.name!==want.error.name||got.error.message!==want.error.message)))failures.push(`${runtime}/${operation}/nonString:${c.label} differs from frozen admission result`);}
  }
  for(const c of admission.surrogates){const set=c.operation==='submissions'?result.candidate.submissions:result.candidate.companyFacts,got=set['surrogate:'+c.id];if(!got?.ok||JSON.stringify(got.value)!==c.result.wire)failures.push(`${runtime}/${c.operation}/surrogate:${c.id} differs from frozen raw-wire result`);}
  const integer=result.candidate.companyFacts.integerKeys;if(!integer?.ok||canonical(integer.value)!==canonical(admission.integerKeys.result.value))failures.push(`${runtime}/companyFacts/integerKeys differs from frozen admission result`);
  const raw=result.candidate.submissions.rawSurrogate;if(!raw?.ok||JSON.stringify(raw.value)!==admission.rawSurrogate.result.wire)failures.push(`${runtime}/submissions/rawSurrogate differs from frozen raw-wire result`);
  for(const c of admission.textLimits){const got=result.candidate.companyFacts['textLimit:'+c.inputLength];if(got?.ok!==c.result.ok||(!c.result.ok&&got.error.code!==c.result.error.code))failures.push(`${runtime}/companyFacts/textLimit:${c.inputLength} differs from frozen admission result`);}
  for(const c of admission.valueLimits){const got=result.candidate.companyFacts['valueLimit:'+c.observationCount];if(got?.ok!==c.result.ok||(!c.result.ok&&got.error.code!==c.result.error.code)||(c.result.ok&&got.value.length!==c.result.rowCount))failures.push(`${runtime}/companyFacts/valueLimit:${c.observationCount} differs from frozen admission result`);}
  for(const c of admission.depthLimits){const got=result.candidate.companyFacts['depthLimit:'+c.arrayDepth];if(got?.ok!==c.result.ok||(!c.result.ok&&got.error.code!==c.result.error.code))failures.push(`${runtime}/companyFacts/depthLimit:${c.arrayDepth} differs from frozen admission result`);}
 }
 const nativeHostDiagnostics=Object.fromEntries([['Node',nr],['Bun',br],['Chromium',cr]].map(([runtime,result])=>[runtime,Object.fromEntries(['null','undefined'].map(label=>[label,result.candidate.submissions['nonString:'+label]?.error?.message??null]))]));
 const receipt={format:defaultMode?'umf.r8.sec-projection-default-installed/1':'umf.r8.sec-projection-candidate-installed/1',status:failures.length===0&&Object.values(compare).every(Boolean)?'pass':'fail',qualification:defaultMode?'Installed V4 default SEC projection replay for the pinned Darwin arm64 Node/Bun/Chromium archive and declared source cohort. Full route retirement, Linux and release qualification remain open.':'Installed archive candidate replay for SEC submissions and CompanyFacts only. V4 default-route retirement and release qualification are out of scope.',harnessSha256:sha256(await readFile(fileURLToPath(import.meta.url))),archive:{path:archive,sha256:sha256(archiveBytes),bytes:archiveBytes.length,packageVersion:pkg.version,manifestSha256:sha256(manifestBytes),sdkManifestSha256:sha256(sdkBytes),sourceClosureSha256:manifest.sourceTreeSha256,verifiedMembers:Object.keys(manifest.sha256).length},vectors:{predecessor:{path:predecessorPath,sha256:sha256(predecessorBytes)},admission:{path:admissionPath,sha256:sha256(admissionBytes)},pinnedFixtures:Object.fromEntries(Object.entries(fixtures).map(([p,f])=>[p,f.sha256])),fixtureCounts:{submissionsFilings:27,companyFactsObservations:144}},runtimes:{node:{version:nr.runtime,rssBefore:nr.rssBefore,rssAfter:nr.rssAfter,maxRssKiB:nr.maxRss},bun:{version:br.runtime,rssBefore:br.rssBefore,rssAfter:br.rssAfter,maxRssKiB:br.maxRss},chromium:{version:browser.version(),harnessPid,userAgent:cr.userAgent,nodeGlobalsAbsent:cr.nodeGlobalsAbsent,wasmRequested:requests.includes('/dist/umf_core_wasm_bg.wasm'),browserDescendantProcessTreeRss:{method:'sampled ps process tree rooted at harness PID; descendants only; RSS summed in KiB',sampleIntervalMs:100,samples:browserDescendantSamples,peak:browserDescendantPeak},heapUsed:await page.evaluate(()=>performance.memory?.usedJSHeapSize??null)}},parity:compare,nativeHostDiagnostics,nativeWasmControls:controls,outputLimit:{...capEvidence,node:nr.outputLimit,bun:br.outputLimit,chromium:cr.outputLimit},failures};
 if(receiptPath){await mkdir(resolve(receiptPath,'..'),{recursive:true});await writeFile(receiptPath,JSON.stringify(receipt,null,2)+'\n');}console.log(JSON.stringify(receipt,null,2));
 assert.equal(receipt.status,'pass',failures.join('\n')||JSON.stringify(compare));
}finally{
 clearInterval(memorySampler);if(browser)await browser.close().catch(()=>{});
 if(server){server.closeAllConnections();await new Promise(done=>server.close(done)).catch(()=>{});}
 await rm(temp,{recursive:true,force:true});
}
