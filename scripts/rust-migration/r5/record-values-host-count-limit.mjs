// SPDX-License-Identifier: MIT OR Apache-2.0
// Bounded release-addon probe for the frozen 100001-value refusal vector.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createCoreRecordValuesHostInputEngine} from '../../../bindings/core/node/index.js';

const root = resolve(import.meta.dirname, '../../..');
const readJson = async path => JSON.parse(await readFile(resolve(root, path), 'utf8'));
const packet = await readJson('docs/helix/04-build/evidence/rust-migration/r5-record-values/host-admission.json');
const resources = Object.fromEntries(await Promise.all([
  ['coreSchema', 'spec/core/schema.json'],
  ['referenceSchema', 'spec/core/semantic-type-reference.schema.json'],
  ['packageSchema', 'spec/core/extension-package.schema.json'],
  ['constraints', 'spec/metamodel/generated/core-constraints.json'],
  ['domainPolicy', 'spec/metamodel/generated/domain-policy.json'],
].map(async ([key, path]) => [key, await readJson(path)])));
const api = createCoreRecordValuesHostInputEngine(resources);
const {source, identity} = packet.fixture;
const values = new Array(packet.outcomes.countLimit.inputLength).fill(null);
const start = Date.now();
let actual;
try { actual = {ok:true,value:api.validateCoreRecordValues(source,identity,values)}; }
catch (error) { actual = {ok:false,error:{name:error?.name??'Error',code:error?.code??'',message:error?.message??String(error),path:error?.path??''}}; }
assert.deepStrictEqual(actual, packet.outcomes.countLimit.outcome);
console.log(JSON.stringify({status:'passed',runtime:typeof Bun==='undefined'?'Node':'Bun',nodeVersion:process.version,bunVersion:typeof Bun==='undefined'?null:Bun.version,inputLength:values.length,elapsedMs:Date.now()-start,rssBytes:process.memoryUsage().rss,outcome:actual}));
