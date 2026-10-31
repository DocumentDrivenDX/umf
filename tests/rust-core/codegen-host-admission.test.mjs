// SPDX-License-Identifier: MIT OR Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {createCodegenEngine, createRetainedCodegenEngine} from '../../bindings/core/node/index.js';
import {createCodegenEngine as createWasmCodegenEngine} from '../../bindings/core/wasm/index.js';
import {createRetainedCodegenEngine as createRetainedWasmCodegenEngine} from '../../bindings/core/wasm/index.js';
import {toWire, fromWire, encodeWire} from '../../bindings/core/node/src/wire.js';
const resources = {coreSchema:{},referenceSchema:{},packageSchema:{},constraints:{},domainPolicy:{},tablesPackage:{},actionsPackage:{},bindingPackage:{},stableBindingPackage:{}};
const wasm = {copyJsonWire(){},executeRequestWire(){throw new Error('native execution must not be reached');}};
const factories = [resources => createCodegenEngine(resources), resources => createWasmCodegenEngine(wasm,resources)];
const controlledFactories = [(r,o)=>createCodegenEngine(r,o),(r,o)=>createWasmCodegenEngine(wasm,r,o)];

test('R3 constructor copy observes budget, cancellation, deadline and callback failures',()=>{
  for (const create of controlledFactories) {
    for (const [controls,code] of [[{maxWork:0},'RESOURCE_LIMIT'],[{isCancelled:()=>true},'CANCELLED'],[{now:()=>2,deadlineMs:1},'DEADLINE'],[{meter:()=>{throw new Error('meter origin');}},'METER_FAILURE']]) {
      assert.throws(()=>create(resources,{controls}),{code});
    }
    assert.throws(()=>create(resources,{profile:'hard-isolated'}),{code:'RESOURCE_PROFILE_UNAVAILABLE'});
  }
});

test('R3 resource snapshots reject accessors without executing them',()=>{
  for (const create of factories) {
    let reads=0;
    const value={...resources};
    Object.defineProperty(value,'tablesPackage',{enumerable:true,get(){reads++;return {};}});
    assert.throws(()=>create(value),/data property/);
    assert.equal(reads,0);
  }
});

test('R3 host transport precharges large string copying and can stop before materialization',()=>{
  const source='x'.repeat(2_000_000);
  let charge=0;
  const stop=amount=>{charge+=amount;if(charge>1000)throw new Error('stop copying');};
  assert.throws(()=>toWire({source},{maxValues:Number.MAX_SAFE_INTEGER,work:stop}),/stop copying/);
  assert.ok(charge>=source.length);
  const wire=toWire(source,{maxValues:Number.MAX_SAFE_INTEGER});
  charge=0;
  assert.throws(()=>fromWire(wire,stop),/stop copying/);
});

test('R3 output conversion preserves raw UTF-16, negative zero and isolation with accounting',()=>{
  const source={text:'\ud800x\udc00',number:-0,items:[1]};
  let work=0;
  const result=fromWire(toWire(source,{work:n=>{work+=n;}}),n=>{work+=n;});
  assert.equal(result.text,source.text);
  assert.ok(Object.is(result.number,-0));
  result.items.push(2);
  assert.deepEqual(source.items,[1]);
  assert.ok(work>10);
});

test('R3 catalog payloads retain independent finite value budgets',()=>{
  const examples=Array(350_000).fill(null);
  for (const create of factories) {
    // More than one million aggregate values are allowed across resources.
    assert.doesNotThrow(()=>create({...resources,coreSchema:{examples},referenceSchema:{examples},packageSchema:{examples}}));
    assert.throws(()=>create({...resources,coreSchema:{examples:Array(1_000_000).fill(null)}}),{code:'RESOURCE_LIMIT'});
  }
});

test('R3 installed Node operations stop after work begins and retain independent outputs',async()=>{
  const {readFileSync}=await import('node:fs');
  const load=path=>JSON.parse(readFileSync(new URL('../../'+path,import.meta.url),'utf8'));
  const paths={coreSchema:'spec/core/schema.json',referenceSchema:'spec/core/semantic-type-reference.schema.json',packageSchema:'spec/core/extension-package.schema.json',constraints:'spec/metamodel/generated/core-constraints.json',domainPolicy:'spec/metamodel/generated/domain-policy.json',tablesPackage:'spec/extensions/tables/package.json',actionsPackage:'spec/extensions/actions/package.json',bindingPackage:'spec/extensions/binding/package.json',stableBindingPackage:'spec/extensions/binding-stable/package.json'};
  const catalogs=Object.fromEntries(Object.entries(paths).map(([key,path])=>[key,load(path)]));
  const corpus=load('tests/rust-core/fixtures/r3/baseline/operations.json');
  for(const operation of ['generatePythonClient','compileTableDeployment','compileTableMigration']){
    const row=corpus.cases.find(row=>row.operation===operation&&row.expected.ok);
    assert.ok(row,operation+' success fixture');
    let active=false,charged=0,stop=Infinity,mode='observe';
    const engine=createCodegenEngine(catalogs,{controls:{meter:n=>{if(active){charged+=n;if(mode==='meter'&&charged>stop)throw Error('late compiler meter');}},isCancelled:()=>active&&mode==='cancel'&&charged>stop,now:()=>active&&mode==='deadline'&&charged>stop?2:0,deadlineMs:1}});
    active=true;
    const first=engine.call(operation,row.request);
    assert.equal(first.ok,true);
    const total=charged;
    assert.ok(total>1000,operation+' has measured work');
    const retained=JSON.stringify(first);
    if(first.result&&typeof first.result==='object')first.result.changedByCaller=true;
    assert.equal(JSON.stringify(engine.call(operation,row.request)),retained,operation+' output isolation');
    for(const [policy,code]of [['meter','METER_FAILURE'],['cancel','CANCELLED'],['deadline','DEADLINE']]){
      mode=policy;charged=0;stop=Math.floor(total*0.75);
      assert.throws(()=>engine.call(operation,row.request),{code},operation+' late '+policy);
      assert.ok(charged>stop&&charged<total,operation+' interrupted before total work');
    }
  }
});

test('retained Node codegen is opt-in, snapshots resources, and resets controls per invocation',async()=>{
  const {readFileSync}=await import('node:fs');
  const load=path=>JSON.parse(readFileSync(new URL('../../'+path,import.meta.url),'utf8'));
  const paths={coreSchema:'spec/core/schema.json',referenceSchema:'spec/core/semantic-type-reference.schema.json',packageSchema:'spec/core/extension-package.schema.json',constraints:'spec/metamodel/generated/core-constraints.json',domainPolicy:'spec/metamodel/generated/domain-policy.json',tablesPackage:'spec/extensions/tables/package.json',actionsPackage:'spec/extensions/actions/package.json',bindingPackage:'spec/extensions/binding/package.json',stableBindingPackage:'spec/extensions/binding-stable/package.json'};
  const catalogs=Object.fromEntries(Object.entries(paths).map(([key,path])=>[key,load(path)]));
  const corpus=load('tests/rust-core/fixtures/r3/baseline/operations.json');
  const row=corpus.cases.find(item=>item.operation==='generatePythonClient'&&item.expected.ok);
  assert.ok(row,'frozen successful generator case');
  const defaultEngine=createCodegenEngine(catalogs);
  const expected=defaultEngine.call(row.operation,row.request);
  let setupWork=0, active=false, charged=0, stop=Infinity, mode='observe';
  const retained=createRetainedCodegenEngine(catalogs,{
    setupControls:{meter:n=>{setupWork+=n;}},
    controls:{meter:n=>{if(active){charged+=n;if(mode==='meter'&&charged>stop)throw Error('late retained meter');}},isCancelled:()=>active&&mode==='cancel'&&charged>stop,now:()=>active&&mode==='deadline'&&charged>stop?2:0,deadlineMs:1},
  });
  assert.ok(setupWork>0,'setup admission has its own budget path');
  catalogs.tablesPackage.title='mutated after handle creation';
  active=true;
  const first=retained.call(row.operation,row.request);
  assert.deepEqual(first,expected,'retained output matches stateless frozen case');
  const total=charged;
  charged=0;
  const generationCase=load('tests/rust-core/fixtures/r3/sol-generation-binding-module-boundary-review/frozen.json').cases[0];
  const diffCase=load('tests/rust-core/fixtures/r3/sol-final-access-diff-utf16-review/frozen.json').cases[0];
  assert.equal(JSON.stringify(retained.generateAccessPackage(generationCase.request.request,generationCase.request.profile)),JSON.stringify(generationCase.expected.result),'retained generateAccessPackage matches frozen output');
  assert.equal(JSON.stringify(retained.diffAccessPackages(diffCase.request.before,diffCase.request.after)),JSON.stringify(diffCase.expected.result),'retained diffAccessPackages matches frozen output');
  assert.ok(total>1000,'invocation work is metered independently');
  const frozen=JSON.stringify(first);
  first.result.changedByCaller=true;
  charged=0;
  assert.equal(JSON.stringify(retained.call(row.operation,row.request)),frozen,'output and input-resource snapshots are isolated');
  for(const [policy,code] of [['meter','METER_FAILURE'],['cancel','CANCELLED'],['deadline','DEADLINE']]){
    mode=policy;charged=0;stop=Math.floor(total*.75);
    assert.throws(()=>retained.call(row.operation,row.request),{code},`call after construction observes ${policy}`);
    assert.ok(charged>stop&&charged<total,`${policy} applies to this call only`);
  }
  retained.dispose();
  retained.dispose();
  assert.throws(()=>retained.call(row.operation,row.request),{code:'RUST_CODEGEN_HANDLE_DISPOSED'});
});

test('retained WASM façade keeps setup and invocation controls separate and frees idempotently',()=>{
  let setupCalls=0, frees=0;
  class RetainedCodegenResourcesRuntime {
    constructor(_wire, control) { control?.(1); setupCalls++; }
    executeWire(wire, control) {
      const refusal=control?.(1);
      if(refusal){const failure=fromWire(JSON.parse(refusal));return JSON.stringify({profile:'umf.core-wire/1',status:'error',code:failure.code});}
      const request=fromWire(JSON.parse(wire));
      return JSON.stringify({profile:'umf.core-wire/1',status:'ok',wire:encodeWire({ok:true,result:request.request})});
    }
    executeHostReadV3Wire() { throw new Error('host-read not exercised by this fixture'); }
    free() { frees++; }
  }
  const module={RetainedCodegenResourcesRuntime};
  let active=false;
  const engine=createRetainedWasmCodegenEngine(module,resources,{
    setupControls:{meter:()=>{}},
    controls:{isCancelled:()=>active},
  });
  assert.equal(setupCalls,1);
  assert.equal(JSON.stringify(engine.call('compileTableDeployment',{frozen:true})),JSON.stringify({ok:true,result:{frozen:true}}));
  active=true;
  assert.throws(()=>engine.call('compileTableDeployment',{}),{code:'CANCELLED'});
  engine.dispose();engine.dispose();
  assert.equal(frees,1);
  assert.throws(()=>engine.call('compileTableDeployment',{}),{code:'RUST_CODEGEN_HANDLE_DISPOSED'});
});

test('R3 compiler hosts fail closed without native artifacts',async()=>{
  const {mkdtemp,mkdir,copyFile,cp,writeFile,rm}=await import('node:fs/promises');
  const {tmpdir}=await import('node:os');
  const {join}=await import('node:path');
  const {pathToFileURL}=await import('node:url');
  const directory=await mkdtemp(join(tmpdir(),'umf-r3-no-artifact-'));
  try{
    await mkdir(join(directory,'src'));
    await writeFile(join(directory,'package.json'),JSON.stringify({type:'module'}));
    await copyFile(new URL('../../bindings/core/node/index.js',import.meta.url),join(directory,'index.js'));
    await cp(new URL('../../bindings/core/node/src/',import.meta.url),join(directory,'src'),{recursive:true});
    await assert.rejects(import(pathToFileURL(join(directory,'index.js')).href),error=>error.code==='MODULE_NOT_FOUND'&&error.message.includes('umf_core_node.node'));
    assert.throws(()=>createWasmCodegenEngine({},resources),/RUST_WASM_BINDING_MISSING/);
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('R3 transport wrappers leave the full ordinary request budget available',async()=>{
  const {readFileSync}=await import('node:fs');
  const paths={coreSchema:'spec/core/schema.json',referenceSchema:'spec/core/semantic-type-reference.schema.json',packageSchema:'spec/core/extension-package.schema.json',constraints:'spec/metamodel/generated/core-constraints.json',domainPolicy:'spec/metamodel/generated/domain-policy.json',tablesPackage:'spec/extensions/tables/package.json',actionsPackage:'spec/extensions/actions/package.json',bindingPackage:'spec/extensions/binding/package.json',stableBindingPackage:'spec/extensions/binding-stable/package.json'};
  const catalogs=Object.fromEntries(Object.entries(paths).map(([name,path])=>[name,JSON.parse(readFileSync(new URL('../../'+path,import.meta.url),'utf8'))]));
  const engine=createCodegenEngine(catalogs);
  const ordinary=engine.call('compileTableDeployment',{});
  // Root + array + 99,998 leaves exhaust, but do not exceed, 100,000 values.
  // Semantic request validation still runs despite additional catalog/envelope nodes.
  assert.deepEqual(engine.call('compileTableDeployment',{extra:Array(99_998).fill(null)}),ordinary);
  const over=engine.call('compileTableDeployment',{extra:Array(99_999).fill(null)});
  assert.notDeepEqual(over,ordinary);
  assert.match(JSON.stringify(over),/LIMIT/);
});
