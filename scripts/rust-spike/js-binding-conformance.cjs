// SPDX-License-Identifier: MIT OR Apache-2.0
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {performance} = require('node:perf_hooks');

const bindingPath = process.argv[2];
const vectorsPath = process.argv[3];
if (!bindingPath || !vectorsPath) throw new Error('Usage: node|bun js-binding-conformance.cjs ADDON_OR_PACKAGE VECTORS.json');
const binding = require(path.resolve(bindingPath));
const payload = JSON.parse(fs.readFileSync(vectorsPath, 'utf8'));
const normalize = value => value && typeof value === 'object'
  ? Array.isArray(value) ? value.map(normalize)
    : Object.fromEntries(Object.keys(value).sort().map(key => [key, normalize(value[key])]))
  : value;
const equal = (left, right) => JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
const call = request => JSON.parse(binding.run(JSON.stringify(request)));
const results = [];
let generationIndex = 0;

for (const [index, request] of payload.requests.entries()) {
  const actual = call(request);
  if (request.op === 'source-roundtrip') {
    if (actual.ok !== true || !equal(actual.sourceUnits, request.sourceUnits)) throw new Error(`source code-unit mismatch at case ${index}`);
  } else if (request.op === 'validate-record') {
    if(request.expectedCode) {
      if(actual.code!==request.expectedCode||actual.complete!==false) throw new Error(`semantic operation accepted invalid UTF-16 source at case ${index}: ${JSON.stringify(actual)}`);
      results.push({index,op:request.op,ok:actual.ok,code:actual.code});
      continue;
    }
    if (actual.code === 'DUPLICATE_JSON_KEY') {
      if (actual.complete !== false) throw new Error('duplicate-key source was treated as complete');
      results.push({index, op: request.op, ok: actual.ok, code: actual.code});
      continue;
    }
    const valid = request.model.umf === '0.10.0' ? payload.expected.validation.valid : payload.expected.unsupportedValidation.valid;
    if (actual.tsComparable?.valid !== valid || actual.valid !== valid) throw new Error(`current TypeScript model validity mismatch at case ${index}: ${JSON.stringify(actual)}`);
    if (valid && (actual.complete !== false || !actual.diagnostics?.some(d => /INCOMPLETE/.test(d.code)))) throw new Error(`structural validator overstated completeness at case ${index}`);
    if (valid && !equal(actual.retainedModel, request.model)) throw new Error(`unknown model extension changed at case ${index}`);
  } else {
    const expectedGeneration = payload.expected.generationCases[generationIndex++];
    if (expectedGeneration.caseName === 'unknown-record-extension') {
      if (actual.code !== 'UNSUPPORTED_RECORD' || actual.complete !== false) throw new Error(`generator did not refuse unknown selected Record extensions: ${JSON.stringify(actual)}`);
      results.push({index, op: request.op, ok: actual.ok, code: actual.code});
      continue;
    }
    if (expectedGeneration.caseName.startsWith('conservative-field-name-') || expectedGeneration.caseName.startsWith('conservative-record-name-')) {
      if (actual.code !== 'UNSUPPORTED_RECORD' || actual.complete !== false) throw new Error(`Rust did not conservatively refuse ${expectedGeneration.caseName}: ${JSON.stringify(actual)}`);
      results.push({index, op:request.op, ok:actual.ok, code:actual.code, tsAccepted:expectedGeneration.accepted, qualification:'conservative refusal outside exact TypeScript normalization subset'});
      continue;
    }
    if (expectedGeneration.accepted) {
      if (actual.ok !== true) throw new Error(`Rust refused TypeScript-accepted generation case ${expectedGeneration.caseName}: ${JSON.stringify(actual)}`);
      if (actual.pythonSource !== expectedGeneration.pythonSource || actual.sourceDigest !== expectedGeneration.sourceDigest) throw new Error(`generated class differs from current TypeScript output for ${expectedGeneration.caseName}`);
    } else {
      if (actual.ok !== false || actual.complete !== false) throw new Error(`Rust accepted TypeScript-refused generation case ${expectedGeneration.caseName}: ${JSON.stringify(actual)}`);
      results.push({index, op:request.op, ok:actual.ok, code:actual.code, tsError:expectedGeneration.errorCode});
      continue;
    }
    if (actual.complete !== false) throw new Error('single generated class claimed package completeness');
  }
  results.push({index, op: request.op, ok: actual.ok, code: actual.code});
}

const codeUnits = text => Array.from({length: text.length}, (_, index) => text.charCodeAt(index));
const callback = payload.callbackRequest;
const received = [];
const callbackResult = JSON.parse(binding.run_with_validator(JSON.stringify(callback), source => received.push(codeUnits(source))));
if (!equal(received, [callback.sourceUnits]) || callbackResult.complete === true) throw new Error('original callback code units changed');

const validationCallback = payload.validationCallbackRequest;
const validationReceived = [];
const validationResult = JSON.parse(binding.run_with_validator(JSON.stringify(validationCallback), source => validationReceived.push(codeUnits(source))));
if (!equal(validationReceived, [validationCallback.sourceUnits]) || validationResult.valid !== true || validationResult.complete !== false) {
  throw new Error(`trusted callback did not run through actual structural validation: ${JSON.stringify(validationResult)}`);
}

let threw = false;
try {
  const callbackError = JSON.parse(binding.run_with_validator(JSON.stringify(payload.throwingCallbackRequest), () => { throw new Error('R1 callback sentinel'); }));
  threw = callbackError.code === 'CALLBACK_ERROR' && callbackError.complete === false;
} catch (error) {
  threw = error instanceof Error && error.message === 'R1 callback sentinel';
}
if (!threw) throw new Error('callback exception was swallowed or returned complete success');

const reentrantSource = validationCallback.sourceUnits;
const nestedSources = [];
const reentrant = JSON.parse(binding.run_with_validator(JSON.stringify(validationCallback), source => {
  nestedSources.push(codeUnits(source));
  const nested = call({op:'source-roundtrip',sourceUnits:codeUnits('nested')});
  if (!equal(nested.sourceUnits, codeUnits('nested'))) throw new Error('nested binding call changed units');
}));
if (!equal(nestedSources, [reentrantSource]) || reentrant.valid !== true || reentrant.complete !== false) throw new Error('callback reentrancy failed');

let cancellationPolls = 0;
const hostCancelled = JSON.parse(binding.run_with_control(JSON.stringify({
  op:'validate-record',model:JSON.parse(payload.modelText),sourceUnits:codeUnits(payload.modelText),
  record:{identity:{module:'m',element:'Item'},values:[]},
}), () => ++cancellationPolls >= 3));
if (hostCancelled.code !== 'CANCELLED' || hostCancelled.complete !== false || cancellationPolls !== 3) {
  throw new Error(`host cancellation was not polled during bounded Rust work: ${JSON.stringify(hostCancelled)}, polls=${cancellationPolls}`);
}

const cancelled = call({op:'validate-record',model:JSON.parse(payload.modelText),sourceUnits:codeUnits(payload.modelText),record:{identity:{module:'m',element:'Item'},values:[]},options:{cancelAtStep:2}});
if (cancelled.code !== 'CANCELLED' || cancelled.complete === true) throw new Error(`mid-work cancellation failed: ${JSON.stringify(cancelled)}`);
const capacity = call({op:'source-roundtrip',sourceUnits:[1,2,3,4],options:{capacity:3}});
if (capacity.code !== 'CAPACITY') throw new Error(`capacity limit failed: ${JSON.stringify(capacity)}`);
const stepBudget = call({op:'validate-record',model:JSON.parse(payload.modelText),sourceUnits:codeUnits(payload.modelText),record:{identity:{module:'m',element:'Item'},values:[]},options:{maxSteps:1}});
if (stepBudget.code !== 'CAPACITY' || stepBudget.complete === true) throw new Error(`mid-work step budget failed: ${JSON.stringify(stepBudget)}`);
const deadline = call({op:'source-roundtrip',sourceUnits:[65],options:{deadlineUnixMs:0}});
if (deadline.code !== 'DEADLINE' || deadline.complete === true) throw new Error(`expired deadline failed: ${JSON.stringify(deadline)}`);

const timedRequest = JSON.stringify({op:'source-roundtrip',sourceUnits:[65,66,67]});
const measureCount = 10000;
const started = performance.now();
for (let index = 0; index < measureCount; index++) binding.run(timedRequest);
const elapsedMs = performance.now() - started;
const coldProbe = `const binding=require(${JSON.stringify(path.resolve(bindingPath))});binding.run(${JSON.stringify(timedRequest)});`;
const coldStartMs = [];
for (let sample = 0; sample < 10; sample++) {
  const coldStarted = performance.now();
  const child = spawnSync(process.execPath, ['-e', coldProbe], {encoding:'utf8',env:{...process.env,PATH:'/usr/bin:/bin'}});
  coldStartMs.push(performance.now() - coldStarted);
  if (child.status !== 0) throw new Error(`fresh ${typeof Bun === 'undefined' ? 'Node' : 'Bun'} process failed to load the installed package: ${child.stderr}`);
}
coldStartMs.sort((a,b)=>a-b);
console.log(JSON.stringify({status:'pass',runtime:process.version,napi:process.versions.napi ?? null,nodeModuleAbi:process.versions.modules ?? null,
  runtimeName:typeof Bun === 'undefined' ? 'Node' : 'Bun',runtimeVersion:typeof Bun === 'undefined' ? process.version : Bun.version,
  platform:process.platform,arch:process.arch,binding:require.resolve(bindingPath),cases:results,
  callbacks:{rawSource:{expectedUnits:callback.sourceUnits,receivedUnits:received[0],exact:equal(received,[callback.sourceUnits])},
    validationSource:{unitCount:validationCallback.sourceUnits.length,exact:equal(validationReceived,[validationCallback.sourceUnits])},
    reentrantValidation:{unitCount:reentrantSource.length,exact:equal(nestedSources,[reentrantSource])}},
  measurement:{operation:'source-roundtrip',calls:measureCount,elapsedMs,meanMicroseconds:elapsedMs*1000/measureCount,callsPerSecond:measureCount*1000/elapsedMs,
  processRssBytes:process.memoryUsage().rss,
  coldProcessSamples:coldStartMs.length,coldImportAndOneCallMedianMs:coldStartMs[4],coldImportAndOneCallMinMs:coldStartMs[0],coldImportAndOneCallMaxMs:coldStartMs.at(-1),
  note:'Throughput includes JS JSON encoding/decoding, runtime process memory, and native engine work; cold start includes fresh runtime, native addon load, and one call. Not an isolated FFI-only estimate.'}}, null, 2));
