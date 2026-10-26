import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {chromium} from 'playwright';
import {CORE_MODEL_RESOURCES} from '../../../../src/access/core-model-resources.ts';
import {inspectCoreElementKind, declareCoreElementKind, verifyCoreKindDeclaration} from '../../../../src/model/field-kind.ts';
import {inspectCoreNullability, declareCoreNullability, verifyCoreNullabilityDeclaration} from '../../../../src/model/nullability.ts';

const root = process.cwd();
const wasmPkg = '/private/tmp/umf-kind-wasm-fresh/pkg';
const source = JSON.parse(await readFile('scripts/rust-migration/r5/kind-nullability/input.json', 'utf8'));
const identity = {module:'m',element:'known'};
const kindReceipt = declareCoreElementKind(source, identity, 'field');
const nullReceipt = declareCoreNullability(source, identity, 'required');
const normalize = value => JSON.parse(JSON.stringify(value));
const capture = run => {
  try { return {ok:true,value:normalize(run())}; }
  catch (error) { return {ok:false,name:error?.name ?? '',code:error?.code ?? '',message:error?.message ?? String(error),path:error?.path ?? ''}; }
};
const expected = {
  inspectKind:capture(()=>inspectCoreElementKind(source,identity)),
  declareKind:capture(()=>declareCoreElementKind(source,{module:'m',element:'missing'},'field')),
  verifyKind:capture(()=>verifyCoreKindDeclaration(kindReceipt,source)),
  inspectNullability:capture(()=>inspectCoreNullability(source,identity)),
  declareNullability:capture(()=>declareCoreNullability(source,identity,'absent-allowed')),
  verifyNullability:capture(()=>verifyCoreNullabilityDeclaration(nullReceipt,source)),
};
const payload = JSON.stringify({resources:CORE_MODEL_RESOURCES,source,identity,kindReceipt,nullReceipt,expected});
const server = createServer(async (req,res) => {
  const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
  if (pathname === '/') { res.writeHead(200,{'content-type':'text/html'}); res.end('<!doctype html><meta charset="utf-8">'); return; }
  if (pathname === '/inputs.json') { res.writeHead(200,{'content-type':'application/json'}); res.end(payload); return; }
  try {
    const file = pathname.startsWith('/fresh/') ? join(wasmPkg, pathname.slice('/fresh/'.length)) : resolve(root, `.${pathname}`);
    if (!file.startsWith(root) && !file.startsWith(wasmPkg)) throw Error('path');
    const body = await readFile(file);
    const type = file.endsWith('.wasm') ? 'application/wasm' : file.endsWith('.js') ? 'text/javascript' : 'application/octet-stream';
    res.writeHead(200,{'content-type':type}); res.end(body);
  } catch { res.writeHead(404); res.end('missing'); }
});
await new Promise(resolveListen => server.listen(0,'127.0.0.1',resolveListen));
let browser;
try {
  browser = await chromium.launch({headless:true,timeout:30_000,...(process.env.UMF_CHROMIUM_PATH ? {executablePath:process.env.UMF_CHROMIUM_PATH} : {})});
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const actual = await page.evaluate(async () => {
    const {resources,source,identity,kindReceipt,nullReceipt,expected} = await fetch('/inputs.json').then(r=>r.json());
    const {initializeCoreKindNullabilityHostInputWasm, initializeCoreModelRootKindNullabilityWasm} = await import('/bindings/core/wasm/index.js');
    const engine = await initializeCoreKindNullabilityHostInputWasm(resources,()=>import('/fresh/umf_core_wasm.js'));
    const shared = await initializeCoreModelRootKindNullabilityWasm(resources,()=>import('/fresh/umf_core_wasm.js'));
    const normalize = value => JSON.parse(JSON.stringify(value));
    const capture = run => {
      try { return {ok:true,value:normalize(run())}; }
      catch (error) { return {ok:false,name:error?.name ?? '',code:error?.code ?? '',message:error?.message ?? String(error),path:error?.path ?? ''}; }
    };
    const outcomes = {
      inspectKind:capture(()=>engine.inspectCoreElementKind(source,identity)),
      declareKind:capture(()=>engine.declareCoreElementKind(source,{module:'m',element:'missing'},'field')),
      verifyKind:capture(()=>engine.verifyCoreKindDeclaration(kindReceipt,source)),
      inspectNullability:capture(()=>engine.inspectCoreNullability(source,identity)),
      declareNullability:capture(()=>engine.declareCoreNullability(source,identity,'absent-allowed')),
      verifyNullability:capture(()=>engine.verifyCoreNullabilityDeclaration(nullReceipt,source)),
    };
    let meterCalls=0, setupWork=0, operationWork=0;
    const metered=await initializeCoreKindNullabilityHostInputWasm(resources,()=>import('/fresh/umf_core_wasm.js'),globalThis,{resourceControls:{meter:amount=>{setupWork+=amount;}},controls:{meter:amount=>{meterCalls++;operationWork+=amount;}}});
    let repeatedSetupWork=0;
    await initializeCoreKindNullabilityHostInputWasm(resources,()=>import('/fresh/umf_core_wasm.js'),globalThis,{resourceControls:{meter:amount=>{repeatedSetupWork+=amount;}}});
    let repeatedSetupFailure;
    try { await initializeCoreKindNullabilityHostInputWasm(resources,()=>import('/fresh/umf_core_wasm.js'),globalThis,{resourceControls:{maxWork:setupWork-1}}); } catch(error) { repeatedSetupFailure={code:error?.code??'',message:error?.message??''}; }
    metered.inspectCoreElementKind(source,identity);
    let setupFailure;
    try { await initializeCoreKindNullabilityHostInputWasm(resources,()=>import('/fresh/umf_core_wasm.js'),globalThis,{resourceControls:{maxWork:setupWork-1}}); } catch(error) { setupFailure={code:error?.code??'',message:error?.message??''}; }
    let setupGetterTouched=false;
    const hostileResources=Object.create(null);
    Object.defineProperty(hostileResources,'coreSchema',{enumerable:true,get(){setupGetterTouched=true;throw new Error('must not run');}});
    let zeroWorkSetupFailure;
    try { await initializeCoreKindNullabilityHostInputWasm(hostileResources,()=>import('/fresh/umf_core_wasm.js'),globalThis,{resourceControls:{maxWork:0}}); } catch(error) { zeroWorkSetupFailure={code:error?.code??'',message:error?.message??''}; }
    const bounded=await initializeCoreKindNullabilityHostInputWasm(resources,()=>import('/fresh/umf_core_wasm.js'),globalThis,{resourceControls:{maxWork:setupWork},controls:{maxWork:operationWork-1}});
    const boundedResult=capture(()=>bounded.inspectCoreElementKind(source,identity));
    let resetWork=0;
    const perCall=await initializeCoreKindNullabilityHostInputWasm(resources,()=>import('/fresh/umf_core_wasm.js'),globalThis,{resourceControls:{maxWork:setupWork},controls:{maxWork:operationWork,meter:amount=>{resetWork+=amount;}}});
    perCall.inspectCoreElementKind(source,identity); perCall.inspectCoreElementKind(source,identity);
    const cancelled=await initializeCoreKindNullabilityHostInputWasm(resources,()=>import('/fresh/umf_core_wasm.js'),globalThis,{resourceControls:{maxWork:setupWork},controls:{isCancelled:()=>true}});
    const cancellationResult=capture(()=>cancelled.inspectCoreElementKind(source,identity));
    const mutableResources=structuredClone(resources);
    const pinned=await initializeCoreKindNullabilityHostInputWasm(mutableResources,()=>import('/fresh/umf_core_wasm.js'));
    mutableResources.coreSchema=false;
    const pinnedResult=capture(()=>pinned.inspectCoreElementKind(source,identity));
    const controls = {};
    const accessor = (target,key,trace,label=key) => Object.defineProperty(target,key,{enumerable:true,get(){trace.push(label);throw new Error(`${label} getter invoked`);}});
    for (const [name, operation] of [['kindInspectSource',engine.inspectCoreElementKind],['nullabilityInspectSource',engine.inspectCoreNullability]]) {
      const trace=[]; const hostile=accessor(structuredClone(source),'poison',trace);
      controls[name]={outcome:capture(()=>operation.call(engine,hostile,identity)),trace};
    }
    for (const [name, operation, requestName, requestCode, targetIdentity] of [
      ['kindDeclareRequest',engine.declareCoreElementKind,'kind','CORE_KIND_VALUE',{module:'m',element:'missing'}],
      ['nullabilityDeclareRequest',engine.declareCoreNullability,'nullability','CORE_NULLABILITY_VALUE',identity],
    ]) {
      const trace=[]; const request=accessor({},'poison',trace,'request.poison');
      const outcome=capture(()=>operation.call(engine,structuredClone(source),targetIdentity,request));
      controls[name]={outcome,trace,requestCode};
    }
    for (const [name, operation] of [['kindVerifyReceipt',engine.verifyCoreKindDeclaration],['nullabilityVerifyReceipt',engine.verifyCoreNullabilityDeclaration]]) {
      const trace=[]; const current=accessor({},'poison',trace,'current.poison');
      controls[name]={outcome:capture(()=>operation.call(engine,{},current)),trace};
    }
    const identityTrace=[];
    const sourceHostile=accessor(structuredClone(source),'poison',identityTrace,'source.poison');
    const hostileIdentity={get module(){identityTrace.push('module');return 'm';},get element(){identityTrace.push('element');return 'known';}};
    controls.sourceBeforeIdentity={outcome:capture(()=>engine.inspectCoreElementKind(sourceHostile,hostileIdentity)),trace:identityTrace};
    const nullIdentityTrace=[];
    const nullSourceHostile=accessor(structuredClone(source),'poison',nullIdentityTrace,'source.poison');
    const nullHostileIdentity={get module(){nullIdentityTrace.push('module');return 'm';},get element(){nullIdentityTrace.push('element');return 'known';}};
    controls.nullabilitySourceBeforeIdentity={outcome:capture(()=>engine.inspectCoreNullability(nullSourceHostile,nullHostileIdentity)),trace:nullIdentityTrace};
    const currentTrace=[];
    const hostileCurrent=accessor(structuredClone(source),'poison',currentTrace,'current.poison');
    controls.validReceiptAdmitsCurrent={outcome:capture(()=>engine.verifyCoreKindDeclaration(kindReceipt,hostileCurrent)),trace:currentTrace};
    const sentinel=Object.freeze({sentinel:'proxy trap'});
    const badProxy=new Proxy({}, {getPrototypeOf(){throw sentinel;}});
    let threw;
    try { engine.inspectCoreElementKind(source,badProxy); } catch (error) { threw=error===sentinel; }
    const sharedDispatcher={staged:capture(()=>shared.inspectCoreElementKind(source,identity)),model:capture(()=>shared.inspectCoreKind(source,identity.module,identity.element))};
    return {outcomes,expected,controls,threw,meterCalls,setupWork,repeatedSetupWork,repeatedSetupFailure,operationWork,setupFailure,setupGetterTouched,zeroWorkSetupFailure,boundedResult,resetWork,cancellationResult,pinnedResult,sharedDispatcher};
  });
  assert.deepEqual(actual.outcomes, actual.expected, 'Chromium results match frozen TypeScript envelopes');
  assert.deepEqual(actual.sharedDispatcher.model,actual.sharedDispatcher.staged,'shared Rust Engine dispatches model and staged operations in Chromium');
  assert.equal(actual.controls.kindInspectSource.outcome.code,'NON_JSON');
  assert.deepEqual(actual.controls.kindInspectSource.trace,[]);
  assert.equal(actual.controls.kindDeclareRequest.outcome.code,'CORE_KIND_VALUE');
  assert.deepEqual(actual.controls.kindDeclareRequest.trace,[]);
  assert.equal(actual.controls.nullabilityDeclareRequest.outcome.code,'CORE_NULLABILITY_VALUE');
  assert.deepEqual(actual.controls.nullabilityDeclareRequest.trace,[]);
  assert.equal(actual.controls.kindVerifyReceipt.outcome.code,'CORE_KIND_RECEIPT');
  assert.deepEqual(actual.controls.kindVerifyReceipt.trace,[]);
  assert.equal(actual.controls.nullabilityVerifyReceipt.outcome.code,'CORE_NULLABILITY_RECEIPT');
  assert.deepEqual(actual.controls.nullabilityVerifyReceipt.trace,[]);
  assert.deepEqual(actual.controls.sourceBeforeIdentity.trace,[]);
  assert.deepEqual(actual.controls.nullabilitySourceBeforeIdentity.trace,[]);
  assert.equal(actual.controls.validReceiptAdmitsCurrent.outcome.code,'NON_JSON');
  assert.deepEqual(actual.controls.validReceiptAdmitsCurrent.trace,[]);
  assert.equal(actual.threw,true,'original thrown Proxy trap value is rethrown');
  assert.ok(actual.meterCalls>0 && actual.setupWork>0 && actual.operationWork>0,'factory resource setup and operation work are reported through separate controls');
  assert.equal(actual.repeatedSetupWork,actual.setupWork,'prior WASM factories do not change the next setup charge');
  assert.equal(actual.repeatedSetupFailure.code,'RESOURCE_LIMIT','prior WASM factories do not change setup refusal');
  assert.equal(actual.setupFailure.code,'RESOURCE_LIMIT','factory resource setup budget fails closed');
  assert.equal(actual.zeroWorkSetupFailure.code,'RESOURCE_LIMIT','zero-work setup limit refuses before resource reflection');
  assert.equal(actual.setupGetterTouched,false,'zero-work setup does not invoke a hostile resource getter');
  assert.equal(actual.boundedResult.code,'RESOURCE_LIMIT','per-call work ceiling spans staged operation phases');
  assert.ok(actual.resetWork>0,'per-call ledger reports work across repeated invocations');
  assert.equal(actual.cancellationResult.code,'CANCELLED','cancellation is checked during cumulative resource/operation work');
  assert.deepEqual(actual.pinnedResult,actual.expected.inspectKind,'resource tree is snapshotted at engine initialization');
  console.log(JSON.stringify({status:'chromium-host-json-parity-passed',operations:6,negativeControls:Object.keys(actual.controls).length,freshWasm:true,setupWork:actual.setupWork,repeatedSetupWork:actual.repeatedSetupWork,operationWork:actual.operationWork,meterCalls:actual.meterCalls,resetWork:actual.resetWork}));
} finally {
  await browser?.close();
  await new Promise(resolveClose => server.close(resolveClose));
}
