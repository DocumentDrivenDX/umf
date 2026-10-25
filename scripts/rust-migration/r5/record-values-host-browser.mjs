// SPDX-License-Identifier: MIT OR Apache-2.0
// Replay the frozen raw-host record-values packet in Chromium against an
// extracted opt-in WASM package. The oversized countLimit vector is omitted.
import assert from 'node:assert/strict';
import {readFile, readdir, stat} from 'node:fs/promises';
import {createServer} from 'node:http';
import {join, resolve, sep} from 'node:path';
import {chromium} from 'playwright';

const root = resolve(import.meta.dirname, '../../..');
const packageRoot = process.env.UMF_R5_HOST_WASM_PACKAGE;
if (!packageRoot) throw new Error('Set UMF_R5_HOST_WASM_PACKAGE to an extracted WASM package');
const pkgRoot = resolve(packageRoot);
if (!(await stat(join(pkgRoot, 'pkg/umf_core_wasm_bg.wasm'))).isFile()) throw new Error('Missing extracted WASM asset');
const read = async path => JSON.parse(await readFile(join(root, path), 'utf8'));
const resources = Object.fromEntries(await Promise.all([
  ['coreSchema', 'spec/core/schema.json'],
  ['referenceSchema', 'spec/core/semantic-type-reference.schema.json'],
  ['packageSchema', 'spec/core/extension-package.schema.json'],
  ['constraints', 'spec/metamodel/generated/core-constraints.json'],
  ['domainPolicy', 'spec/metamodel/generated/domain-policy.json'],
].map(async ([key, path]) => [key, await read(path)])));
const packet = await read('docs/helix/04-build/evidence/rust-migration/r5-record-values/host-admission.json');
const inputBytes = JSON.stringify({resources, packet});
const mime = path => path.endsWith('.wasm') ? 'application/wasm' : path.endsWith('.js') ? 'text/javascript' : 'application/octet-stream';
const server = createServer(async (request, response) => {
  const urlPath = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
  if (urlPath === '/') { response.writeHead(200, {'content-type': 'text/html'}); response.end('<!doctype html><meta charset="utf-8">'); return; }
  if (urlPath === '/inputs.json') { response.writeHead(200, {'content-type': 'application/json'}); response.end(inputBytes); return; }
  const local = resolve(pkgRoot, `.${decodeURIComponent(urlPath.slice('/package'.length))}`);
  if (urlPath.startsWith('/package/') && local !== pkgRoot && local.startsWith(`${pkgRoot}${sep}`)) {
    try { response.writeHead(200, {'content-type': mime(local), 'cache-control': 'no-store'}); response.end(await readFile(local)); return; }
    catch { /* use 404 below */ }
  }
  response.writeHead(404); response.end('missing');
});
await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Browser server did not start');
let browser;
try {
  browser = await chromium.launch({headless: true, timeout: 30_000, ...(process.env.UMF_CHROMIUM_PATH ? {executablePath: process.env.UMF_CHROMIUM_PATH} : {})});
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${address.port}/`, {timeout: 15_000});
  const result = await page.evaluate(async () => {
    const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
      : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
      : JSON.stringify(value);
    const {resources, packet} = await fetch('/inputs.json').then(response => response.json());
    const wrapper = await import(new URL('/package/index.js', location.href).href);
    const wasm = await import(new URL('/package/pkg/umf_core_wasm.js', location.href).href);
    const api = await wrapper.initializeCoreRecordValuesHostInputWasm(resources, () => Promise.resolve(wasm), globalThis);
    const capture = run => { try { return {ok:true,value:run()}; } catch (error) { return {ok:false,error:{name:error?.name ?? 'Error',code:error?.code ?? '',message:error?.message ?? String(error),path:error?.path ?? ''}}; } };
    const out = packet.outcomes;
    let count = 0;
    const compare = (name, actual, expected) => { if (canonical(actual) !== canonical(expected)) throw Error(`${name} mismatch`); count++; };
    const {source, identity, values} = packet.fixture;
    const base = capture(() => api.validateCoreRecordValues(source, identity, values));
    compare('base', base, out.base);
    const mapDescriptor=Object.getOwnPropertyDescriptor(Array.prototype,'map');
    let mapGetterCalls=0,primordialOutcome;
    Object.defineProperty(Array.prototype,'map',{configurable:true,get(){mapGetterCalls++;throw Error('host admission read mutable Array.prototype.map');}});
    try{primordialOutcome=capture(()=>api.validateCoreRecordValues(source,identity,values));}
    finally{Object.defineProperty(Array.prototype,'map',mapDescriptor);}
    if(canonical(primordialOutcome)!==canonical(out.base)||mapGetterCalls!==0)throw Error('host admission consulted mutable Array.prototype.map');
    const outcomeShape = value => Array.isArray(value) ? {kind:'array',items:value.map(outcomeShape)}
      : value && typeof value === 'object' ? {kind:Object.getPrototypeOf(value) === null ? 'null-object' : Object.getPrototypeOf(value) === Object.prototype ? 'plain-object' : 'other-object',keys:Object.keys(value),fields:Object.fromEntries(Object.keys(value).map(key => [key,outcomeShape(value[key])]))}
      : typeof value;
    compare('basePrototypeOrder', outcomeShape(base.value), out.prototypeOrder);
    let sourceGetterCalls = 0, identityGetterCalls = 0, valuesGetterCalls = 0;
    const sourceAccessor = {...source}; Object.defineProperty(sourceAccessor, 'future', {enumerable:true,get(){sourceGetterCalls++;return true;}});
    const identityAccessor = {get module(){identityGetterCalls++;return 'fixture';},element:'item'};
    const valuesAccessor = [{field:{module:'fixture',element:'label'},state:'present',get value(){valuesGetterCalls++;return {string:'x'};}}];
    compare('sourceAccessor',capture(()=>api.validateCoreRecordValues(sourceAccessor,identityAccessor,valuesAccessor)),out.rawCases.sourceAccessor);
    const sourceFirstCalls={sourceGetterCalls,identityGetterCalls,valuesGetterCalls};
    sourceGetterCalls=identityGetterCalls=valuesGetterCalls=0;
    compare('identityAccessor',capture(()=>api.validateCoreRecordValues(source,identityAccessor,valuesAccessor)),out.rawCases.identityAccessor);
    const identityFirstCalls={sourceGetterCalls,identityGetterCalls,valuesGetterCalls};
    sourceGetterCalls=identityGetterCalls=valuesGetterCalls=0;
    compare('valuesAccessorBeforeSourceVersion',capture(()=>api.validateCoreRecordValues({...source,umf:'0.7.0'},identity,valuesAccessor)),out.rawCases.valuesAccessorBeforeSourceVersion);
    const valuesBeforeSemanticCalls={sourceGetterCalls,identityGetterCalls,valuesGetterCalls};
    compare('getterCallOrder',{sourceFirst:sourceFirstCalls,identityFirst:identityFirstCalls,valuesBeforeSemantic:valuesBeforeSemanticCalls},out.rawCases.sourceThenIdentityThenValuesGetterCounts);
    const hiddenSource={...source}; Object.defineProperty(hiddenSource,'hidden',{value:true,enumerable:false});
    compare('hiddenSource',capture(()=>api.validateCoreRecordValues(hiddenSource,identity,values)),out.rawCases.hiddenSource);
    compare('symbolSource',capture(()=>api.validateCoreRecordValues({...source,[Symbol('future')]:true},identity,values)),out.rawCases.symbolSource);
    compare('customPrototypeSource',capture(()=>api.validateCoreRecordValues(Object.assign(Object.create({future:true}),source),identity,values)),out.rawCases.customPrototypeSource);
    compare('sparseValues',capture(()=>api.validateCoreRecordValues(source,identity,new Array(1))),out.rawCases.sparseValues);
    compare('cyclicSource',capture(()=>{const value={...source};value.cycle=value;return api.validateCoreRecordValues(value,identity,values);}),out.rawCases.cyclicSource);
    const invalidNumbers=[NaN,Infinity,-Infinity,-0,Number.MAX_SAFE_INTEGER+1];
    compare('invalidNumbers',invalidNumbers.map((number,index)=>({id:['nan','positiveInfinity','negativeInfinity','negativeZero','unsafeInteger'][index],outcome:capture(()=>api.validateCoreRecordValues(source,identity,[{field:{module:'fixture',element:'label'},state:'present',value:{number}}]))})),out.rawCases.invalidNumbers);
    compare('nonJsonValues',capture(()=>api.validateCoreRecordValues(source,identity,[undefined])),out.rawCases.nonJsonValues);
    const hiddenIdentity={module:'fixture'};Object.defineProperty(hiddenIdentity,'element',{value:'item',enumerable:false});
    compare('hiddenIdentity',capture(()=>api.validateCoreRecordValues(source,hiddenIdentity,values)),out.rawCases.hiddenIdentity);
    compare('symbolIdentity',capture(()=>api.validateCoreRecordValues(source,{...identity,[Symbol('future')]:true},values)),out.rawCases.symbolIdentity);
    compare('customPrototypeIdentity',capture(()=>api.validateCoreRecordValues(source,Object.assign(Object.create({future:true}),identity),values)),out.rawCases.customPrototypeIdentity);
    compare('crossedInvalidSemanticSource',capture(()=>api.validateCoreRecordValues({...source,umf:'0.7.0'},{module:''},[null])),out.rawCases.crossedInvalidSemanticSource);
    const largeSource=structuredClone(source);largeSource['x-future-assertion']={opaque:'x'.repeat(out.large.units)};
    compare('largeRetainedUnknown',capture(()=>{const result=api.validateCoreRecordValues(largeSource,identity,values);return {length:result.source['x-future-assertion'].opaque.length,prototypeOrder:outcomeShape(result)};}),out.large.outcome);
    let meteredWork=0;
    const metered=await wrapper.initializeCoreRecordValuesHostInputWasm(resources,()=>Promise.resolve(wasm),globalThis,{controls:{meter:amount=>meteredWork+=amount}});
    compare('meteredValid',capture(()=>metered.validateCoreRecordValues(source,identity,values)),out.base);
    if(meteredWork<=0)throw Error('Rust host meter was not observed');
    let zeroWork;
    try{const limited=await wrapper.initializeCoreRecordValuesHostInputWasm(resources,()=>Promise.resolve(wasm),globalThis,{controls:{maxWork:0}});limited.validateCoreRecordValues(source,identity,values);zeroWork={ok:true};}
    catch(error){zeroWork={ok:false,code:error.code??''};}
    if(zeroWork.ok||zeroWork.code!=='RESOURCE_LIMIT')throw Error('maxWork 0 did not refuse');
    if(count!==19)throw Error(`Expected 19 cases, got ${count}`);
    if(typeof process!=='undefined'||typeof Buffer!=='undefined')throw Error('Node globals are present');
    return {status:'passed',runtime:'Chromium',cases:count,additionalHostPrimordialControl:'passed',mapGetterCalls,meteredWork,zeroWork:zeroWork.code,nodeGlobalsAbsent:true,countLimitProbe:'held'};
  });
  console.log(JSON.stringify({status:'pass',packageRoot:pkgRoot,browser:browser.version(),...result}));
} finally { await browser?.close(); server.close(); }
