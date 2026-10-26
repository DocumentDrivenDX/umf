import assert from 'node:assert/strict';

const [surfaceUrl, bindingUrl] = process.argv.slice(2);
if (!surfaceUrl || !bindingUrl) throw new Error('usage: security-not-adapter-parity.mjs <source surface module URL> <Node binding module URL>');
const {securityNot, createSecurityNotRustAdapter} = await import(surfaceUrl);
const {createSecurityLogicEngine} = await import(bindingUrl);
const raw = createSecurityLogicEngine();
const guarded = createSecurityNotRustAdapter(raw);

function outcome(fn, value, trace) {
  try {
    return {kind: 'return', value: fn(value), trace};
  } catch (error) {
    return {
      kind: 'throw',
      name: error.name,
      constructor: error.constructor?.name ?? null,
      code: error.code ?? null,
      message: String(error.message),
      path: error.path ?? null,
      trace,
    };
  }
}

function input(name, trace) {
  switch (name) {
    case 'T': return 'T';
    case 'F': return 'F';
    case 'U': return 'U';
    case 'null': return null;
    case 'number': return 1;
    case 'boolean': return true;
    case 'unknown-string': return 'X';
    case 'array': return [];
    case 'object': return {};
    case 'null-prototype': return Object.create(null);
    case 'accessor': return Object.defineProperty({}, 'member', {
      enumerable: true,
      get() { trace.push('getter'); return 'T'; },
    });
    case 'proxy-ownKeys': return new Proxy({}, {
      ownKeys() { trace.push('ownKeys'); throw new Error('ownKeys trap'); },
    });
    case 'proxy-getPrototype': return new Proxy({}, {
      getPrototypeOf() { trace.push('getPrototypeOf'); throw new Error('prototype trap'); },
    });
    case 'proxy-get': return new Proxy({}, {
      get() { trace.push('get'); return 'T'; },
    });
    default: throw new Error(`unknown case: ${name}`);
  }
}

const cases = ['T', 'F', 'U', 'null', 'number', 'boolean', 'unknown-string', 'array', 'object',
  'null-prototype', 'accessor', 'proxy-ownKeys', 'proxy-getPrototype', 'proxy-get'];
const rows = cases.map(name => {
  const referenceTrace = [];
  const adapterTrace = [];
  const reference = outcome(securityNot, input(name, referenceTrace), referenceTrace);
  const rustAdapter = outcome(guarded, input(name, adapterTrace), adapterTrace);
  assert.deepEqual(rustAdapter, reference, `adapter mismatch: ${name}`);
  return {name, reference, rustAdapter};
});

const delegated = [];
const delegationProbe = createSecurityNotRustAdapter({
  securityNot(value) { delegated.push(value); return raw.securityNot(value); },
});
for (const token of ['T', 'F', 'U']) delegationProbe(token);
assert.deepEqual(delegated, ['T', 'F', 'U']);

let meterCalls = 0;
const limited = createSecurityNotRustAdapter(createSecurityLogicEngine({controls: {maxWork: 0}}));
const invalidUnderLimit = outcome(limited, {}, []);
assert.deepEqual(invalidUnderLimit, {
  kind: 'throw', name: 'UmfError', constructor: 'UmfError', code: 'SECURITY_TRUTH',
  message: 'Invalid security truth', path: '', trace: [],
});
const validUnderLimit = outcome(limited, 'T', []);
assert.equal(validUnderLimit.kind, 'throw');
assert.equal(validUnderLimit.code, 'RESOURCE_LIMIT');
const metered = createSecurityNotRustAdapter(createSecurityLogicEngine({controls: {
  meter(amount) { meterCalls += amount; },
}}));
const meterBeforeInvalid = meterCalls;
assert.throws(() => metered({}), error => error.name === 'UmfError' && error.code === 'SECURITY_TRUTH');
const invalidMeterDelta = meterCalls - meterBeforeInvalid;
assert.equal(metered('T'), 'F');
assert.ok(meterCalls > 0);
let invalidControlCalls = 0;
const invalidUnderControls = createSecurityNotRustAdapter(createSecurityLogicEngine({controls: {
  meter() { invalidControlCalls++; },
  isCancelled() { invalidControlCalls++; return true; },
  now() { invalidControlCalls++; return Number.NaN; },
  deadlineMs: 0,
}}));
assert.equal(outcome(invalidUnderControls, {}, []).code, 'SECURITY_TRUTH');
assert.equal(invalidControlCalls, 0);
const cancelled = createSecurityNotRustAdapter(createSecurityLogicEngine({controls: {
  isCancelled: () => true,
}}));
assert.equal(outcome(cancelled, 'F', []).code, 'CANCELLED');

const clock = () => performance.now();
const truth = ['T', 'F', 'U'];
const iterations = Number(process.env.SECURITY_NOT_ADAPTER_ITERATIONS ?? 100_000);
const repeats = 5;
const warmup = Math.min(iterations, 10_000);
function run(fn, count) {
  let checksum = 0;
  const started = clock();
  for (let i = 0; i < count; i++) checksum += fn(truth[i % 3]).charCodeAt(0);
  return {nsPerCall: (clock() - started) * 1e6 / count, checksum};
}
for (const fn of [securityNot, raw.securityNot, guarded]) run(fn, warmup);
const timings = {typescript: [], rust: [], guardedRust: []};
for (let repeat = 0; repeat < repeats; repeat++) {
  timings.typescript.push(run(securityNot, iterations));
  timings.rust.push(run(raw.securityNot, iterations));
  timings.guardedRust.push(run(guarded, iterations));
}
function median(rows) { return [...rows].map(x => x.nsPerCall).sort((a, b) => a - b)[Math.floor(rows.length / 2)]; }

const factoryIterations = 10_000;
const factoryRepeats = 7;
function factoryRun(factory) {
  const started = clock();
  for (let i = 0; i < factoryIterations; i++) factory();
  return (clock() - started) * 1e3 / factoryIterations;
}
const rawFactorySamples = Array.from({length: factoryRepeats}, () => factoryRun(() => createSecurityLogicEngine()));
const adapterFactorySamples = Array.from({length: factoryRepeats}, () => factoryRun(() => createSecurityNotRustAdapter(raw)));
function medianNumbers(values) { return [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]; }

const runtime = typeof Bun === 'undefined' ? process.version : `Bun ${Bun.version}`;
process.stdout.write(`${JSON.stringify({
  runtime,
  profile: 'umf.security-logic/1.0.0',
  cases: rows,
  delegation: {passed: true, rustCalls: delegated},
  controls: {
    invalidAtMaxWorkZero: invalidUnderLimit,
    validAtMaxWorkZero: validUnderLimit,
    meterAmount: meterCalls,
    invalidMeterDelta,
    invalidUnderControls: {code: 'SECURITY_TRUTH', callbacks: invalidControlCalls},
    validWhenCancelled: {code: 'CANCELLED'},
  },
  benchmark: {
    iterationsPerRoute: iterations,
    repeats,
    warmupPerRoute: warmup,
    medianNsPerCall: {
      typescript: median(timings.typescript),
      rust: median(timings.rust),
      guardedRust: median(timings.guardedRust),
    },
    factoryIterationsPerSample: factoryIterations,
    factoryRepeats,
    medianFactoryUs: {
      rustEngine: medianNumbers(rawFactorySamples),
      addAdmissionAdapter: medianNumbers(adapterFactorySamples),
    },
  },
})}\n`);
