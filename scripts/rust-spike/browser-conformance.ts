// SPDX-License-Identifier: MIT OR Apache-2.0
import {resolve, join, extname} from 'node:path';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const root = resolve(import.meta.dir, '../..');
const wasmDir = resolve(process.argv[2] ?? 'target/rust-spike/wasm/pkg');
const vectorsPath = resolve(process.argv[3] ?? 'target/rust-spike/vectors.json');
const vectors = JSON.parse(await readFile(vectorsPath, 'utf8'));
const chromiumPath = process.env.UMF_CHROMIUM_PATH ?? chromium.executablePath();
const server = Bun.serve({port:0, async fetch(request) {
  const url = new URL(request.url);
  const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const path = resolve(root, relative);
  if (!path.startsWith(root + '/') && path !== root) return new Response('forbidden', {status:403});
  try {
    const bytes = await readFile(path);
    const type = extname(path) === '.wasm' ? 'application/wasm' : extname(path) === '.js' ? 'text/javascript' : extname(path) === '.json' ? 'application/json' : extname(path) === '.html' ? 'text/html' : 'application/octet-stream';
    return new Response(bytes, {headers:{'content-type':type, 'cache-control':'no-store'}});
  } catch {
    return new Response('not found', {status:404});
  }
}});
let browser;
try {
  browser = await chromium.launch({executablePath:chromiumPath,headless:true,args:['--no-sandbox']});
  const page = await browser.newPage();
  const errors: string[] = [];
  const requests: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => requests.push(request.url()));
  await page.goto(`http://127.0.0.1:${server.port}/tests/rust-spike/browser-shell.html`);
  await page.evaluate(async (data) => {
    const bootStarted = performance.now();
    const pkgUrl = '/target/rust-spike/wasm/pkg/umf_rust_spike_wasm.js';
    const generated = await import(pkgUrl);
    const glueUrl = new URL('/bindings/rust-spike/wasm/index.js', location.href).href;
    const {initializeWasm} = await import(glueUrl);
    let missingCryptoLoaded = false;
    const missingCrypto = await initializeWasm(() => { missingCryptoLoaded=true; return generated.default(); }, {crypto:undefined});
    if(missingCryptoLoaded) throw new Error('WASM loader ran without browser crypto capability');
    const capability=JSON.parse(missingCrypto.run(JSON.stringify(data.requests.find(request=>request.op==='validate-record'))));
    if(capability.code!=='CAPABILITY_REQUIRED'||capability.complete!==false) throw new Error(`WASM missing-crypto refusal was not explicit: ${JSON.stringify(capability)}`);
    const binding = await initializeWasm(async () => { await generated.default(); return generated; });
    const bootMs = performance.now() - bootStarted;
    const normalize = value => value && typeof value === 'object'
      ? Array.isArray(value) ? value.map(normalize)
        : Object.fromEntries(Object.keys(value).sort().map(key=>[key,normalize(value[key])]))
      : value;
    const same = (a,b) => JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
    const checks = [];
    let generationIndex=0;
    for (const [index, request] of data.requests.entries()) {
      const actual = JSON.parse(binding.run(JSON.stringify(request)));
      if (request.op === 'source-roundtrip') {
        if (actual.ok !== true || !same(actual.sourceUnits,request.sourceUnits)) throw new Error(`UTF16 source mismatch ${index}`);
      } else if (request.op === 'validate-record') {
        if(request.expectedCode) {
          if(actual.code!==request.expectedCode||actual.complete!==false) throw new Error(`WASM semantic operation accepted invalid UTF-16 source: ${JSON.stringify(actual)}`);
          checks.push({index,op:request.op,ok:actual.ok,code:actual.code});
          continue;
        }
        if (actual.code === 'DUPLICATE_JSON_KEY') {
          if (actual.complete !== false) throw new Error('duplicate-key source was treated as complete');
          checks.push({index,op:request.op,ok:actual.ok,code:actual.code});
          continue;
        }
        const valid = request.model.umf === '0.10.0' ? data.expected.validation.valid : data.expected.unsupportedValidation.valid;
        if (actual.valid !== valid || actual.tsComparable?.valid !== valid) throw new Error(`TS validity mismatch ${index}`);
        if (valid && (actual.complete !== false || !actual.diagnostics?.some(d => /INCOMPLETE/.test(d.code)))) throw new Error('structural result claimed complete');
        if (valid && !same(actual.retainedModel,request.model)) throw new Error('unknown extension data changed');
      } else {
        const expectedGeneration=data.expected.generationCases[generationIndex++];
        if(expectedGeneration.caseName==='unknown-record-extension') {
          if(actual.code!=='UNSUPPORTED_RECORD'||actual.complete!==false) throw new Error(`generator did not refuse unknown selected Record extensions: ${JSON.stringify(actual)}`);
          checks.push({index,op:request.op,ok:actual.ok,code:actual.code});
          continue;
        }
        if(expectedGeneration.caseName.startsWith('conservative-field-name-')||expectedGeneration.caseName.startsWith('conservative-record-name-')) {
          if(actual.code!=='UNSUPPORTED_RECORD'||actual.complete!==false) throw new Error(`generator did not conservatively refuse ${expectedGeneration.caseName}: ${JSON.stringify(actual)}`);
          checks.push({index,op:request.op,ok:actual.ok,code:actual.code,tsAccepted:expectedGeneration.accepted,qualification:'conservative refusal outside exact TypeScript normalization subset'});
          continue;
        }
        if(expectedGeneration.accepted) {
          if(actual.ok!==true) throw new Error(`Rust refused TypeScript-accepted generation case ${expectedGeneration.caseName}: ${JSON.stringify(actual)}`);
          if(actual.pythonSource!==expectedGeneration.pythonSource||actual.sourceDigest!==expectedGeneration.sourceDigest) throw new Error(`generated output differs from current TypeScript for ${expectedGeneration.caseName}`);
        } else {
          if(actual.ok!==false||actual.complete!==false) throw new Error(`Rust accepted TypeScript-refused generation case ${expectedGeneration.caseName}: ${JSON.stringify(actual)}`);
          checks.push({index,op:request.op,ok:actual.ok,code:actual.code,tsError:expectedGeneration.errorCode});
          continue;
        }
        if (actual.complete !== false) throw new Error('single result claimed full generator support');
      }
      checks.push({index,op:request.op,ok:actual.ok,code:actual.code});
    }
    const units = text => Array.from({length:text.length},(_,index)=>text.charCodeAt(index));
    const callbackInput = data.callbackRequest;
    const received = [];
    const callbackResult = JSON.parse(binding.run_with_validator(JSON.stringify(callbackInput),text=>received.push(units(text))));
    if (!same(received,[callbackInput.sourceUnits]) || callbackResult.complete === true) throw new Error('original callback source units changed');
    const validationCallback=data.validationCallbackRequest,validationReceived=[];
    const validationResult=JSON.parse(binding.run_with_validator(JSON.stringify(validationCallback),text=>validationReceived.push(units(text))));
    if(!same(validationReceived,[validationCallback.sourceUnits])||validationResult.valid!==true||validationResult.complete!==false) throw new Error('validator callback did not run through actual structural validation');
    let threw = false;
    try {
      const callbackError=JSON.parse(binding.run_with_validator(JSON.stringify(data.throwingCallbackRequest),()=>{throw new Error('R1 callback sentinel')}));
      threw = callbackError.code === 'CALLBACK_ERROR' && callbackError.complete === false;
    } catch (error) { threw = error instanceof Error && error.message === 'R1 callback sentinel'; }
    if (!threw) throw new Error('callback exception swallowed or converted to complete success');
    const reentrantReceived=[];
    const reentrantResult=JSON.parse(binding.run_with_validator(JSON.stringify(validationCallback),text=>{
      reentrantReceived.push(units(text));
      const nested=JSON.parse(binding.run(JSON.stringify({op:'source-roundtrip',sourceUnits:units('nested')})));
      if (!same(nested.sourceUnits,units('nested'))) throw new Error('nested WASM call changed source');
    }));
    if (!same(reentrantReceived,[validationCallback.sourceUnits]) || reentrantResult.valid!==true || reentrantResult.complete === true) throw new Error('callback reentrancy failed');
    let cancellationPolls=0;
    const hostCancelled=JSON.parse(binding.run_with_control(JSON.stringify({
      op:'validate-record',model:JSON.parse(data.modelText),sourceUnits:units(data.modelText),
      record:{identity:{module:'m',element:'Item'},values:[]},
    }),()=>++cancellationPolls>=3));
    if(hostCancelled.code!=='CANCELLED'||hostCancelled.complete!==false||cancellationPolls!==3) throw new Error(`WASM host cancellation was not polled during Rust work: ${JSON.stringify(hostCancelled)} polls=${cancellationPolls}`);
    const capacity=JSON.parse(binding.run(JSON.stringify({op:'source-roundtrip',sourceUnits:[1,2,3,4],options:{capacity:3}})));
    if (capacity.code !== 'CAPACITY') throw new Error('WASM capacity limit not enforced');
    const expired=JSON.parse(binding.run(JSON.stringify({op:'source-roundtrip',sourceUnits:[65],options:{deadlineUnixMs:0}})));
    if(expired.code!=='DEADLINE'||expired.complete===true) throw new Error('WASM expired deadline was not refused');
    const budget=JSON.parse(binding.run(JSON.stringify({op:'validate-record',model:JSON.parse(data.modelText),sourceUnits:units(data.modelText),record:{identity:{module:'m',element:'Item'},values:[]},options:{cancelAtStep:2}})));
    if (budget.code !== 'CANCELLED' || budget.complete === true) throw new Error('WASM mid-work cancellation failed');
    const timedRequest=JSON.stringify({op:'source-roundtrip',sourceUnits:[65,66,67]});
    const count=10000, started=performance.now();
    for(let index=0;index<count;index++) binding.run(timedRequest);
    const elapsedMs=performance.now()-started;
    window.__r1result={status:'pass',engine:binding.engine_version,cases:checks,
      callbacks:{rawSource:{expectedUnits:callbackInput.sourceUnits,receivedUnits:received[0],exact:same(received,[callbackInput.sourceUnits])},
        validationSource:{unitCount:validationCallback.sourceUnits.length,exact:same(validationReceived,[validationCallback.sourceUnits])},
        reentrantValidation:{unitCount:validationCallback.sourceUnits.length,exact:same(reentrantReceived,[validationCallback.sourceUnits])}},
      measurement:{wasmBootMs:bootMs,operation:'source-roundtrip',calls:count,elapsedMs,meanMicroseconds:elapsedMs*1000/count,callsPerSecond:count*1000/elapsedMs,
        missingCryptoPreflight:true,
        note:'Includes JavaScript JSON encoding/decoding and WASM engine work; not an isolated boundary-only estimate.'}};
  }, vectors);
  const result = await page.evaluate(() => (window as any).__r1result);
  const expectedOrigin = `http://127.0.0.1:${server.port}/`;
  const externalRequests = requests.filter(url => !url.startsWith(expectedOrigin));
  if (externalRequests.length) throw new Error(`Browser test made requests outside local fixture server: ${externalRequests.join(', ')}`);
  result.externalRequestCount = externalRequests.length;
  result.localRequestCount = requests.length;

  // Fresh browser contexts have independent JS/WASM instances and randomized hash seeds.
  const repeatResults = [];
  for (let index=0; index<3; index++) {
    const context=await browser.newContext();
    try {
      const repeatPage=await context.newPage();
      repeatPage.on('request',request=>requests.push(request.url()));
      await repeatPage.goto(`http://127.0.0.1:${server.port}/tests/rust-spike/browser-shell.html`);
      repeatResults.push(await repeatPage.evaluate(async ({modelText,generationRequest})=>{
        const units=text=>Array.from({length:text.length},(_,index)=>text.charCodeAt(index));
        const generated=await import('/target/rust-spike/wasm/pkg/umf_rust_spike_wasm.js');
        const glue=await import(new URL('/bindings/rust-spike/wasm/index.js',location.href).href);
        const binding=await glue.initializeWasm(async()=>{await generated.default();return generated;});
        const validate=JSON.parse(binding.run(JSON.stringify({op:'validate-record',model:JSON.parse(modelText),sourceUnits:units(modelText),record:{identity:{module:'m',element:'Item'},values:[]}})));
        const generation=JSON.parse(binding.run(JSON.stringify(generationRequest)));
        return {valid:validate.valid,complete:validate.complete,pythonSource:generation.pythonSource,sourceDigest:generation.sourceDigest};
      },{modelText:vectors.modelText,generationRequest:vectors.requests.find(request=>request.op==='generate-keyed-record'&&request.model.id==='rust-spike-r1')}));
    } finally { await context.close(); }
  }
  if(repeatResults.some(value=>JSON.stringify(value)!==JSON.stringify(repeatResults[0]))) throw new Error('Independent browser contexts produced nondeterministic schema/generator results');
  result.independentContextCount=repeatResults.length;
  result.independentContextDeterminism='same validity and generated output in fresh contexts';
  if (errors.length) throw new Error(`Chromium page error: ${errors.join('; ')}`);
  console.log(JSON.stringify({status:'pass',chromium:browser.version(),wasmDir,chromiumPath, ...result},null,2));
} finally {
  if (browser) await browser.close();
  server.stop(true);
}
