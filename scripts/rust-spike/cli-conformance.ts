// SPDX-License-Identifier: MIT OR Apache-2.0
import {resolve} from 'node:path';
import {performance} from 'node:perf_hooks';
import {currentTypeScriptOutcomes, modelText, recordInput, requests} from '../../tests/rust-spike/vectors';

const executable = resolve(process.argv[2] ?? 'target/debug/umf-rust-spike');
const canonical = (value: any): string => JSON.stringify(value && typeof value === 'object'
  ? Array.isArray(value) ? value.map(item => JSON.parse(canonical(item)))
    : Object.fromEntries(Object.keys(value).sort().map(key => [key, JSON.parse(canonical(value[key]))]))
  : value);
const cases = [
  ...requests(),
  {op:'source-roundtrip',sourceUnits:[1,2,3,4],options:{capacity:3}},
  {op:'validate-record',model:JSON.parse(modelText),sourceUnits:requests().find(request=>request.op==='validate-record')!.sourceUnits,record:recordInput,options:{cancelAtStep:2}},
  {op:'source-roundtrip',sourceUnits:[65],validatorRequired:true},
  {op:'source-roundtrip',sourceUnits:[65],options:{deadlineUnixMs:0}},
];
const child = Bun.spawnSync([executable], {
  cwd: process.cwd(),
  env: {PATH:'', LC_ALL:'C', TZ:'UTC'},
  stdin: new Blob([cases.map(value => JSON.stringify(value)).join('\n') + '\n']),
  stdout:'pipe', stderr:'pipe',
});
if (child.exitCode !== 0) throw new Error(`native CLI exit ${child.exitCode}: ${child.stderr.toString()}`);
const actuals = child.stdout.toString().trim().split('\n').map(line => JSON.parse(line));
if (actuals.length !== cases.length) throw new Error(`native CLI returned ${actuals.length} lines for ${cases.length} requests`);
const expected = currentTypeScriptOutcomes();
const results = [];
let generationIndex = 0;
for (const [index, [request, actual]] of cases.map((request, index) => [request, actuals[index]] as const).entries()) {
  if (request.op === 'source-roundtrip') {
    if (request.validatorRequired) {
      if (actual.code !== 'CAPABILITY_REQUIRED' || actual.complete === true) throw new Error(`CLI silently skipped trusted callback: ${JSON.stringify(actual)}`);
    } else if (request.options?.deadlineUnixMs !== undefined) {
      if (actual.code !== 'DEADLINE' || actual.complete === true) throw new Error(`CLI expired deadline was not refused: ${JSON.stringify(actual)}`);
    } else if (request.options?.capacity) {
      if (actual.code !== 'CAPACITY') throw new Error(`CLI capacity boundary failed: ${JSON.stringify(actual)}`);
    } else if (JSON.stringify(actual.sourceUnits) !== JSON.stringify(request.sourceUnits) || actual.ok !== true) {
      throw new Error(`CLI source code units changed in case ${index}`);
    }
  } else if (request.op === 'validate-record') {
    if(request.expectedCode) {
      if(actual.code!==request.expectedCode||actual.complete!==false) throw new Error(`CLI semantic operation accepted invalid UTF-16 source: ${JSON.stringify(actual)}`);
      results.push({index,op:request.op,ok:actual.ok,code:actual.code});
      continue;
    }
    if (request.options?.cancelAtStep) {
      if (actual.code !== 'CANCELLED' || actual.complete === true) throw new Error(`CLI mid-work cancellation did not refuse: ${JSON.stringify(actual)}`);
    } else if (actual.code === 'DUPLICATE_JSON_KEY') {
      if (actual.complete !== false) throw new Error('CLI treated duplicate-key source as complete');
    } else {
      const valid = request.model.umf === '0.10.0' ? expected.validation.valid : expected.unsupportedValidation.valid;
      if (actual.tsComparable?.valid !== valid || actual.valid !== valid) throw new Error(`CLI structural validity differs from current TypeScript in case ${index}: ${JSON.stringify(actual)}`);
      if (valid && (actual.complete !== false || !actual.diagnostics?.some((d: any) => /INCOMPLETE/.test(d.code)))) throw new Error('CLI overstated structural completeness');
      if (valid && canonical(actual.retainedModel) !== canonical(request.model)) throw new Error('CLI lost unknown extension content');
    }
  } else {
    const expectedGeneration = expected.generationCases[generationIndex++];
    if (expectedGeneration.caseName === 'unknown-record-extension') {
      if (actual.code !== 'UNSUPPORTED_RECORD' || actual.complete !== false) throw new Error(`CLI generator did not refuse unknown selected Record extensions: ${JSON.stringify(actual)}`);
      results.push({index,op:request.op,ok:actual.ok,code:actual.code});
      continue;
    }
    if (expectedGeneration.caseName.startsWith('conservative-field-name-') || expectedGeneration.caseName.startsWith('conservative-record-name-')) {
      if (actual.code !== 'UNSUPPORTED_RECORD' || actual.complete !== false) throw new Error(`CLI did not conservatively refuse ${expectedGeneration.caseName}: ${JSON.stringify(actual)}`);
      results.push({index,op:request.op,ok:actual.ok,code:actual.code,tsAccepted:expectedGeneration.accepted,qualification:'conservative refusal outside exact TypeScript normalization subset'});
      continue;
    }
    if (expectedGeneration.accepted) {
      if (actual.ok !== true) throw new Error(`CLI refused TypeScript-accepted generation case ${expectedGeneration.caseName}: ${JSON.stringify(actual)}`);
      if (actual.pythonSource !== expectedGeneration.pythonSource || actual.sourceDigest !== expectedGeneration.sourceDigest) throw new Error(`CLI generated class differs from current TypeScript for ${expectedGeneration.caseName}`);
    } else {
      if (actual.ok !== false || actual.complete !== false) throw new Error(`CLI accepted TypeScript-refused generation case ${expectedGeneration.caseName}: ${JSON.stringify(actual)}`);
      results.push({index,op:request.op,ok:actual.ok,code:actual.code,tsError:expectedGeneration.errorCode});
      continue;
    }
    if (actual.complete !== false) throw new Error('CLI single class generation claimed complete package support');
  }
  results.push({index,op:request.op,ok:actual.ok,code:actual.code});
}

const oneRequest = JSON.stringify({op:'source-roundtrip',sourceUnits:[65,66,67]}) + '\n';
const coldLaunchMs = [];
for (let sample = 0; sample < 10; sample++) {
  const start = performance.now();
  const processResult = Bun.spawnSync([executable], {cwd:process.cwd(),env:{PATH:''},stdin:new Blob([oneRequest]),stdout:'pipe',stderr:'pipe'});
  coldLaunchMs.push(performance.now() - start);
  if (processResult.exitCode !== 0 || !processResult.stdout.toString().includes('"sourceUnits"')) throw new Error('CLI cold-launch probe failed');
}
const bulkCount = 10000;
const bulkRequests = oneRequest.repeat(bulkCount);
const bulkStarted = performance.now();
const bulk = Bun.spawnSync([executable], {cwd:process.cwd(),env:{PATH:''},stdin:new Blob([bulkRequests]),stdout:'pipe',stderr:'pipe'});
const bulkElapsedMs = performance.now() - bulkStarted;
if (bulk.exitCode !== 0 || bulk.stdout.toString().trim().split('\n').length !== bulkCount) throw new Error('CLI bulk throughput probe failed');
const sortedCold = [...coldLaunchMs].sort((a,b)=>a-b);
console.log(JSON.stringify({status:'pass',executable,cases:results,childPath:'(empty)',measurement:{
  operation:'source-roundtrip',coldProcessLaunchSamples:10,coldLaunchMedianMs:sortedCold[4],coldLaunchMinMs:sortedCold[0],coldLaunchMaxMs:sortedCold.at(-1),
  bulkRequests:bulkCount,bulkElapsedMs,callsPerSecond:bulkCount*1000/bulkElapsedMs,
  note:'Cold launch includes Bun spawn plus fresh CLI process and one JSONL request; bulk rate includes one process startup, JSONL I/O, and Rust JSON parse/serialize. Not isolated engine or FFI cost.'
}},null,2));
