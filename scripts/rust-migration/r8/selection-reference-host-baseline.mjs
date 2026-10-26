// SPDX-License-Identifier: MIT OR Apache-2.0
// Exact TypeScript reference host baseline for Core Element Selection.
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

const root = resolve(import.meta.dirname, '../../..');
const inputPath = resolve(root, 'scripts/rust-migration/r5/selection/input.json');
const fixture = JSON.parse(await readFile(inputPath, 'utf8'));
const validationFixture = JSON.parse(await readFile(resolve(root,'fixtures/validation/core-selection.json'),'utf8'));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const errorShape = (e) => ({name:e?.name ?? '',code:e?.code ?? '',path:e?.path ?? '',message:e?.message ?? String(e)});

export async function runSelectionReferenceBaseline(api) {
  const {selectCoreElements,createUmfRegistry}=api;
  const registry=createUmfRegistry();
  const capture=(fn)=>{try{return {ok:true,value:fn()};}catch(error){return {ok:false,error:errorShape(error)};}};
  const outcomes={};
  const frozen=JSON.parse(await readFile(resolve(root,'scripts/rust-migration/r5/selection/frozen-typescript.json'),'utf8'));
  const frozenRefusals=JSON.parse(await readFile(resolve(root,'scripts/rust-migration/r5/selection/frozen-refusals.json'),'utf8'));
  for(const [name,query] of Object.entries(fixture.queries)) outcomes[`frozen:${name}`]=capture(()=>selectCoreElements(fixture.source,query));
  outcomes['frozen:surrogate']=capture(()=>selectCoreElements(fixture.surrogateSource,{references:'none',identities:[{module:'\ud800',element:'\ud800'}]}));
  for(const [name,value] of Object.entries(frozenRefusals)) outcomes[`frozen-refusal:${name}`]=capture(()=>{
    if(name==='invalidReference'){const x=structuredClone(validationFixture.source);x.modules[0].elements[0].references[0].element='absent';return selectCoreElements(x,{references:'none'});}
    if(name==='invalidShape'){const x=structuredClone(validationFixture.source);x.modules[0].elements[0].id='';return selectCoreElements(x,{references:'none'});}
    if(name==='malformedQuery')return selectCoreElements(validationFixture.source,{references:'none',extra:true});
    if(name==='large')return selectCoreElements({umf:'0.10.0',id:'large',vocabularies:{},modules:[{id:'m',namespace:'',elements:[{id:'e',extensions:{},future:Array(51000).fill('opaque')}]}]},{references:'none'});
    if(name==='semanticErrorEvenEmpty'){
      const packageValue={id:'future',version:'1.0.0',coreVersion:'0.10.0',description:'Frozen semantic selection refusal',schema:{type:'object'},semantics:'Reject all payloads',scopes:['document','module','element'],capabilities:{validation:'semantic',directions:[],evidence:[]}};
      packageValue.id='future.meaning';
      const rejecting=createUmfRegistry().register(packageValue,()=>[{code:'FROZEN_REJECT',path:'/extensions/future.meaning',message:'Frozen rejection',severity:'error'}]);
      return selectCoreElements(validationFixture.source,{references:'none',names:[]},rejecting);
    }
    return undefined;
  });
  const comparisons=[];
  for(const [name,expected] of Object.entries(frozen.cases)){
    const actual=outcomes[`frozen:${name}`];const equal=actual?.ok===true&&JSON.stringify(actual.value)===JSON.stringify(expected);
    comparisons.push({name,equal});
  }
  for(const [name,expected] of Object.entries(frozenRefusals)){
    const actual=outcomes[`frozen-refusal:${name}`];const equal=actual?.ok===false&&actual.error.code===expected.error.code&&actual.error.message===expected.error.message&&actual.error.path===expected.error.path;
    comparisons.push({name:`refusal:${name}`,equal});
  }
  outcomes.frozenComparisons=comparisons;

  const events=[];
  const tracedSource=new Proxy(fixture.source,{getPrototypeOf(t){events.push('source:getPrototypeOf');return Reflect.getPrototypeOf(t);},ownKeys(t){events.push('source:ownKeys');return Reflect.ownKeys(t);},getOwnPropertyDescriptor(t,k){events.push(`source:descriptor:${String(k)}`);return Reflect.getOwnPropertyDescriptor(t,k);}});
  const tracedQuery=new Proxy({references:'none'},{getPrototypeOf(t){events.push('query:getPrototypeOf');return Reflect.getPrototypeOf(t);},ownKeys(t){events.push('query:ownKeys');return Reflect.ownKeys(t);},getOwnPropertyDescriptor(t,k){events.push(`query:descriptor:${String(k)}`);return Reflect.getOwnPropertyDescriptor(t,k);}});
  outcomes['host:source-before-query']=capture(()=>selectCoreElements(tracedSource,tracedQuery));
  outcomes['host:source-before-query'].events=[...events];

  events.length=0;
  const invalidQuery={references:'none',unexpected:true};
  const registryProxy=new Proxy(registry,{get(target,key,receiver){events.push(`registry:get:${String(key)}`);return Reflect.get(target,key,receiver);},ownKeys(target){events.push('registry:ownKeys');return Reflect.ownKeys(target);}});
  outcomes['host:query-before-registry']=capture(()=>selectCoreElements(fixture.source,invalidQuery,registryProxy));
  outcomes['host:query-before-registry'].events=[...events];

  events.length=0;
  const callbackRegistry=createUmfRegistry();
  // A valid no-extension source still proves callback checkpoints via Registry.get reflection.
  const instrumentedRegistry=new Proxy(callbackRegistry,{get(target,key,receiver){events.push(`registry:get:${String(key)}`);return Reflect.get(target,key,receiver);}});
  const callbackSource=new Proxy(fixture.source,{ownKeys(t){events.push('source:ownKeys');return Reflect.ownKeys(t);},getOwnPropertyDescriptor(t,k){events.push(`source:descriptor:${String(k)}`);return Reflect.getOwnPropertyDescriptor(t,k);}});
  outcomes['host:source-admission-before-registry']=capture(()=>selectCoreElements(callbackSource,{references:'none'},instrumentedRegistry));
  outcomes['host:source-admission-before-registry'].events=[...events];
  const packageValue={id:'future',version:'1.0.0',coreVersion:'0.10.0',description:'Selection callback probe',schema:{type:'object'},semantics:'Caller-owned',scopes:['document','module','element'],capabilities:{validation:'semantic',directions:[],evidence:[]}};
  events.length=0;const callbackEvents=[];const callbackRegistry2=createUmfRegistry().register(packageValue,(payload,context)=>{callbackEvents.push({payload,context});events.push('callback');return [{code:'CALLBACK_DIAGNOSTIC',path:context.path,severity:'warning',message:'callback ran'}];});
  const callbackSource2=new Proxy(fixture.source,{ownKeys(t){events.push('source:ownKeys');return Reflect.ownKeys(t);},getOwnPropertyDescriptor(t,k){events.push(`source:descriptor:${String(k)}`);return Reflect.getOwnPropertyDescriptor(t,k);}});
  outcomes['callback:returned-diagnostic']=capture(()=>selectCoreElements(callbackSource2,{references:'none'},callbackRegistry2));outcomes['callback:returned-diagnostic'].calls=callbackEvents.length;outcomes['callback:returned-diagnostic'].sample=callbackEvents[0]??null;outcomes['callback:returned-diagnostic'].events=[...events];
  let callbackThrows=0;const throwingRegistry=createUmfRegistry().register(packageValue,()=>{callbackThrows++;throw new Error('caller callback sentinel');});
  outcomes['callback:throw-converts-to-source-diagnostic']=capture(()=>selectCoreElements(fixture.source,{references:'none'},throwingRegistry));outcomes['callback:throw-converts-to-source-diagnostic'].calls=callbackThrows;
  const invalidCallbackSource=structuredClone(validationFixture.source);invalidCallbackSource.modules[0].elements[0].id='';let invalidCallbackCalls=0;const invalidCallbackRegistry=createUmfRegistry().register({...packageValue,id:'future.meaning'},()=>{invalidCallbackCalls++;return [];});
  outcomes['callback:invalid-source-before-callback']=capture(()=>selectCoreElements(invalidCallbackSource,{references:'none'},invalidCallbackRegistry));outcomes['callback:invalid-source-before-callback'].calls=invalidCallbackCalls;
  const callbackSentinel={identity:'registry get trap'};const registered=createUmfRegistry().register(packageValue,()=>[]);const registryFault=new Proxy(registered,{get(target,key,receiver){if(key==='get')throw callbackSentinel;return Reflect.get(target,key,receiver);}});let thrownIdentity=false;try{selectCoreElements(fixture.source,{references:'none'},registryFault);}catch(error){thrownIdentity=error===callbackSentinel;}outcomes['callback:registry-thrown-identity']={thrownIdentity};
  const customResult=(entry,trace=[])=>{const calls=[];const customRegistry=new Proxy(createUmfRegistry(),{get(target,key,receiver){if(key==='get')return (id,version)=>{calls.push({id,version});trace.push(`Registry.get:${id}@${version}`);return entry;};return Reflect.get(target,key,receiver);}});return {registry:customRegistry,calls};};
  const eventTrace=[];const normalStructure=(payload)=>{eventTrace.push('structure');return true;};const customEntry={get manifest(){eventTrace.push('entry.manifest');return {get scopes(){eventTrace.push('manifest.scopes');return {includes(scope){eventTrace.push(`scopes.includes:${scope}`);return true;}};},get capabilities(){eventTrace.push('manifest.capabilities');return {validation:'structural'};}};},get structure(){eventTrace.push('entry.structure');return normalStructure;},get semantics(){eventTrace.push('entry.semantics');return undefined;}};
  const custom=customResult(customEntry,eventTrace);outcomes['registration:raw-property-order']=capture(()=>selectCoreElements(fixture.source,{references:'none'},custom.registry));outcomes['registration:raw-property-order'].events=[...eventTrace];outcomes['registration:raw-property-order'].lookupCount=custom.calls.length;
  const structureDiagnosticEvents=[];const rejectingStructure=Object.assign(()=>false,{errors:[{instancePath:'/opaque',message:'caller structure refusal'}]});const structureDiagnosticEntry={manifest:{scopes:['document','element'],capabilities:{validation:'semantic'}},structure:rejectingStructure,semantics(){throw Error('must not run after structure failure');}};const rejectRegistry=customResult(structureDiagnosticEntry);outcomes['registration:structure-false-diagnostics']=capture(()=>selectCoreElements(fixture.source,{references:'none'},rejectRegistry.registry));outcomes['registration:structure-false-diagnostics'].lookupCount=rejectRegistry.calls.length;
  const identityCase=(name,entryFactory,extra)=>{const sentinel={name};const entry=entryFactory(sentinel);const testRegistry=customResult(entry);let same=false;try{selectCoreElements(fixture.source,{references:'none'},testRegistry.registry);}catch(error){same=error===sentinel;}outcomes[name]={thrownIdentity:same,lookupCount:testRegistry.calls.length,...extra};};
  identityCase('registration:manifest-getter-throws',sentinel=>({get manifest(){throw sentinel;}}));
  identityCase('registration:scopes-getter-throws',sentinel=>({manifest:{get scopes(){throw sentinel;}}}));
  identityCase('registration:scopes-includes-throws',sentinel=>({manifest:{scopes:{includes(){throw sentinel;}}}}));
  identityCase('registration:structure-getter-throws',sentinel=>({manifest:{scopes:['document','element']},get structure(){throw sentinel;}}));
  identityCase('registration:structure-function-throws',sentinel=>({manifest:{scopes:['document','element']},structure(){throw sentinel;}}));
  identityCase('registration:structure-errors-getter-throws',sentinel=>{const structure=()=>false;Object.defineProperty(structure,'errors',{get(){throw sentinel;}});return {manifest:{scopes:['document','element']},structure};});
  identityCase('registration:capabilities-getter-throws',sentinel=>({manifest:{scopes:['document','element'],get capabilities(){throw sentinel;}},structure:()=>true}));
  identityCase('registration:semantics-getter-throws',sentinel=>({manifest:{scopes:['document','element'],capabilities:{validation:'semantic'}},structure:()=>true,get semantics(){throw sentinel;}}));
  const semanticStringSentinel={name:'String conversion trap'};const semanticError={toString(){throw semanticStringSentinel;}};const stringRegistry=customResult({manifest:{scopes:['document','element'],capabilities:{validation:'semantic'}},structure:()=>true,semantics(){throw semanticError;}});let stringIdentity=false;try{selectCoreElements(fixture.source,{references:'none'},stringRegistry.registry);}catch(error){stringIdentity=error===semanticStringSentinel;}outcomes['registration:semantic-String-throws']={thrownIdentity:stringIdentity,lookupCount:stringRegistry.calls.length};

  const hostCases={};
  const runHost=(name,fn)=>{hostCases[name]=capture(fn);};
  const accessorSource=structuredClone(fixture.source);let getterCalls=0;
  Object.defineProperty(accessorSource.modules[0].elements[0],'name',{enumerable:true,configurable:true,get(){getterCalls++;throw new Error('getter should not run');}});
  runHost('accessor',()=>selectCoreElements(accessorSource,{references:'none'}));hostCases.accessor.getterCalls=getterCalls;
  const hiddenSource=structuredClone(fixture.source);Object.defineProperty(hiddenSource.modules[0].elements[0],'hidden',{value:1,enumerable:false});runHost('hidden',()=>selectCoreElements(hiddenSource,{references:'none'}));
  const symbolSource=structuredClone(fixture.source);symbolSource.modules[0].elements[0][Symbol('hidden')]=1;runHost('symbol',()=>selectCoreElements(symbolSource,{references:'none'}));
  const protoSource=structuredClone(fixture.source);Object.setPrototypeOf(protoSource,{surprise:true});runHost('custom-prototype',()=>selectCoreElements(protoSource,{references:'none'}));
  const cycleSource=structuredClone(fixture.source);cycleSource.extensions.future.loop=cycleSource.extensions;runHost('cycle',()=>selectCoreElements(cycleSource,{references:'none'}));
  const numberSource=structuredClone(fixture.source);numberSource.extensions.future.nonFinite=NaN;runHost('non-finite-number',()=>selectCoreElements(numberSource,{references:'none'}));
  runHost('lone-surrogate-identity',()=>selectCoreElements(fixture.surrogateSource,{references:'none',identities:[{module:'\ud800',element:'\ud800'}]}));
  // The reference validates source even when the query selects nothing.
  const noMatchSource=structuredClone(fixture.source);noMatchSource.modules[0].elements[0].id='';runHost('no-match-still-validates-source',()=>selectCoreElements(noMatchSource,{references:'none',names:[]}));
  // Unknown scalar/extension and repeated annotated edges/cycles are represented in the frozen success packet.
  hostCases.frozenUnknownAndRepeated={ok:true,checks:['unknownScalar','repeatedEdges','cyclicTraversal'].map(n=>n)};
  // Returned context is copied; mutate one result and confirm the caller object is unchanged.
  const isolationInput=structuredClone(fixture.source),first=selectCoreElements(isolationInput,{references:'none'});first.source.modules[0].id='changed';first.selection[0].element.name='changed';
  hostCases['returned-copy-isolation']={ok:isolationInput.modules[0].id==='sales'&&fixture.source.modules[0].id==='sales'&&first.source.modules[0].id==='changed'};
  hostCases.controls={publicArity:selectCoreElements.length,publicControlParameters:false,reason:'The synchronous reference signature is (source, query, registry?) and exposes no cancellation/deadline/work control.'};
  outcomes.hostCases=hostCases;
  const validator=new Ajv2020({allErrors:true,strict:false,validateFormats:false});
  const coreSchema=JSON.parse(await readFile(resolve(root,'spec/core/schema.json'),'utf8'));
  validator.addSchema(JSON.parse(await readFile(resolve(root,'spec/core/semantic-type-reference.schema.json'),'utf8')));
  const selectionSchema=JSON.parse(await readFile(resolve(root,'spec/core/element-selection.schema.json'),'utf8'));
  validator.addSchema(coreSchema);const validSelection=validator.compile(selectionSchema);
  const schemaChecks=Object.entries(frozen.cases).map(([name,expected])=>({name,valid:validSelection(expected),errors:validSelection.errors??[]}));
  outcomes.selectionSchemaChecks=schemaChecks;
  outcomes.referenceSignatures={selectCoreElementsArity:selectCoreElements.length,registryFactory:typeof createUmfRegistry};
  outcomes.predecessorPins={inputSha256:sha256(await readFile(inputPath)),frozenTypescriptSha256:sha256(await readFile(resolve(root,'scripts/rust-migration/r5/selection/frozen-typescript.json'))),frozenRefusalsSha256:sha256(await readFile(resolve(root,'scripts/rust-migration/r5/selection/frozen-refusals.json')))};
  return outcomes;
}

if(import.meta.main){
  const api=await import(pathToFileURL(resolve(root,'dist/umf.js')).href);
  const report=await runSelectionReferenceBaseline(api);
  const host=process.env.UMF_BASELINE_HOST??'node';
  report.profile='umf.r8.selection-reference-host-baseline/1';report.host=host;report.runtime={node:process.version,bun:process.versions.bun??null};
  const out=resolve(root,`docs/helix/04-build/evidence/rust-migration/r8-selection-reference-host-baseline/${host}.json`);
  if(report.frozenComparisons.some(x=>!x.equal)||report.selectionSchemaChecks.some(x=>!x.valid))throw Error('Frozen predecessor or output schema mismatch: '+JSON.stringify({comparisons:report.frozenComparisons,schema:report.selectionSchemaChecks}));
  if(report['host:query-before-registry'].events.length!==0||report.hostCases.accessor.getterCalls!==0||!report['callback:registry-thrown-identity'].thrownIdentity)throw Error('Raw host admission or Registry callback identity changed');
  await mkdir(dirname(out),{recursive:true});await writeFile(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({host,out,caseCount:Object.keys(report).length,frozenCompared:report.frozenComparisons.length,schemaChecked:report.selectionSchemaChecks.length,sourceBeforeQuery:report['host:source-before-query'].events,queryBeforeRegistry:report['host:query-before-registry'].events},null,2));
}
