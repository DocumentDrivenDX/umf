// SPDX-License-Identifier: MIT OR Apache-2.0
// This source is embedded verbatim into the installed Node/Bun/Chromium probe.
export const coreFacetResourceCaseIds = Object.freeze([
  'inspect-unknown-array-limit','declare-unknown-array-limit','inspect-nesting-limit','declare-nesting-limit',
  'historical-nesting-limit-before-schema','inspect-near-value-limit-many-qualifiers','declare-near-value-limit-many-qualifiers',
  'inspect-warning-path-amplification','declare-result-copy-limit',
  'malformed-receipt-before-large-current','forged-receipt-before-large-current','valid-receipt-large-current-limit',
  'large-unknown-scalar-over-text-limit','text-writer-over-text-limit-control',
]);
export function expectedCoreFacetResourceRustOperations(id) {
 const exact = {
  'inspect-unknown-array-limit':[],
  'declare-unknown-array-limit':['admitCoreFacetRequest'],
  'inspect-nesting-limit':[],
  'declare-nesting-limit':['admitCoreFacetRequest'],
  'historical-nesting-limit-before-schema':[],
  'inspect-near-value-limit-many-qualifiers':['inspectCoreFacets'],
  'declare-near-value-limit-many-qualifiers':['admitCoreFacetRequest','declareCoreFacets'],
  'inspect-warning-path-amplification':['inspectCoreFacets'],
  'declare-result-copy-limit':['admitCoreFacetRequest','declareCoreFacets'],
  'malformed-receipt-before-large-current':['prepareCoreFacetVerification'],
  'forged-receipt-before-large-current':['prepareCoreFacetVerification'],
  'valid-receipt-large-current-limit':['prepareCoreFacetVerification'],
  'large-unknown-scalar-over-text-limit':['inspectCoreFacets'],
  // writeJsonValue is the public TypeScript serializer control, not a Rust Facets call.
  'text-writer-over-text-limit-control':[],
 };
 if (!Object.hasOwn(exact,id)) throw new Error(`unknown Core Facets resource case: ${id}`);
 return exact[id];
}
export function createCoreFacetBrowserAssert(canonical = value => JSON.stringify(value)) {
 const assert = (condition,message='browser assertion failed') => { if (!condition) throw new Error(message); };
 assert.equal = (actual,expected,message='browser equality assertion failed') => {
  if (actual !== expected) throw new Error(message);
 };
 assert.deepEqual = (actual,expected,message='browser deep equality assertion failed') => {
  if (canonical(actual) !== canonical(expected)) throw new Error(message);
 };
 assert.match = (actual,pattern,message='browser match assertion failed') => {
  if (typeof actual !== 'string' || !pattern.test(actual)) throw new Error(message);
 };
 assert.ok = (condition,message='browser assertion failed') => { if (!condition) throw new Error(message); };
 return assert;
}

export function coreFacetOutcomeShape(value) {
 const active = new Set();
 const walk = item => {
  if (item === null) return ['null'];
  const type = typeof item;
  if (type === 'string' || type === 'boolean') return [type, item];
  if (type === 'number') return ['number', Number.isNaN(item) ? 'NaN' : item === Infinity ? '+Infinity' : item === -Infinity ? '-Infinity' : Object.is(item, -0) ? '-0' : String(item)];
  if (type !== 'object') throw new TypeError(`non-JSON outcome value: ${type}`);
  if (active.has(item)) throw new TypeError('cyclic outcome is unsupported');
  active.add(item);
  try {
   const proto = Object.getPrototypeOf(item), isArray = Array.isArray(item);
   const kind = isArray ? (proto === Array.prototype ? 'array' : 'custom-array') : proto === null ? 'null-object' : proto === Object.prototype ? 'object' : 'custom-object';
   if (kind === 'custom-object') throw new TypeError('custom outcome prototype is unsupported');
   if (kind === 'custom-array') throw new TypeError('custom array prototype is unsupported');
   const keys = Reflect.ownKeys(item);
   if (keys.some(key => typeof key !== 'string')) throw new TypeError('symbol outcome keys are unsupported');
   const entries = keys.map(key => {
    const descriptor = Object.getOwnPropertyDescriptor(item, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw new TypeError('outcome accessors are unsupported');
    return [key, Boolean(descriptor.enumerable), Boolean(descriptor.writable), Boolean(descriptor.configurable), walk(descriptor.value)];
   });
   return [kind, entries];
  } finally { active.delete(item); }
 };
 return JSON.stringify(walk(value));
}
export function assertCoreFacetOutcomeParity(actual, expected, canonical) {
 if (canonical(actual) !== canonical(expected)) throw new Error('default/reference frozen data differs');
 const actualShape = coreFacetOutcomeShape(actual), expectedShape = coreFacetOutcomeShape(expected);
 if (actualShape !== expectedShape) throw new Error('default/reference prototype/own shape differs');
 return actualShape;
}
export function assertResourceCaseExpectation(item,outcome,integrity,assert){
 const expectedStatus=item.expectedCode?'threw':'returned';
 assert.equal(outcome.status,expectedStatus,item.id+' explicit expected outcome status');
 if(expectedStatus==='threw'){
  assert.equal(outcome.code,item.expectedCode,item.id+' exact expected error code');
  if(item.expectedMessage!==undefined)assert.equal(outcome.message,item.expectedMessage,item.id+' exact expected error message');
  if(item.expectedPath!==undefined)assert.equal(outcome.path,item.expectedPath,item.id+' exact expected error path');
  return;
 }
 assert(item.expectedIntegrity&&typeof item.expectedIntegrity==='object',item.id+' success case has frozen integrity expectation');
 assert(integrity&&typeof integrity==='object',item.id+' success result exposes integrity evidence');
 assert.deepEqual(integrity,item.expectedIntegrity,item.id+' exact preserved result integrity');
}
export const resourceSuiteSource = String.raw`
const coreFacetOutcomeShape=${coreFacetOutcomeShape.toString()};
const assertCoreFacetOutcomeParity=${assertCoreFacetOutcomeParity.toString()};
const assertResourceCaseExpectation=${assertResourceCaseExpectation.toString()};
const expectedCoreFacetResourceRustOperations=${expectedCoreFacetResourceRustOperations.toString()};
const runCoreFacetResourceSuite=async(root,reference,operations,cap,normalized,assert,canonical)=>{
 const clone=value=>structuredClone(value),deepValue=depth=>{let value='leaf';for(let i=0;i<depth;i++)value={x:value};return value};
 const sourceWith=(mutate)=>{const value=clone(p.source);mutate(value);return value};
 const broad=sourceWith(value=>{value.extensions.future={items:Array(100_010).fill(null)}});
 const deepSource=sourceWith(value=>{value.extensions.future={nested:deepValue(132)}});
 const deepHistorical={future:deepValue(132)};
 const nearLimit=sourceWith(value=>{const qualifiers={};for(let i=0;i<48_000;i++)qualifiers['q'+i]=i;value.modules[0].elements[0].facets={futureGroup:qualifiers}});
 const warningAmplification=sourceWith(value=>{const qualifiers={bits:16,signed:true};for(let i=0;i<30_000;i++)qualifiers['future'+i]=i;value.modules[0].elements[0].facets={integerWidth:qualifiers}});
 const declarationCopyLimit=sourceWith(value=>{value.extensions.future={items:Array(50_000).fill(null)}});
 const malformed={operation:'wrong-facet-receipt',version:'3.0.0',source:p.source,target:p.receipt.target,identity:p.identity,request:p.request,provenance:p.receipt.provenance};
 const forged=clone(p.receipt);forged.target.id='forged';
 const hugeCurrent=sourceWith(value=>{value.extensions.future={items:Array(100_010).fill(null)}});
 const hugeScalar='u'.repeat(4_000_001);
 const scalar=sourceWith(value=>{value.extensions.future={opaque:hugeScalar}});
 const cases=[
  {id:'inspect-unknown-array-limit',operation:'inspectCoreFacets',args:()=>[broad,p.identity],expectedCode:'LIMIT',expectedPath:'/extensions/future/items/99991'},
  {id:'declare-unknown-array-limit',operation:'declareCoreFacets',args:()=>[broad,p.identity,p.request],expectedCode:'LIMIT',expectedPath:'/extensions/future/items/99991'},
  {id:'inspect-nesting-limit',operation:'inspectCoreFacets',args:()=>[deepSource,p.identity],expectedCode:'LIMIT',expectedPath:'/extensions/future/nested'+('/x'.repeat(126))},
  {id:'declare-nesting-limit',operation:'declareCoreFacets',args:()=>[deepSource,p.identity,p.request],expectedCode:'LIMIT',expectedPath:'/extensions/future/nested'+('/x'.repeat(126))},
  {id:'historical-nesting-limit-before-schema',operation:'historicalCoreFacetPatch',args:()=>[deepHistorical],expectedCode:'LIMIT',expectedPath:'/future'+('/x'.repeat(128))},
  {id:'inspect-near-value-limit-many-qualifiers',operation:'inspectCoreFacets',args:()=>[nearLimit,p.identity],expectedIntegrity:{qualifierCount:48_000,uninterpretedPaths:['/modules/0/elements/0/facets/futureGroup']},integrity:value=>value?.source?.modules?.[0]?.elements?.[0]?.facets?.futureGroup?{qualifierCount:Object.keys(value.source.modules[0].elements[0].facets.futureGroup).length,uninterpretedPaths:value.meaning.uninterpretedPaths}:null},
  {id:'declare-near-value-limit-many-qualifiers',operation:'declareCoreFacets',args:()=>[nearLimit,p.identity,p.request],expectedIntegrity:{qualifierCount:48_000,targetQualifierCount:48_000},integrity:value=>value?.source?.modules?.[0]?.elements?.[0]?.facets?.futureGroup?{qualifierCount:Object.keys(value.source.modules[0].elements[0].facets.futureGroup).length,targetQualifierCount:Object.keys(value.target.modules[0].elements[0].facets.futureGroup).length}:null},
  {id:'inspect-warning-path-amplification',operation:'inspectCoreFacets',args:()=>[warningAmplification,p.identity],expectedIntegrity:{warningPathCount:30_000,firstPath:'/modules/0/elements/0/facets/integerWidth/future0',lastPath:'/modules/0/elements/0/facets/integerWidth/future29999'},integrity:value=>value?.meaning?.uninterpretedPaths?{warningPathCount:value.meaning.uninterpretedPaths.length,firstPath:value.meaning.uninterpretedPaths[0],lastPath:value.meaning.uninterpretedPaths.at(-1)}:null},
  {id:'declare-result-copy-limit',operation:'declareCoreFacets',args:()=>[declarationCopyLimit,p.identity,p.request],expectedCode:'LIMIT',expectedPath:'/target/extensions/future/items/49965'},
  {id:'malformed-receipt-before-large-current',operation:'verifyCoreFacetDeclaration',args:()=>[malformed,hugeCurrent],expectedCode:'CORE_FACET_RECEIPT',expectedMessage:'Malformed facet declaration',expectedPath:''},
  {id:'forged-receipt-before-large-current',operation:'verifyCoreFacetDeclaration',args:()=>[forged,hugeCurrent],expectedCode:'CORE_FACET_RECEIPT',expectedMessage:'Declaration differs from retained source/request',expectedPath:''},
  {id:'valid-receipt-large-current-limit',operation:'verifyCoreFacetDeclaration',args:()=>[p.receipt,hugeCurrent],expectedCode:'LIMIT',expectedPath:'/extensions/future/items/99991'},
  {id:'large-unknown-scalar-over-text-limit',operation:'inspectCoreFacets',args:()=>[scalar,p.identity],expectedIntegrity:{retained:true,utf16Length:4_000_001},integrity:value=>value?.source?.extensions?.future?.opaque===hugeScalar?{retained:true,utf16Length:value.source.extensions.future.opaque.length}:null},
  {id:'text-writer-over-text-limit-control',operation:'writeJsonValue',args:()=>[scalar,'json'],expectedCode:'LIMIT',expectedMessage:'Serialized text exceeds limit',expectedPath:''},
 ];
 const memory=()=>{if(typeof process!=='undefined'&&typeof process.memoryUsage==='function'){const used=process.memoryUsage(),resource=process.resourceUsage?.();return {source:'process.memoryUsage + process.resourceUsage',rssBytes:used.rss,heapUsedBytes:used.heapUsed,maxRssKilobytes:Number.isFinite(resource?.maxRSS)?resource.maxRSS:null}}const bytes=globalThis.performance?.memory?.usedJSHeapSize;return {source:'performance.memory.usedJSHeapSize (JavaScript heap only; excludes WASM and process RSS)',rssBytes:null,heapUsedBytes:Number.isFinite(bytes)?bytes:null,maxRssKilobytes:null}};
 const measure=(fn)=>{const before=memory(),start=performance.now(),result=fn(),durationMs=performance.now()-start,after=memory();return {result,metrics:{durationMs,memorySource:after.source,rssBeforeBytes:before.rssBytes,rssAfterBytes:after.rssBytes,heapBeforeBytes:before.heapUsedBytes,heapAfterBytes:after.heapUsedBytes,maxRssBeforeKilobytes:before.maxRssKilobytes,maxRssAfterKilobytes:after.maxRssKilobytes}}};
 const outcomeShape=result=>{const value=normalized(result);if(value.status==='threw')return value;return {status:'returned'}};
const shapeOf=value=>coreFacetOutcomeShape(value);
 const sha256=async text=>{const digest=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('')};
 const evidence=[];
 for(const item of cases){const caseStartedAt=performance.now();
  const refArgs=item.args(),defaultArgs=item.args();globalThis.__r8ActiveCase='reference/resource/'+item.id;const referenceBefore=globalThis.__r8RustOperations?.length??0;
  const referenceRun=measure(()=>cap(()=>item.operation==='writeJsonValue'?reference.writeJsonValue(...refArgs):operations[item.operation](reference,...refArgs))),referenceOutcome=outcomeShape(referenceRun.result),referenceRustOperations=(globalThis.__r8RustOperations??[]).slice(referenceBefore);
  assert.deepEqual(referenceRustOperations,[],item.id+' reference route must not dispatch to Rust');
  const referenceIntegrity=referenceRun.result.ok&&item.integrity?item.integrity(referenceRun.result.value):null;
  assertResourceCaseExpectation(item,referenceOutcome,referenceIntegrity,assert);
  if(item.expectedCode==='LIMIT'&&!item.expectedMessage)assert.equal(referenceOutcome.message,'JSON structural limit exceeded',item.id+' structural limit message');
  globalThis.__r8ActiveCase='default/resource/'+item.id;
  const defaultBefore=globalThis.__r8RustOperations?.length??0,defaultRun=measure(()=>cap(()=>item.operation==='writeJsonValue'?root.writeJsonValue(...defaultArgs):operations[item.operation](root,...defaultArgs))),defaultOutcome=outcomeShape(defaultRun.result);
  assert.deepEqual(defaultOutcome,referenceOutcome,item.id+' default/reference outcome');
  const defaultIntegrity=defaultRun.result.ok&&item.integrity?item.integrity(defaultRun.result.value):null;
  assertResourceCaseExpectation(item,defaultOutcome,defaultIntegrity,assert);
  assert.deepEqual(defaultIntegrity,referenceIntegrity,item.id+' copied extension integrity');
  const referenceCanonical=referenceRun.result.ok?canonical(referenceRun.result.value):null,defaultCanonical=defaultRun.result.ok?canonical(defaultRun.result.value):null;
  assert.equal(defaultCanonical,referenceCanonical,item.id+' complete canonical result equality');
  const referenceResultSha256=referenceCanonical===null?null:await sha256(referenceCanonical),defaultResultSha256=defaultCanonical===null?null:await sha256(defaultCanonical);
  assert.equal(defaultResultSha256,referenceResultSha256,item.id+' complete result SHA-256');
  const referenceOwnShapeSha256=await sha256(shapeOf(normalized(referenceRun.result))),defaultOwnShapeSha256=await sha256(shapeOf(normalized(defaultRun.result)));
  assert.equal(defaultOwnShapeSha256,referenceOwnShapeSha256,item.id+' complete outcome own-shape SHA-256');
  const defaultRustOperations=(globalThis.__r8RustOperations??[]).slice(defaultBefore),expectedRustOperations=expectedCoreFacetResourceRustOperations(item.id);
  if(globalThis.__r8RustDispatchInstrumented===true&&typeof window==='undefined')assert.deepEqual(defaultRustOperations,expectedRustOperations,item.id+' exact default Rust dispatch sequence');
  assert.deepEqual(referenceRustOperations,[],item.id+' reference route must not dispatch to Rust');
  evidence.push({id:item.id,operation:item.operation,expectedReferenceOutcome:referenceOutcome,defaultOutcome,defaultTrace:[],defaultRustCalls:defaultRustOperations.length,defaultRustOperations,expectedRustOperations,referenceOutcome,referenceTrace:[],referenceRustCalls:referenceRustOperations.length,referenceRustOperations,referenceMetrics:referenceRun.metrics,defaultMetrics:defaultRun.metrics,referenceResultSha256,defaultResultSha256,referenceOwnShapeSha256,defaultOwnShapeSha256,referenceIntegrity,defaultIntegrity});globalThis.__r8Progress={phase:'resource',caseId:item.id,elapsedMs:performance.now()-caseStartedAt};
 }
 globalThis.__r8ActiveCase=null;
 return evidence;
};
`;

const resourceOutcomeProfiles = Object.freeze({
 'inspect-unknown-array-limit':{code:'LIMIT',message:'JSON structural limit exceeded',path:'/extensions/future/items/99991'},
 'declare-unknown-array-limit':{code:'LIMIT',message:'JSON structural limit exceeded',path:'/extensions/future/items/99991'},
 'inspect-nesting-limit':{code:'LIMIT',message:'JSON structural limit exceeded',path:'/extensions/future/nested'+('/x'.repeat(126))},
 'declare-nesting-limit':{code:'LIMIT',message:'JSON structural limit exceeded',path:'/extensions/future/nested'+('/x'.repeat(126))},
 'historical-nesting-limit-before-schema':{code:'LIMIT',message:'JSON structural limit exceeded',path:'/future'+('/x'.repeat(128))},
 'declare-result-copy-limit':{code:'LIMIT',message:'JSON structural limit exceeded',path:'/target/extensions/future/items/49965'},
 'malformed-receipt-before-large-current':{code:'CORE_FACET_RECEIPT',message:'Malformed facet declaration',path:''},
 'forged-receipt-before-large-current':{code:'CORE_FACET_RECEIPT',message:'Declaration differs from retained source/request',path:''},
 'valid-receipt-large-current-limit':{code:'LIMIT',message:'JSON structural limit exceeded',path:'/extensions/future/items/99991'},
 'text-writer-over-text-limit-control':{code:'LIMIT',message:'Serialized text exceeds limit',path:''},
});
const resourceIntegrityProfiles = Object.freeze({
 'inspect-near-value-limit-many-qualifiers':{qualifierCount:48_000,uninterpretedPaths:['/modules/0/elements/0/facets/futureGroup']},
 'declare-near-value-limit-many-qualifiers':{qualifierCount:48_000,targetQualifierCount:48_000},
 'inspect-warning-path-amplification':{warningPathCount:30_000,firstPath:'/modules/0/elements/0/facets/integerWidth/future0',lastPath:'/modules/0/elements/0/facets/integerWidth/future29999'},
 'large-unknown-scalar-over-text-limit':{retained:true,utf16Length:4_000_001},
});
export function validateCoreFacetResourceEvidence(evidence, assert) {
 if (!Array.isArray(evidence) || evidence.length !== coreFacetResourceCaseIds.length) throw new Error('Core Facets resource evidence must contain exactly 14 cases');
 for (let index=0;index<coreFacetResourceCaseIds.length;index++) {
  const row=evidence[index],id=coreFacetResourceCaseIds[index];
  if(row?.id!==id)throw new Error(`Core Facets resource case order/identity differs at ${id}`);
  const operations=expectedCoreFacetResourceRustOperations(id);
  assert.deepEqual(row.expectedRustOperations,operations,`${id} expected Rust dispatch profile`);
  assert.deepEqual(row.defaultRustOperations,operations,`${id} exact default Rust dispatch`);
  assert.equal(row.defaultRustCalls,operations.length,`${id} default Rust call count`);
  assert.deepEqual(row.referenceRustOperations,[],`${id} reference Rust dispatch`);
  assert.equal(row.referenceRustCalls,0,`${id} reference Rust call count`);
  assert.deepEqual(row.defaultOutcome,row.referenceOutcome,`${id} default/reference outcome parity`);
  assert.match(row.defaultOwnShapeSha256??'',/^[a-f0-9]{64}$/,`${id} default own-shape witness`);
  assert.match(row.referenceOwnShapeSha256??'',/^[a-f0-9]{64}$/,`${id} reference own-shape witness`);
  assert.equal(row.defaultOwnShapeSha256,row.referenceOwnShapeSha256,`${id} default/reference own-shape witness parity`);
  const expectedError=resourceOutcomeProfiles[id];
  if(expectedError){
   assert.deepEqual(row.defaultOutcome,{status:'threw',name:'UmfError',...expectedError},`${id} exact expected refusal`);
   assert.equal(row.defaultResultSha256,null,`${id} refusal has no result fingerprint`);
   assert.equal(row.referenceResultSha256,null,`${id} reference refusal has no result fingerprint`);
  }else{
   const integrity=resourceIntegrityProfiles[id];
   assert.deepEqual(row.defaultOutcome,{status:'returned'},`${id} required success`);
   assert.deepEqual(row.defaultIntegrity,integrity,`${id} exact preserved-result evidence`);
   assert.deepEqual(row.referenceIntegrity,integrity,`${id} predecessor preserved-result evidence`);
   assert.match(row.defaultResultSha256??'',/^[a-f0-9]{64}$/,`${id} default result fingerprint`);
   assert.match(row.referenceResultSha256??'',/^[a-f0-9]{64}$/,`${id} reference result fingerprint`);
   assert.equal(row.defaultResultSha256,row.referenceResultSha256,`${id} success fingerprints match`);
  }
 }
 return true;
}
