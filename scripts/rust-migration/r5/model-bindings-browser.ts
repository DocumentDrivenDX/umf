// SPDX-License-Identifier: MIT OR Apache-2.0
// Execute opt-in model operations in real Chromium over the rebuilt production WASM.
import {mkdir, readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {chromium} from 'playwright';

const host = '/private/tmp/umf-r5-model-host';
const root = process.cwd();
const pkg = join(host, 'wasm/pkg');
await mkdir(join(host, 'wasm/src'), {recursive:true});
await mkdir(join(host, 'node/src'), {recursive:true});
await mkdir(pkg, {recursive:true});
for (const [src, dst] of [
  ['bindings/core/wasm/index.js', join(host, 'wasm/index.js')],
  ['bindings/core/wasm/src/core-model.js', join(host, 'wasm/src/core-model.js')],
  ['bindings/core/node/src/wire.js', join(host, 'node/src/wire.js')],
  ['bindings/core/node/src/javascript-numeric.js', join(host, 'node/src/javascript-numeric.js')],
 ] as const) await Bun.write(dst, await readFile(join(root, src)));
await Bun.write(join(host, 'wasm/package.json'), '{"type":"module"}');
for (const file of ['umf_core_wasm.js', 'umf_core_wasm_bg.wasm', 'umf_core_wasm.d.ts']) {
  await Bun.write(join(pkg, file), await readFile(join('/private/tmp/umf-r5-model-wasm/pkg', file)));
}
const resources = Object.fromEntries(await Promise.all(([
  ['coreSchema','spec/core/schema.json'], ['referenceSchema','spec/core/semantic-type-reference.schema.json'],
  ['packageSchema','spec/core/extension-package.schema.json'], ['constraints','spec/metamodel/generated/core-constraints.json'],
  ['domainPolicy','spec/metamodel/generated/domain-policy.json'],
 ] as const).map(async ([key, path]) => [key, await Bun.file(path).json()])));
const source = await Bun.file('scripts/rust-migration/r5/kind-nullability/input.json').json();
const surrogateSource = await Bun.file('scripts/rust-migration/r5/kind-nullability/surrogate-input.json').json();
const frozen = await Bun.file('scripts/rust-migration/r5/kind-nullability/frozen-typescript.json').json();
const refusals = await Bun.file('scripts/rust-migration/r5/kind-nullability/frozen-refusals.json').json();
const cardinality = await Bun.file('docs/helix/04-build/evidence/rust-migration/r5-cardinality/vectors.json').json();
const cardinalityFrozen = await Bun.file('docs/helix/04-build/evidence/rust-migration/r5-model-bindings/frozen-cardinality-typescript.json').json();
const selectionInputs = await Bun.file('scripts/rust-migration/r5/selection/input.json').json();
const selectionFrozen = await Bun.file('scripts/rust-migration/r5/selection/frozen-typescript.json').json();
const selectionRefusals = await Bun.file('scripts/rust-migration/r5/selection/frozen-refusals.json').json();
const selectionRefusalFixture = await Bun.file('fixtures/validation/core-selection.json').json();
await Bun.write(join(host, 'inputs.json'), JSON.stringify({resources, source, surrogateSource, frozen, refusals, cardinality, cardinalityFrozen, selectionInputs, selectionFrozen, selectionRefusals, selectionRefusalFixture}));
const inputs = JSON.stringify({resources, source, surrogateSource, frozen, refusals, cardinality, cardinalityFrozen, selectionInputs, selectionFrozen, selectionRefusals, selectionRefusalFixture});
await Bun.write(join(host, 'index.html'), '<!doctype html><meta charset="utf-8"><title>R5 model bindings</title>');
const server = createServer(async (req,res) => {
  const path = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
  if (path === '/') { res.writeHead(200, {'content-type':'text/html'}); res.end('<!doctype html><meta charset="utf-8"><title>R5 model bindings</title>'); return; }
  if (path === '/inputs.json') { res.writeHead(200, {'content-type':'application/json'}); res.end(inputs); return; }
  try { const bytes = await readFile(join(host,path)); res.writeHead(200, {'content-type':path.endsWith('.wasm')?'application/wasm':path.endsWith('.js')?'text/javascript':'application/octet-stream'}); res.end(bytes); }
  catch { res.writeHead(404); res.end('missing'); }
});
await new Promise<void>(resolve => server.listen(0,'127.0.0.1',resolve));
const address=server.address(); if (!address || typeof address === 'string') throw Error('Browser server did not start');
let browser;
try {
  browser = await chromium.launch({headless:true, ...(process.env.UMF_CHROMIUM_PATH ? {executablePath:process.env.UMF_CHROMIUM_PATH} : {})});
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${address.port}/`);
  const result = await page.evaluate(async () => {
    const moduleUrl = new URL('/wasm/index.js', location.href).href;
    const wasmUrl = new URL('/wasm/pkg/umf_core_wasm.js', location.href).href;
    const {createCoreModelEngine, initializeCoreModelWasm} = await import(moduleUrl);
    const {resources, source, surrogateSource, frozen, refusals, cardinality, cardinalityFrozen, selectionInputs, selectionFrozen, selectionRefusals, selectionRefusalFixture}: any = await fetch('/inputs.json').then(r=>r.json());
    const wasm = await import(wasmUrl);
    const engine = await initializeCoreModelWasm(resources,()=>Promise.resolve(wasm),globalThis);
    const preflightControl = (name:string, options:any, expected:string) => {
      let touches=0; const hostile=new Proxy({}, {ownKeys(){touches++;throw Error('resources traversed before control preflight');},getOwnPropertyDescriptor(){touches++;throw Error('resources read before control preflight');}});
      let code=''; try { createCoreModelEngine(wasm,hostile,options); } catch (e:any) { code=e.code??''; }
      if (code!==expected||touches!==0) throw Error(`${name} preflight returned ${code} after ${touches} resource touches`);
      return {code,touches};
    };
    const preflight={
      zeroWork:preflightControl('zero-work',{controls:{maxWork:0}},'RESOURCE_LIMIT'),
      cancelled:preflightControl('cancelled',{controls:{isCancelled:()=>true}},'CANCELLED'),
      deadline:preflightControl('deadline',{controls:{now:()=>10,deadlineMs:0}},'DEADLINE'),
      hardIsolation:preflightControl('hard-isolated',{profile:'hard-isolated'},'RESOURCE_PROFILE_UNAVAILABLE'),
    };
    let registryCancelled=false, cancelRegistryTouches=0;
    const cancellationEngine=createCoreModelEngine(wasm,resources,{controls:{isCancelled:()=>registryCancelled}});
    registryCancelled=true;
    const hostileRegistry=new Proxy([],{getPrototypeOf(){cancelRegistryTouches++;throw Error('registry touched before cancellation');},ownKeys(){cancelRegistryTouches++;throw Error('registry touched before cancellation');},getOwnPropertyDescriptor(){cancelRegistryTouches++;throw Error('registry touched before cancellation');}});
    let registryCancellationCode=''; try{cancellationEngine.selectCoreElements(source,{references:'none'},hostileRegistry);}catch(e:any){registryCancellationCode=e.code??'';}
    if(registryCancellationCode!=='CANCELLED'||cancelRegistryTouches!==0)throw Error(`Registry cancellation preflight returned ${registryCancellationCode} after ${cancelRegistryTouches} touches`);
    let largeRegistryDescriptors=0,largeRegistryOwnKeys=0,largeExtensionDescriptors=0,largeRegistryArmed=false,largeRegistryCancelled=false,largeRegistryWork=0;
    const largeRegistryValues=Array.from({length:128},(_,i)=>new Proxy({id:`large-${i}`,version:'1.0.0',scopes:['element'],schema:true},{getOwnPropertyDescriptor(target,key){largeExtensionDescriptors++;return Reflect.getOwnPropertyDescriptor(target,key);}}));
    const largeRegistry=new Proxy(largeRegistryValues,{ownKeys(target){largeRegistryOwnKeys++;return Reflect.ownKeys(target);},getOwnPropertyDescriptor(target,key){if(key!=='length')largeRegistryDescriptors++;return Reflect.getOwnPropertyDescriptor(target,key);}});
    const largeRegistryEngine=createCoreModelEngine(wasm,resources,{controls:{meter:(amount:number)=>{if(largeRegistryArmed){largeRegistryWork+=amount;if(largeRegistryWork>260)largeRegistryCancelled=true;}},isCancelled:()=>largeRegistryCancelled}});
    largeRegistryArmed=true; let largeRegistryCode=''; try{largeRegistryEngine.selectCoreElements(source,{references:'none'},largeRegistry);}catch(e:any){largeRegistryCode=e.code??'';}
    if(largeRegistryCode!=='CANCELLED'||largeRegistryOwnKeys!==1||largeRegistryDescriptors!==128||largeExtensionDescriptors!==0)throw Error(`Large registry was not bounded: ${largeRegistryCode}, work=${largeRegistryWork}, ownKeys=${largeRegistryOwnKeys}, arrayDescriptors=${largeRegistryDescriptors}, extensionDescriptors=${largeExtensionDescriptors}`);
    let meteredWork=0; const meteredEngine=createCoreModelEngine(wasm,resources,{controls:{meter:(amount:number)=>{meteredWork+=amount;}}});
    meteredEngine.inspectCoreKind(source,'m','known'); if (meteredWork===0) throw Error('Model host work was not metered');
    const capture = (operation: () => unknown) => { try { return {ok:true,value:operation()}; } catch (e: any) { return {ok:false,error:{code:e.code??'',message:e.message??String(e),path:e.path??''}}; } };
    const canonical = (v: any): string => Array.isArray(v) ? `[${v.map(canonical).join(',')}]` : v && typeof v === 'object' ? `{${Object.keys(v).sort().map((k:string)=>`${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}` : JSON.stringify(v);
    const kindReceipt = engine.declareCoreKind(source,'m','missing','field');
    const nullReceipt = engine.declareCoreNullability(source,'m','missing','absent-allowed');
    const actual = {
      kind_inspect_known:capture(()=>engine.inspectCoreKind(source,'m','known')),
      kind_inspect_unspecified:capture(()=>engine.inspectCoreKind(source,'m','kindless')),
      kind_declare:capture(()=>kindReceipt), kind_verify:capture(()=>engine.verifyCoreKindDeclaration(kindReceipt,kindReceipt.target)),
      nullability_inspect_missing:capture(()=>engine.inspectCoreNullability(source,'m','missing')),
      nullability_inspect_known:capture(()=>engine.inspectCoreNullability(source,'m','known')),
      nullability_inspect_inapplicable:capture(()=>engine.inspectCoreNullability(source,'m','record')),
      nullability_declare:capture(()=>nullReceipt), nullability_verify:capture(()=>engine.verifyCoreNullabilityDeclaration(nullReceipt,nullReceipt.target)),
      kind_surrogate_identity_inspect:capture(()=>engine.inspectCoreKind(surrogateSource,'\ud800','\ud800')),
      nullability_surrogate_identity_inspect:capture(()=>engine.inspectCoreNullability(surrogateSource,'\ud800','\ud800')),
    };
    for (const [name, expected] of Object.entries(frozen) as [keyof typeof actual, any][]) if (canonical(actual[name]?.value)!==canonical(expected)) throw Error(`${name} differs from retained TS envelope`);
    const badKind = structuredClone(kindReceipt); badKind.target.id='stale';
    const badNull = structuredClone(nullReceipt); badNull.target.id='stale';
    const invalid=structuredClone(source); invalid.modules[0].elements[0].id=''; invalid.modules.push(structuredClone(invalid.modules[0]));
    const conflicting=structuredClone(source); conflicting.modules[0].elements[0].scalarType='integer';
    const invalidKindSource=structuredClone(kindReceipt); invalidKindSource.source={};
    const invalidKindTarget=structuredClone(kindReceipt); invalidKindTarget.target={};
    const invalidNullSource=structuredClone(nullReceipt); invalidNullSource.source={};
    const invalidNullTarget=structuredClone(nullReceipt); invalidNullTarget.target={};
    const forgedKind=structuredClone(kindReceipt); delete forgedKind.identity;
    const forgedNull=structuredClone(nullReceipt); delete forgedNull.identity;
    const refused = {
      sourceInvalidKind:capture(()=>engine.inspectCoreKind(invalid,'m','known')),
      sourceInvalidNullability:capture(()=>engine.inspectCoreNullability(invalid,'m','known')),
      kindConflict:capture(()=>engine.declareCoreKind(conflicting,'m','known','record')),
      malformedKindReceipt:capture(()=>engine.verifyCoreKindDeclaration(forgedKind,kindReceipt.target)),
      malformedNullabilityReceipt:capture(()=>engine.verifyCoreNullabilityDeclaration(forgedNull,nullReceipt.target)),
      invalidKindReceiptSource:capture(()=>engine.verifyCoreKindDeclaration(invalidKindSource,kindReceipt.target)),
      invalidKindReceiptTarget:capture(()=>engine.verifyCoreKindDeclaration(invalidKindTarget,kindReceipt.target)),
      invalidNullabilityReceiptSource:capture(()=>engine.verifyCoreNullabilityDeclaration(invalidNullSource,nullReceipt.target)),
      invalidNullabilityReceiptTarget:capture(()=>engine.verifyCoreNullabilityDeclaration(invalidNullTarget,nullReceipt.target)),
      staleKindReceipt:capture(()=>engine.verifyCoreKindDeclaration(kindReceipt,badKind.target)),
      staleNullabilityReceipt:capture(()=>engine.verifyCoreNullabilityDeclaration(nullReceipt,badNull.target)),
      nullabilityRole:capture(()=>engine.declareCoreNullability(source,'m','record','required')),
      missingIdentity:capture(()=>engine.inspectCoreKind(source,'absent','absent')),
    };
    for (const [name, expected] of Object.entries(refusals) as [keyof typeof refused, any][]) if (canonical(refused[name])!==canonical(expected)) throw Error(`${name} refusal differs from frozen TypeScript envelope`);
    const cardInspect = engine.inspectCoreCardinality(cardinalityFrozen.document,cardinalityFrozen.identity.module,cardinalityFrozen.identity.element);
    const cardKnown = engine.inspectCoreCardinality(cardinalityFrozen.known,cardinalityFrozen.identity.module,cardinalityFrozen.identity.element);
    const cardUnknown = engine.inspectCoreCardinality(cardinalityFrozen.unknown,cardinalityFrozen.identity.module,cardinalityFrozen.identity.element);
    const cardInapplicable = engine.inspectCoreCardinality(cardinalityFrozen.inapplicable,cardinalityFrozen.identity.module,cardinalityFrozen.identity.element);
    const cardReceipt = engine.declareCoreCardinality(cardinalityFrozen.document,cardinalityFrozen.identity.module,cardinalityFrozen.identity.element,cardinalityFrozen.request);
    const cardVerified = engine.verifyCoreCardinalityDeclaration(cardReceipt,cardReceipt.target);
    const cardSurrogate = engine.inspectCoreCardinality(cardinalityFrozen.surrogateIdentityDocument,cardinalityFrozen.surrogateIdentity.module,cardinalityFrozen.surrogateIdentity.element);
    const cardItemType = engine.declareCoreCardinality(cardinalityFrozen.surrogateItemDocument,cardinalityFrozen.identity.module,cardinalityFrozen.identity.element,cardinalityFrozen.surrogateItemRequest);
    for (const [actual, expected] of [[cardInspect,cardinalityFrozen.inspections.missing.value],[cardKnown,cardinalityFrozen.inspections.known.value],[cardUnknown,cardinalityFrozen.inspections.unknown.value],[cardInapplicable,cardinalityFrozen.inspections.inapplicable.value],[cardReceipt,cardinalityFrozen.declaration],[cardVerified,cardinalityFrozen.verified.value],[cardSurrogate,cardinalityFrozen.refusals.surrogateIdentity.value],[cardItemType,cardinalityFrozen.surrogateItemDeclaration.value]]) if (canonical(actual)!==canonical(expected)) throw Error('Cardinality wrapper result differs from frozen TypeScript envelope');
    const cardRefusals = {
      unknownOverwrite:capture(()=>engine.declareCoreCardinality(cardinalityFrozen.unknown,cardinalityFrozen.identity.module,cardinalityFrozen.identity.element,{cardinality:'one'})),
      invalidRequest:capture(()=>engine.declareCoreCardinality(cardinalityFrozen.document,cardinalityFrozen.identity.module,cardinalityFrozen.identity.element,{cardinality:'array',itemType:{module:'',element:''}})),
      missingIdentity:capture(()=>engine.inspectCoreCardinality(cardinalityFrozen.document,'absent','absent')),
      malformedSourceReceipt:capture(()=>engine.verifyCoreCardinalityDeclaration(cardinalityFrozen.malformedSourceReceipt,cardinalityFrozen.declaration.target)),
      malformedTargetReceipt:capture(()=>engine.verifyCoreCardinalityDeclaration(cardinalityFrozen.malformedTargetReceipt,cardinalityFrozen.declaration.target)),
      surrogateIdentity:capture(()=>engine.inspectCoreCardinality(cardinalityFrozen.surrogateIdentityDocument,cardinalityFrozen.surrogateIdentity.module,cardinalityFrozen.surrogateIdentity.element)),
    };
    for (const [name, expected] of Object.entries(cardinalityFrozen.refusals) as [keyof typeof cardRefusals, any][]) if (canonical(cardRefusals[name])!==canonical(expected)) throw Error(`Cardinality ${name} refusal differs from frozen TypeScript envelope`);
    const selection = Object.fromEntries(Object.entries(selectionInputs.queries).map(([name,query]:any)=>[name,engine.selectCoreElements(selectionInputs.source,query)]));
    selection.surrogate=engine.selectCoreElements(selectionInputs.surrogateSource,{references:'none',identities:[{module:'\ud800',element:'\ud800'}]});
    for (const [name,expected] of Object.entries(selectionFrozen.cases) as [string,any][]) if(canonical(selection[name])!==canonical(expected)) throw Error(`Selection ${name} differs from frozen TypeScript envelope`);
    if(canonical(selection.surrogate)!==canonical(selectionFrozen.surrogate))throw Error('Selection raw-surrogate identity differs from frozen TypeScript envelope');
    const invalidReference=structuredClone(selectionRefusalFixture.source); invalidReference.modules[0].elements[0].references[0].element='absent';
    const invalidShape=structuredClone(selectionRefusalFixture.source); invalidShape.modules[0].elements[0].id='';
    const rejectingExtension={id:'future.meaning',version:'1.0.0',scopes:['document','module','element'],schema:{type:'object'},semantics:()=>[{code:'FROZEN_REJECT',path:'/extensions/future.meaning',severity:'error',message:'Frozen rejection'}]};
    const selectionRefused={invalidReference:capture(()=>engine.selectCoreElements(invalidReference,{references:'none'})),invalidShape:capture(()=>engine.selectCoreElements(invalidShape,{references:'none'})),semanticErrorEvenEmpty:capture(()=>engine.selectCoreElements(selectionRefusalFixture.source,{references:'none',names:[]},[rejectingExtension])),malformedQuery:capture(()=>engine.selectCoreElements(selectionRefusalFixture.source,{references:'none',extra:true})),large:capture(()=>engine.selectCoreElements({umf:'0.10.0',id:'large',vocabularies:{},modules:[{id:'m',namespace:'',elements:[{id:'e',extensions:{},future:Array(51000).fill('opaque')}]}]},{references:'none'}))};
    for(const [name,expected] of Object.entries(selectionRefusals) as [keyof typeof selectionRefused,any][])if(canonical(selectionRefused[name])!==canonical(expected))throw Error(`Selection ${name} refusal differs from frozen TypeScript envelope: actual=${JSON.stringify(selectionRefused[name])} expected=${JSON.stringify(expected)}`);
    let resourceRefusal=''; try { createCoreModelEngine(wasm,resources,{controls:{maxWork:0}}); } catch (e: any) { resourceRefusal=e.code; }
    if (resourceRefusal!=='RESOURCE_LIMIT') throw Error(`Resource refusal failed: ${resourceRefusal}`);
    let hardIsolation=''; try { createCoreModelEngine(wasm,resources,{profile:'hard-isolated'}); } catch (e: any) { hardIsolation=e.code; }
    if (hardIsolation!=='RESOURCE_PROFILE_UNAVAILABLE') throw Error(`Hard-isolated profile was not refused: ${hardIsolation}`);
    return {kindNullabilityEnvelopes:Object.keys(actual).length, refusalCases:Object.keys(refused).length, cardinalitySuccesses:8, cardinalityRefusals:Object.keys(cardRefusals).length, selectionSuccesses:Object.keys(selection).length, selectionRefusals:Object.keys(selectionRefused).length, resourceRefusal, hardIsolation, preflight,registryControls:{cancellation:{code:registryCancellationCode,touches:cancelRegistryTouches},large:{code:largeRegistryCode,work:largeRegistryWork,ownKeys:largeRegistryOwnKeys,arrayDescriptors:largeRegistryDescriptors,extensionDescriptors:largeExtensionDescriptors}},meteredWork,nodeGlobalsAbsent:!('process' in globalThis)&&!('Buffer' in globalThis)};
  });
  if (!result.nodeGlobalsAbsent) throw Error('WASM browser bundle depends on Node globals');
  await Bun.write('/private/tmp/umf-r5-model-bindings-chromium-result.json', JSON.stringify({status:'pass',chromium:browser.version(),...result},null,2)+'\n');
  console.log(JSON.stringify({status:'pass',chromium:browser.version(),...result}));
} finally { await browser?.close(); server.close(); }
