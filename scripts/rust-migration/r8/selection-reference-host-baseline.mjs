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
  const invalidCallbackSource=structuredClone(validationFixture.source);invalidCallbackSource.modules[0].elements[0].id='';let invalidCallbackCalls=0;const invalidCallbackRegistry=createUmfRegistry().register({...packageValue,id:'future'},()=>{invalidCallbackCalls++;return [];});
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

  const iterationTrace=[];
  const iteratorSentinel={name:'iterator fault'};
  const observableIterable=(label,values,faultAt,trace=iterationTrace)=>{let index=0;return Object.defineProperty({},Symbol.iterator,{get(){trace.push(`${label}:iterator-get`);return function(){trace.push(`${label}:iterator-call`);return Object.defineProperty({},'next',{get(){trace.push(`${label}:next-get`);return function(){const current=index++;trace.push(`${label}:next-call:${current}`);if(faultAt===`next:${current}`)throw iteratorSentinel;if(current>=values.length)return {get done(){trace.push(`${label}:done:${current}`);return true;}};return {get done(){trace.push(`${label}:done:${current}`);return false;},get value(){trace.push(`${label}:value:${current}`);if(faultAt===`value:${current}`)throw iteratorSentinel;return values[current];}};};}});};}});};
  const iterablePackage={...packageValue,id:'future'};let iterableCalls=0;const iterableRegistry=createUmfRegistry().register(iterablePackage,(payload,context)=>{const call=iterableCalls++;const items=[{code:'ITERABLE_FIRST',path:context.path,message:'first',severity:'warning',origin:{ordinal:1,keep:true}},{code:'ITERABLE_SECOND',path:context.path,message:'second',severity:'warning',origin:{ordinal:2,keep:true}}];return observableIterable(`semantic${call}`,items);});
  const iterableOutcome=capture(()=>selectCoreElements(fixture.source,{references:'none'},iterableRegistry));outcomes['callback:iterable-diagnostics']=iterableOutcome.ok?{ok:true,calls:iterableCalls,sourceValidation:iterableOutcome.value.sourceValidation,selection:iterableOutcome.value.selection,trace:[...iterationTrace]}:iterableOutcome;
  for(const [name,value] of [['undefined',undefined],['null',null],['number',17],['plain-object',{}],['noncallable-method',{[Symbol.iterator]:0}]]){const registryForValue=createUmfRegistry().register(iterablePackage,()=>value);const result=capture(()=>selectCoreElements(fixture.source,{references:'none'},registryForValue));outcomes[`callback:spread-${name}`]=result.ok?{ok:true,sourceValidation:result.value.sourceValidation,selection:result.value.selection}:result;}
  iterationTrace.length=0;const semanticIteratorFault=createUmfRegistry().register(iterablePackage,()=>observableIterable('semantic-fault',[{code:'NEVER',path:'',message:'never',severity:'warning'}],'value:0'));let semanticIteratorIdentity=false;let semanticIteratorOutcome;try{const result=selectCoreElements(fixture.source,{references:'none'},semanticIteratorFault);semanticIteratorOutcome={sourceValidation:result.sourceValidation,selection:result.selection};}catch(error){semanticIteratorIdentity=error===iteratorSentinel;semanticIteratorOutcome=errorShape(error);}outcomes['callback:semantic-iterator-value-fault']={thrownIdentity:semanticIteratorIdentity,outcome:semanticIteratorOutcome,trace:[...iterationTrace]};
  let invalidMemberIdentity=false;let invalidMemberOutcome;const invalidMemberRegistry=createUmfRegistry().register(iterablePackage,()=>[{code:'NON_JSON_MEMBER',path:'/extensions/future',message:'invalid member',severity:'warning',unknown:1n}]);try{invalidMemberOutcome=selectCoreElements(fixture.source,{references:'none'},invalidMemberRegistry);}catch(error){invalidMemberIdentity=false;invalidMemberOutcome=errorShape(error);}outcomes['callback:non-json-diagnostic-member']={thrownIdentity:invalidMemberIdentity,outcome:invalidMemberOutcome};
  // Pin callback diagnostic severity reads against iterator completion and
  // final descriptor-copy activity, without accessor fields that copyJson rejects.
  const diagnosticTimingTrace=[];let timingCallback=0,timingDiagnostic=0;
  const timingDiagnosticValue=(index,severity,trace)=>new Proxy({code:`TIMING_${index}`,path:'/timing',message:`diag ${index}`,severity,unknown:{ordinal:index}},{
    get(target,key,receiver){if(key==='severity')trace.push(`severity:${index}`);return Reflect.get(target,key,receiver);},
    ownKeys(target){trace.push(`final-copy:ownKeys:${index}`);return Reflect.ownKeys(target);},
    getOwnPropertyDescriptor(target,key){trace.push(`final-copy:descriptor:${index}:${String(key)}`);return Reflect.getOwnPropertyDescriptor(target,key);}
  });
  const timingRegistry=createUmfRegistry().register({...packageValue,id:'future'},()=>{
    const call=timingCallback++;diagnosticTimingTrace.push(`callback:${call}`);
    return observableIterable(`timing${call}`,[timingDiagnosticValue(timingDiagnostic++, 'warning',diagnosticTimingTrace),timingDiagnosticValue(timingDiagnostic++,'warning',diagnosticTimingTrace)],undefined,diagnosticTimingTrace);
  });
  const timingOutcome=capture(()=>selectCoreElements(fixture.source,{references:'none'},timingRegistry));
  outcomes['callback:diagnostic-severity-timing']={ok:timingOutcome.ok,calls:timingCallback,trace:diagnosticTimingTrace,diagnostics:timingOutcome.ok?timingOutcome.value.sourceValidation.diagnostics.filter(d=>d.code.startsWith('TIMING_')):timingOutcome.error};
  // Emit validates each callback diagnostic immediately. After all callbacks,
  // `.some` checks severity again and short-circuits; refusal JSON reads fields.
  const shortCircuitTrace=[];let shortCallback=0,shortDiagnostic=0;
  const shortCircuitDiagnostic=(index,severity)=>new Proxy({code:`SHORT_${index}`,path:'/short',message:`diag ${index}`,severity,unknown:index},{
    get(target,key,receiver){if(key==='severity')shortCircuitTrace.push(`severity:${index}`);return Reflect.get(target,key,receiver);},
    ownKeys(target){shortCircuitTrace.push(`refusal:ownKeys:${index}`);return Reflect.ownKeys(target);},
    getOwnPropertyDescriptor(target,key){shortCircuitTrace.push(`refusal:descriptor:${index}:${String(key)}`);return Reflect.getOwnPropertyDescriptor(target,key);}
  });
  const shortCircuitRegistry=createUmfRegistry().register({...packageValue,id:'future'},()=>{
    const call=shortCallback++;shortCircuitTrace.push(`callback:${call}`);
    return observableIterable(`short${call}`,[shortCircuitDiagnostic(shortDiagnostic++,'warning'),shortCircuitDiagnostic(shortDiagnostic++,call===0?'error':'warning')],undefined,shortCircuitTrace);
  });
  const shortResult=capture(()=>selectCoreElements(fixture.source,{references:'none'},shortCircuitRegistry));
  outcomes['callback:diagnostic-severity-short-circuit']={ok:shortResult.ok,calls:shortCallback,trace:shortCircuitTrace,error:shortResult.ok?null:shortResult.error};

  // Refusal serialization must consult the live global JSON.stringify after
  // caller semantics run, rather than an intrinsic captured at module load.
  const nativeStringify=JSON.stringify,liveStringifyCalls=[];let liveStringifyCallsCount=0;
  const liveStringifyRegistry=createUmfRegistry().register({...packageValue,id:'future'},()=>{
    JSON.stringify=function(value){liveStringifyCallsCount++;if(Array.isArray(value))liveStringifyCalls.push({receiverIsJson:this===JSON,isArray:true,codes:value.map(item=>item.code)});return Reflect.apply(nativeStringify,this,[value]);};
    return [{code:'LIVE_STRINGIFY',path:'/live',message:'error',severity:'error'}];
  });
  let liveStringifyOutcome;
  try{liveStringifyOutcome=capture(()=>selectCoreElements(fixture.source,{references:'none'},liveStringifyRegistry));}
  finally{JSON.stringify=nativeStringify;}
  outcomes['callback:live-json-stringify-on-refusal']={...liveStringifyOutcome,calls:liveStringifyCallsCount,stringifyCalls:liveStringifyCalls};

  // TypeScript's static diagnostics are ordinary object literals. The live
  // Object.prototype.toJSON is therefore visible to JSON.stringify for them.
  const priorObjectToJSON=Object.getOwnPropertyDescriptor(Object.prototype,'toJSON'),objectToJSONTrace=[];
  const inheritedToJSONRegistry=createUmfRegistry().register({...packageValue,id:'future'},()=>[{code:'INHERITED_TOJSON',path:'/inherited',message:'error',severity:'error'}]);
  let inheritedToJSONOutcome;
  try{
    Object.defineProperty(Object.prototype,'toJSON',{configurable:true,writable:true,value:function(key){objectToJSONTrace.push(Array.isArray(this)?`array:${key}`:`object:${this.code}:${key}`);return this;}});
    inheritedToJSONOutcome=capture(()=>selectCoreElements(fixture.source,{references:'none'},inheritedToJSONRegistry));
  }finally{if(priorObjectToJSON)Object.defineProperty(Object.prototype,'toJSON',priorObjectToJSON);else delete Object.prototype.toJSON;}
  outcomes['callback:inherited-object-toJSON-on-refusal']={...inheritedToJSONOutcome,trace:objectToJSONTrace};

  // Pin native JSON.stringify's callback diagnostic toJSON/getter/enumeration
  // order and the identity of a getter throw in the refusal branch.
  const stringifyDiagnosticTrace=[];let stringifyPhase=false;
  const stringifyDiagnostic=new Proxy({code:'STRINGIFY_ORDER',path:'/stringify',message:'error',severity:'error',unknown:1},{
    get(target,key,receiver){if(key==='toJSON'){stringifyPhase=true;stringifyDiagnosticTrace.push('get:toJSON');}else if(stringifyPhase)stringifyDiagnosticTrace.push(`get:${String(key)}`);return Reflect.get(target,key,receiver);},
    ownKeys(target){if(stringifyPhase)stringifyDiagnosticTrace.push('ownKeys');return Reflect.ownKeys(target);},
    getOwnPropertyDescriptor(target,key){if(stringifyPhase)stringifyDiagnosticTrace.push(`descriptor:${String(key)}`);return Reflect.getOwnPropertyDescriptor(target,key);}
  });
  const stringifyOrderRegistry=createUmfRegistry().register({...packageValue,id:'future'},()=>[stringifyDiagnostic]);
  const stringifyOrderOutcome=capture(()=>selectCoreElements(fixture.source,{references:'none'},stringifyOrderRegistry));
  outcomes['callback:diagnostic-json-stringify-order']={...stringifyOrderOutcome,trace:stringifyDiagnosticTrace};

  const stringifyThrowSentinel={name:'diagnostic getter during JSON.stringify'};let stringifyThrowIdentity=false;const stringifyThrowTrace=[];let stringifyThrowPhase=false;
  const stringifyThrowDiagnostic=new Proxy({code:'STRINGIFY_THROW',path:'/stringify',message:'error',severity:'error'}, {
    get(target,key,receiver){if(key==='toJSON'){stringifyThrowPhase=true;stringifyThrowTrace.push('get:toJSON');}else if(stringifyThrowPhase)stringifyThrowTrace.push(`get:${String(key)}`);if(stringifyThrowPhase&&key==='severity')throw stringifyThrowSentinel;return Reflect.get(target,key,receiver);},
    ownKeys(target){if(stringifyThrowPhase)stringifyThrowTrace.push('ownKeys');return Reflect.ownKeys(target);},
    getOwnPropertyDescriptor(target,key){if(stringifyThrowPhase)stringifyThrowTrace.push(`descriptor:${String(key)}`);return Reflect.getOwnPropertyDescriptor(target,key);}
  });
  const stringifyThrowRegistry=createUmfRegistry().register({...packageValue,id:'future'},()=>[stringifyThrowDiagnostic]);
  try{selectCoreElements(fixture.source,{references:'none'},stringifyThrowRegistry);}catch(error){stringifyThrowIdentity=error===stringifyThrowSentinel;}
  outcomes['callback:diagnostic-json-stringify-getter-throw']={thrownIdentity:stringifyThrowIdentity,trace:stringifyThrowTrace};

  // instancePath is string-concatenated with ToPrimitive; message is read as
  // a value and must be a string for the constraint diagnostic to be valid.
  const structureCoercionTrace=[];const coercionPath={[Symbol.toPrimitive](hint){structureCoercionTrace.push(`instancePath:toPrimitive:${hint}`);return '/coerced';},toString(){structureCoercionTrace.push('instancePath:toString');return '/unused';}};
  const coercionError={get instancePath(){structureCoercionTrace.push('instancePath:get');return coercionPath;},get message(){structureCoercionTrace.push('message:get');return 'message string';}};
  const coercionStructure=()=>false;Object.defineProperty(coercionStructure,'errors',{get(){structureCoercionTrace.push('errors:get');return [coercionError];}});
  const coercionRegistry=customResult({manifest:{scopes:['document','element']},structure:coercionStructure});let coercionOutcome;
  try{selectCoreElements(fixture.source,{references:'none'},coercionRegistry.registry);}catch(error){coercionOutcome={name:error?.name??'',code:error?.code??'',message:error?.message??String(error)};}
  outcomes['registration:structure-error-coercions']={outcome:coercionOutcome,trace:structureCoercionTrace,lookupCount:coercionRegistry.calls.length};
  const structureCoercionThrow=(name,errorFactory)=>{const sentinel={name};const trace=[];const structure=()=>false;const errorRecord=errorFactory(sentinel,trace);Object.defineProperty(structure,'errors',{get(){trace.push('errors:get');return [errorRecord];}});const selected=customResult({manifest:{scopes:['document','element']},structure});let same=false,shape;try{selectCoreElements(fixture.source,{references:'none'},selected.registry);}catch(error){same=error===sentinel;shape={name:error?.name??'',code:error?.code??'',path:error?.path??'',message:error?.message??String(error)};}return {thrownIdentity:same,error:shape,trace,lookupCount:selected.calls.length};};
  outcomes['registration:structure-instancePath-getter-throws']=structureCoercionThrow('instancePath getter',(sentinel,trace)=>({get instancePath(){trace.push('instancePath:get');throw sentinel;},message:'unused'}));
  outcomes['registration:structure-instancePath-coercion-throws']=structureCoercionThrow('instancePath coercion',(sentinel,trace)=>({get instancePath(){trace.push('instancePath:get');return {[Symbol.toPrimitive](){trace.push('instancePath:toPrimitive');throw sentinel;}};},message:'unused'}));
  outcomes['registration:structure-message-getter-throws']=structureCoercionThrow('message getter',(sentinel,trace)=>({instancePath:'/p',get message(){trace.push('message:get');throw sentinel;}}));
  outcomes['registration:structure-message-object-not-coerced']=structureCoercionThrow('message object',(sentinel,trace)=>({instancePath:'/p',get message(){trace.push('message:get');return {toString(){trace.push('message:toString');throw sentinel;},toJSON(){trace.push('message:toJSON');throw sentinel;}};}}));

  const structureCloseProbe=(stage,returnBehavior='success')=>{
    const trace=[],bodySentinel={stage},returnSentinel={returnBehavior};let index=0,bodyIdentity=false,returnThrew=false;
    const errorRecord={get instancePath(){trace.push('instancePath:get');if(stage==='instancePath')throw bodySentinel;if(stage==='coercion')return {[Symbol.toPrimitive](hint){trace.push(`instancePath:toPrimitive:${hint}`);throw bodySentinel;}};return '/close';},get message(){trace.push('message:get');if(stage==='message')throw bodySentinel;return 'close probe';}};
    const errors=Object.defineProperty({},Symbol.iterator,{get(){trace.push('iterator:get');return function(){trace.push('iterator:call');return {get next(){trace.push('next:get');return function(){const current=index++;trace.push(`next:${current}`);return current===0?{get done(){trace.push('done:0');return false;},get value(){trace.push('value:0');return errorRecord;}}:{done:true};};},get return(){trace.push('return:get');return function(){trace.push('return:call');if(returnBehavior==='throw'){returnThrew=true;throw returnSentinel;}if(returnBehavior==='primitive')return 1;return {};};}};}}});
    const structure=()=>false;Object.defineProperty(structure,'errors',{get(){trace.push('errors:get');return errors;}});const selected=customResult({manifest:{scopes:['document','element']},structure});
    try{selectCoreElements(fixture.source,{references:'none'},selected.registry);}catch(error){bodyIdentity=error===bodySentinel;}
    return {bodyIdentity,returnCalled:trace.includes('return:call'),returnThrew,trace};
  };
  for(const stage of ['instancePath','coercion','message'])outcomes[`registration:structure-body-throw-closes-${stage}`]=structureCloseProbe(stage);
  outcomes['registration:structure-body-throw-return-throws']=structureCloseProbe('instancePath','throw');
  outcomes['registration:structure-body-throw-return-primitive']=structureCloseProbe('message','primitive');

  const structureIterationTrace=[];const structureIteratorSentinel={name:'structure iterator fault'};let structureFaultIdentity=false;const structureFault=()=>false;Object.defineProperty(structureFault,'errors',{get(){structureIterationTrace.push('errors:get');let at=0;return Object.defineProperty({},Symbol.iterator,{get(){structureIterationTrace.push('errors:iterator-get');return function(){structureIterationTrace.push('errors:iterator-call');return Object.defineProperty({},'next',{get(){structureIterationTrace.push('errors:next-get');return function(){const current=at++;structureIterationTrace.push(`errors:next-call:${current}`);if(current===0)throw structureIteratorSentinel;return {done:true};};}});};}});}});const structureFaultEntry={manifest:{scopes:['document','element'],capabilities:{validation:'semantic'}},structure:structureFault};
  const structureFaultRegistry=customResult(structureFaultEntry);try{selectCoreElements(fixture.source,{references:'none'},structureFaultRegistry.registry);}catch(error){structureFaultIdentity=error===structureIteratorSentinel;}outcomes['registration:structure-errors-iterator-fault']={thrownIdentity:structureFaultIdentity,trace:structureIterationTrace,lookupCount:structureFaultRegistry.calls.length};
  const structureFaultStages=['iterator-getter','next-getter','next-call','done-getter','value-getter'];for(const stage of structureFaultStages){const trace=[];const sentinel={stage};let index=0;const errors=Object.defineProperty({},Symbol.iterator,{get(){trace.push('iterator:get');if(stage==='iterator-getter')throw sentinel;return function(){trace.push('iterator:call');return Object.defineProperty({},'next',{get(){trace.push('next:get');if(stage==='next-getter')throw sentinel;return function(){trace.push('next:call');if(stage==='next-call')throw sentinel;const current=index++;return {get done(){trace.push('result:done');if(stage==='done-getter')throw sentinel;return false;},get value(){trace.push('result:value');if(stage==='value-getter')throw sentinel;return {};}};};}});};}});const structure=()=>false;Object.defineProperty(structure,'errors',{get(){trace.push('errors:get');return errors;}});const selected=customResult({manifest:{scopes:['document','element']},structure});let same=false;try{selectCoreElements(fixture.source,{references:'none'},selected.registry);}catch(error){same=error===sentinel;}outcomes[`registration:structure-errors-${stage}`]={thrownIdentity:same,trace,lookupCount:selected.calls.length};}
  const structureMaterializationTrace=[];const structureIterable=()=>false;Object.defineProperty(structureIterable,'errors',{get(){structureMaterializationTrace.push('errors:get');return observableIterable('structure-errors',[{instancePath:'/first',message:'one'},{instancePath:'/second',message:'two'}],undefined,structureMaterializationTrace);}});const structureIterableEntry={manifest:{scopes:['document','element'],capabilities:{validation:'structural'}},structure:structureIterable};const structureIterableRegistry=customResult(structureIterableEntry,structureMaterializationTrace);const structureIterableOutcome=capture(()=>selectCoreElements(fixture.source,{references:'none'},structureIterableRegistry.registry));outcomes['registration:structure-errors-iterable']={...structureIterableOutcome,trace:structureMaterializationTrace,lookupCount:structureIterableRegistry.calls.length};

  // Freeze registered(...) demand sites interleaved with document and element
  // extension payload lookups, including the method receiver and accessor order.
  const interleavedSource=structuredClone(fixture.source);
  interleavedSource.vocabularies={future:{version:'1.0.0'},alpha:{version:'2.0.0'},beta:{version:'3.0.0'}};
  interleavedSource.extensions={alpha:{at:'document-alpha'},future:{at:'document-future'}};
  interleavedSource.modules[0].elements[0].extensions={beta:{at:'element-beta'},future:{at:'element-future'}};
  const interleavedEvents=[];const interleavedEntry={
    get structure(){interleavedEvents.push('entry.structure');return function(payload){interleavedEvents.push(`structure:${payload.at}:receiver=${this===interleavedEntry}`);return true;};},
    get semantics(){interleavedEvents.push('entry.semantics');return function(payload,context){interleavedEvents.push(`semantics:${payload.at}:${context.scope}:receiver=${this===interleavedEntry}`);return [];};}
  };
  Object.defineProperty(interleavedEntry,'manifest',{configurable:true,get(){interleavedEvents.push('entry.manifest');const scopes={includes(scope){interleavedEvents.push(`scopes.includes:${scope}:receiver=${this===scopes}`);return true;}};return {get scopes(){interleavedEvents.push('manifest.scopes');return scopes;},get capabilities(){interleavedEvents.push('manifest.capabilities');return {validation:'semantic'};}};}});
  let interleavedRegistry;interleavedRegistry=new Proxy(createUmfRegistry(),{get(target,key,receiver){
    if(key==='get')return function(id,version){interleavedEvents.push(`get:${id}@${version}:receiver=${this===interleavedRegistry}`);return interleavedEntry;};
    return Reflect.get(target,key,receiver);
  }});
  const interleavedOutcome=capture(()=>selectCoreElements(interleavedSource,{references:'none'},interleavedRegistry));
  const interleavedExpected=['get:future@1.0.0:receiver=true','get:alpha@2.0.0:receiver=true','get:beta@3.0.0:receiver=true'];
  for(const [id,version,scope,payload] of [['alpha','2.0.0','document','document-alpha'],['future','1.0.0','document','document-future'],['beta','3.0.0','element','element-beta'],['future','1.0.0','element','element-future']]){
    interleavedExpected.push(`get:${id}@${version}:receiver=true`,'entry.manifest','manifest.scopes',`scopes.includes:${scope}:receiver=true`,'entry.structure',`structure:${payload}:receiver=true`,'entry.manifest','manifest.capabilities','entry.semantics','entry.semantics',`semantics:${payload}:${scope}:receiver=true`);
  }
  outcomes['registration:registered-interleaved-with-payloads']={...interleavedOutcome,events:interleavedEvents,expectedEvents:interleavedExpected,exactEvents:JSON.stringify(interleavedEvents)===JSON.stringify(interleavedExpected),registrationLookupCount:interleavedEvents.filter(event=>event.startsWith('get:')).length};

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
  const materialization=report['callback:iterable-diagnostics'],semanticIterator=report['callback:semantic-iterator-value-fault'],nonJson=report['callback:non-json-diagnostic-member'],structureFault=report['registration:structure-errors-iterator-fault'],structureIterable=report['registration:structure-errors-iterable'],undefinedSpread=report['callback:spread-undefined'],nullSpread=report['callback:spread-null'],numberSpread=report['callback:spread-number'],objectSpread=report['callback:spread-plain-object'],nonCallableSpread=report['callback:spread-noncallable-method'];
  const undefinedSpreadDetail=process.versions.bun?'Spread syntax requires ...iterable not be null or undefined':'entry.semantics(...) is not iterable (cannot read property undefined)';
  const nullSpreadDetail=process.versions.bun?'Spread syntax requires ...iterable not be null or undefined':'entry.semantics(...) is not iterable (cannot read property null)';
  if(!materialization?.ok||materialization.calls!==2||materialization.sourceValidation.diagnostics.filter(d=>d.code.startsWith('ITERABLE_')).length!==4||materialization.sourceValidation.diagnostics[0]?.origin?.ordinal!==1||materialization.sourceValidation.diagnostics[1]?.origin?.ordinal!==2||materialization.selection.length!==3||!semanticIterator.outcome?.message?.includes('VALIDATOR_FAILURE')||semanticIterator.thrownIdentity||nonJson.outcome?.code!=='NON_JSON'||!structureFault.thrownIdentity||['iterator-getter','next-getter','next-call','done-getter','value-getter'].some(stage=>!report[`registration:structure-errors-${stage}`]?.thrownIdentity)||structureIterable.error?.code!=='CORE_SELECTION_SOURCE'||!undefinedSpread.error?.message?.includes(undefinedSpreadDetail)||!nullSpread.error?.message?.includes(nullSpreadDetail)||!numberSpread.error?.message?.includes('Spread syntax requires ...iterable[Symbol.iterator] to be a function')||!objectSpread.error?.message?.includes('Spread syntax requires ...iterable[Symbol.iterator] to be a function')||!nonCallableSpread.error?.message?.includes('Spread syntax requires ...iterable[Symbol.iterator] to be a function'))throw Error('Callback result materialization or iterator behavior changed');
  const timing=report['callback:diagnostic-severity-timing'],shortCircuit=report['callback:diagnostic-severity-short-circuit'];
  const timingTrace=timing?.trace??[],shortTrace=shortCircuit?.trace??[];
  const lastTimingSeverity=timingTrace.map((x,i)=>x.startsWith('severity:')?i:-1).at(-1)??-1;
  const firstTimingCopy=timingTrace.findIndex(x=>x.startsWith('final-copy:'));
  const callbackOneDone=timingTrace.lastIndexOf('timing1:done:2');
  const finalSomeStart=timingTrace.lastIndexOf('severity:0');
  const shortCallbackOneDone=shortTrace.lastIndexOf('short1:done:2');
  const shortFinalSomeStart=shortTrace.lastIndexOf('severity:0');
  const structureCoercion=report['registration:structure-error-coercions'];
  const structureTrace=structureCoercion?.trace??[];
  const expectedStructurePrefix=['errors:get','instancePath:get','instancePath:toPrimitive:default','message:get'];
  const structureThrows=['instancePath-getter-throws','instancePath-coercion-throws','message-getter-throws'];
  if(!timing?.ok||timing.calls!==2||!timingTrace.some(x=>x==='callback:1')||callbackOneDone<0||finalSomeStart<=callbackOneDone||firstTimingCopy<=lastTimingSeverity||timingTrace.filter(x=>/^severity:\d+$/.test(x)).length!==8||!Array.isArray(timing.diagnostics)||timing.diagnostics.length!==4||shortCircuit?.ok||shortCircuit.calls!==2||shortCallbackOneDone<0||shortFinalSomeStart<=shortCallbackOneDone||shortTrace.filter(x=>x==='severity:2').length!==2||shortTrace.filter(x=>x==='severity:3').length!==2||shortTrace.filter(x=>x==='severity:0').length!==3||shortTrace.filter(x=>x==='severity:1').length!==3||structureCoercion?.outcome?.code!=='CORE_SELECTION_SOURCE'||!structureCoercion.outcome.message.includes('/extensions/future/coerced')||expectedStructurePrefix.some((x,i)=>structureTrace[i]!==x)||structureTrace.includes('instancePath:toString')||structureTrace.includes('message:toString')||structureThrows.some(name=>!report[`registration:structure-${name}`]?.thrownIdentity)||['instancePath','coercion','message'].some(stage=>{const x=report[`registration:structure-body-throw-closes-${stage}`];return !x?.bodyIdentity||!x.returnCalled||x.trace.at(-2)!=='return:get'||x.trace.at(-1)!=='return:call';})||!report['registration:structure-body-throw-return-throws']?.bodyIdentity||!report['registration:structure-body-throw-return-throws']?.returnThrew||!report['registration:structure-body-throw-return-primitive']?.bodyIdentity||!report['registration:structure-body-throw-return-primitive']?.returnCalled||report['registration:structure-message-object-not-coerced']?.error?.code!=='CONSTRAINT_DIAGNOSTIC'||report['registration:structure-message-object-not-coerced']?.trace?.includes('message:toString')||report['registration:structure-message-object-not-coerced']?.trace?.includes('message:toJSON'))throw Error('Callback diagnostic timing or structure error coercion behavior changed');
  const liveStringify=report['callback:live-json-stringify-on-refusal'],inheritedToJSON=report['callback:inherited-object-toJSON-on-refusal'],jsonStringifyOrder=report['callback:diagnostic-json-stringify-order'],jsonStringifyThrow=report['callback:diagnostic-json-stringify-getter-throw'];
  const stringifyCodes=['LIVE_STRINGIFY','LIVE_STRINGIFY','UNKNOWN_CORE_FIELD','UNKNOWN_SCALAR_TYPE'];
  const inheritedToJSONExpected=['array:','object:INHERITED_TOJSON:0','object:INHERITED_TOJSON:1','object:UNKNOWN_CORE_FIELD:2','object:UNKNOWN_SCALAR_TYPE:3'];
  const jsonOrderPrefix=['get:toJSON','ownKeys','descriptor:code','descriptor:path','descriptor:message','descriptor:severity','descriptor:unknown','get:code','get:path','get:message','get:severity','get:unknown'];
  const jsonThrowPrefix=['get:toJSON','ownKeys','descriptor:code','descriptor:path','descriptor:message','descriptor:severity','get:code','get:path','get:message','get:severity'];
  if(liveStringify?.ok||liveStringify.error?.code!=='CORE_SELECTION_SOURCE'||liveStringify.calls<1||liveStringify.stringifyCalls?.length!==1||!liveStringify.stringifyCalls[0].receiverIsJson||!liveStringify.stringifyCalls[0].isArray||JSON.stringify(liveStringify.stringifyCalls[0].codes)!==JSON.stringify(stringifyCodes)||inheritedToJSON?.ok||inheritedToJSON.error?.code!=='CORE_SELECTION_SOURCE'||JSON.stringify(inheritedToJSON.trace)!==JSON.stringify(inheritedToJSONExpected)||jsonStringifyOrder?.ok||jsonStringifyOrder.error?.code!=='CORE_SELECTION_SOURCE'||jsonOrderPrefix.some((x,i)=>jsonStringifyOrder.trace[i]!==x)||jsonStringifyOrder.trace.length!==jsonOrderPrefix.length*2||!jsonStringifyThrow.thrownIdentity||JSON.stringify(jsonStringifyThrow.trace)!==JSON.stringify(jsonThrowPrefix))throw Error('Live JSON.stringify, inherited toJSON, or diagnostic serialization order changed');
  if(report.frozenComparisons.some(x=>!x.equal)||report.selectionSchemaChecks.some(x=>!x.valid))throw Error('Frozen predecessor or output schema mismatch: '+JSON.stringify({comparisons:report.frozenComparisons,schema:report.selectionSchemaChecks}));
  if(report['host:query-before-registry'].events.length!==0||report.hostCases.accessor.getterCalls!==0||!report['callback:registry-thrown-identity'].thrownIdentity||!report['registration:registered-interleaved-with-payloads'].exactEvents)throw Error('Raw host admission, Registry callback identity, or interleaved Registry event order changed');
  await mkdir(dirname(out),{recursive:true});await writeFile(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({host,out,caseCount:Object.keys(report).length,frozenCompared:report.frozenComparisons.length,schemaChecked:report.selectionSchemaChecks.length,sourceBeforeQuery:report['host:source-before-query'].events,queryBeforeRegistry:report['host:query-before-registry'].events},null,2));
}
