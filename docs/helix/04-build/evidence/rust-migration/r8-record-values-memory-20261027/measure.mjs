// One fresh process per scenario/repeat. This only observes installed-package behavior.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

if (!process.env.UMF_MEMORY_INSTALLED_PACKAGE) throw new Error('UMF_MEMORY_INSTALLED_PACKAGE is required');
const installed = resolve(process.env.UMF_MEMORY_INSTALLED_PACKAGE);
const require = createRequire(resolve(installed, 'dist/umf-node.js'));
const addon = require('./umf_core_node.node');
const dispatchName = 'executeValidateCoreRecordValuesHostJson';
assert.equal(typeof addon[dispatchName], 'function', 'installed native operation must exist');
let dispatches = 0;
const nativeDispatch = addon[dispatchName];
addon[dispatchName] = function (...args) {
  dispatches++;
  return nativeDispatch.apply(this, args);
};

const { source: baseSource, identity, values } = JSON.parse(await readFile(process.env.UMF_MEMORY_FIXTURE, 'utf8')).fixture;
const scenario = process.env.UMF_MEMORY_SCENARIO;
const repeat = Number(process.env.UMF_MEMORY_REPEAT);
assert.equal(process.platform, 'darwin', 'this archive and resourceUsage unit profile is Darwin-only');
const count = 100001;
const opaqueUnits = 700000;
const source = scenario === 'retained-700k'
  ? { ...baseSource, 'x-future-assertion': { opaque: 'x'.repeat(opaqueUnits) } }
  : baseSource;
const input = scenario === 'refusal-100001' ? new Array(count).fill(null) : values;
assert.ok(['retained-700k', 'refusal-100001'].includes(scenario), `unknown scenario ${scenario}`);

// Warm the exact installed route; the full scenario input already exists before baseline capture.
const warm = api => api.validateCoreRecordValues(baseSource, identity, values);
const api = await import('@umf/core');
assert.equal(typeof api.validateCoreRecordValues, 'function');
warm(api);
const memory = () => process.memoryUsage();
const highWater = () => {
  const usage = process.resourceUsage?.();
  return usage && Number.isFinite(usage.maxRSS) ? usage.maxRSS : null;
};
const baselineMemory = memory();
const baselineHighWater = highWater();
const beforeDispatches = dispatches;
let outcome;
try {
  const result = api.validateCoreRecordValues(source, identity, input);
  outcome = { ok: true };
  if (scenario === 'retained-700k') {
    assert.equal(result.source['x-future-assertion'].opaque.length, opaqueUnits);
    outcome.retainedLength = result.source['x-future-assertion'].opaque.length;
  } else {
    throw new Error('100001-value control unexpectedly succeeded');
  }
} catch (error) {
  if (scenario !== 'refusal-100001') throw error;
  assert.equal(error.code, 'LIMIT');
  assert.equal(error.path, '/99999');
  outcome = { ok: false, code: error.code, path: error.path };
}
assert.equal(dispatches - beforeDispatches, 1, 'one native dispatch expected for the measured call');
const afterMemory = memory();
const afterHighWater = highWater();
// Node/Bun report resourceUsage.maxRSS in KiB on the measured Darwin runtimes.
const maxRssUnit = 'kilobytes';
console.log(JSON.stringify({
  status: 'pass', runtime: typeof Bun === 'undefined' ? process.version : `Bun ${Bun.version}`,
  platform: process.platform, arch: process.arch, scenario, repeat,
  operation: 'validateCoreRecordValues', operationVersion: '2.0.0', packageVersion: '0.5.6',
  input: scenario === 'retained-700k' ? { retainedOpaqueUnits: opaqueUnits } : { valueCount: count },
  outcome, nativeDispatches: dispatches - beforeDispatches,
  memory: {
    units: { rss: 'bytes', heapUsed: 'bytes', heapTotal: 'bytes', resourceUsageMaxRSSKilobytes: maxRssUnit },
    warmBaseline: { rssBytes: baselineMemory.rss, heapUsedBytes: baselineMemory.heapUsed, heapTotalBytes: baselineMemory.heapTotal, resourceUsageMaxRSS: baselineHighWater },
    afterOperation: { rssBytes: afterMemory.rss, heapUsedBytes: afterMemory.heapUsed, heapTotalBytes: afterMemory.heapTotal, resourceUsageMaxRSS: afterHighWater },
    delta: {
      rssBytes: afterMemory.rss - baselineMemory.rss,
      heapUsedBytes: afterMemory.heapUsed - baselineMemory.heapUsed,
      resourceUsageMaxRSSKilobytes: baselineHighWater === null || afterHighWater === null ? null : afterHighWater - baselineHighWater,
    },
    note: 'resourceUsageMaxRSS is process high-water, not an operation-isolated ceiling; heap fields are synchronous before/after observations.',
  },
}));
