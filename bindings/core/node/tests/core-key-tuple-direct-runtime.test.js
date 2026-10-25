// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect, setDefaultTimeout, test} from 'bun:test';
import {createRequire} from 'node:module';
import {encodeWire, fromWire} from '../src/wire.js';
import coreSchema from '../../../../spec/core/schema.json' with {type: 'json'};
import referenceSchema from '../../../../spec/core/semantic-type-reference.schema.json' with {type: 'json'};
import packageSchema from '../../../../spec/core/extension-package.schema.json' with {type: 'json'};
import constraints from '../../../../spec/metamodel/generated/core-constraints.json' with {type: 'json'};
import domainPolicy from '../../../../spec/metamodel/generated/domain-policy.json' with {type: 'json'};
import frozen from '../../../../docs/helix/04-build/evidence/rust-migration/r5-core-key-tuple/frozen-typescript.json' with {type: 'json'};

const require = createRequire(import.meta.url);
const addon = require(process.env.UMF_CORE_NODE_ADDON ?? '../umf_core_node.node');
const resources = {coreSchema, referenceSchema, packageSchema, constraints, domainPolicy};
const wire = (value, options = {}) => encodeWire(value, {maxDepth: 128, maxValues: 100_000, ...options});
const decodeEnvelope = text => {
  const envelope = JSON.parse(text);
  if (envelope.status === 'ok') return {ok: true, value: fromWire(JSON.parse(envelope.wire))};
  return {ok: false, error: {
    code: envelope.code,
    message: String.fromCharCode(...envelope.messageUnits),
    path: String.fromCharCode(...envelope.pathUnits),
  }};
};
const actualOutcome = run => {
  try { return decodeEnvelope(run()); }
  catch (error) {
    try {
      const envelope = JSON.parse(error.message);
      return {ok: false, error: {
        code: envelope.code,
        message: String.fromCharCode(...envelope.messageUnits),
        path: String.fromCharCode(...envelope.pathUnits),
      }};
    } catch { throw error; }
  }
};
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  : JSON.stringify(value);
const same = (actual, expected, _label) => expect(canonical(actual)).toBe(canonical(expected));
const runtime = () => new addon.CoreKeyTupleRuntime(wire(resources, {maxValues: 1_000_000}));
setDefaultTimeout(180_000);

test('retained direct runtime matches the frozen 87 in-profile encoder and five verification outcomes', () => {
  const direct = runtime();
  let encoderMatches = 0;
  for (const [id, item] of Object.entries(frozen.cases)) {
    const input = id === 'integer-host-number' ? structuredClone(item) : item;
    if (id === 'integer-host-number') input.values[0].integerToken = 9007199254740992;
    const profile = input.profile;
    const actual = actualOutcome(() => direct.encode(wire(input.source), wire(input.identity), wire(input.values), profile));
    if (id === 'integer-host-number') {
      same(actual, {ok: false, error: {code: 'NUMBER', message: 'Number outside the core interoperable numeric profile', path: '/0'}}, id);
    } else {
      same(actual, frozen.outcomes[id], id);
      encoderMatches++;
    }
  }
  expect(encoderMatches).toBe(87);

  let verificationMatches = 0;
  for (const [id, item] of Object.entries(frozen.verificationCases)) {
    const actual = actualOutcome(() => {
      const stage = direct.prepareVerification(wire(item.receipt));
      return stage.verifyCurrent(wire(item.current));
    });
    same(actual, frozen.verificationOutcomes[id], `verify:${id}`);
    verificationMatches++;
  }
  expect(verificationMatches).toBe(5);
});

test('direct encoding prefix observes options only after identity/source checks and consumes its stage once', () => {
  const direct = runtime();
  const item = frozen.cases['empty-string-present'];
  const stage = direct.prepareEncoding(wire(item.source), wire(item.identity), wire(item.values));
  const actual = actualOutcome(() => stage.encodeWithOptions(undefined));
  same(actual, frozen.outcomes['empty-string-present'], 'staged-encode');
  const reuse = actualOutcome(() => stage.encodeWithOptions(undefined));
  expect(reuse.ok).toBe(false);
  expect(reuse.error.code).toBe('KEY_TUPLE_STAGE');
  expect(reuse.error.message).toBe('Prepared encoding stage was already consumed');

  const invalidIdentity = actualOutcome(() => direct.prepareEncoding(wire(item.source), wire({}), wire(item.values)));
  expect(invalidIdentity.ok).toBe(false);
  expect(invalidIdentity.error.code).toBe('KEY_TUPLE_IDENTITY');
});

test('receipt stage refuses before current is observed and carries Context usage across the boundary', () => {
  const direct = runtime();
  let currentReads = 0;
  const currentValue = Object.defineProperty({}, 'umf', {
    enumerable: true,
    get() { currentReads++; return '0.10.0'; },
  });
  const receiptFirst = (receipt, current) => {
    const stage = direct.prepareVerification(wire(receipt));
    return stage.verifyCurrent(wire(current()));
  };
  expect(() => receiptFirst({}, () => Object.defineProperty({}, 'umf', {
    enumerable: true,
    get() { currentReads++; return '0.10.0'; },
  }))).toThrow();
  expect(currentReads).toBe(0);
  const validReceipt = frozen.outcomes['decimal-scale-2-short-lexical'].value;
  expect(() => receiptFirst(validReceipt, () => Object.defineProperty({}, 'umf', {
    enumerable: true,
    get() { currentReads++; throw Object.assign(new Error('current getter sentinel'), {code: 'CURRENT_GETTER'}); },
  }))).toThrow(/Accessor properties are not invoked during admission/);
  expect(currentReads).toBe(0);

  const item = frozen.cases['decimal-scale-2-short-lexical'];
  const receipt = frozen.outcomes['decimal-scale-2-short-lexical'].value;
  const receiptWire = wire(receipt);
  const currentWire = wire(item.source);
  let receiptWork = 0;
  let currentWork = 0;
  let phase = 'receipt';
  const measure = amount => { if (phase === 'receipt') receiptWork += amount; else currentWork += amount; return ''; };
  const measuredStage = direct.prepareVerification(receiptWire, measure);
  phase = 'current';
  expect(decodeEnvelope(measuredStage.verifyCurrent(currentWire, measure)).ok).toBe(true);
  expect(receiptWork).toBeGreaterThan(0);
  expect(currentWork).toBeGreaterThan(0);

  const threshold = Math.max(receiptWork, currentWork);
  expect(threshold).toBeLessThan(receiptWork + currentWork);
  let cumulative = 0;
  const combined = amount => {
    cumulative += amount;
    if (cumulative > threshold) {
      return wire({ok: false, code: 'RESOURCE_LIMIT', message: 'Host work budget exceeded'});
    }
    return '';
  };
  const limitedStage = direct.prepareVerification(receiptWire, combined);
  const cumulativeRefusal = actualOutcome(() => limitedStage.verifyCurrent(currentWire, combined));
  expect(cumulativeRefusal.ok).toBe(false);
  expect(cumulativeRefusal.error.code).toBe('RESOURCE_LIMIT');
  expect(cumulativeRefusal.error.message).toBe('Host work budget exceeded');
  expect(cumulative).toBeGreaterThan(threshold);
  const consumed = actualOutcome(() => limitedStage.verifyCurrent(currentWire, combined));
  expect(consumed.ok).toBe(false);
  expect(consumed.error.code).toBe('KEY_TUPLE_STAGE');

  let phaseForCancellation = 'receipt';
  const cancellationBridge = amount => phaseForCancellation === 'current'
    ? wire({ok: false, code: 'CANCELLED', message: 'Operation cancelled by host'})
    : '';
  const cancelledStage = direct.prepareVerification(receiptWire, cancellationBridge);
  phaseForCancellation = 'current';
  const cancelledCurrent = actualOutcome(() => cancelledStage.verifyCurrent(currentWire, cancellationBridge));
  expect(cancelledCurrent.ok).toBe(false);
  expect(cancelledCurrent.error.code).toBe('CANCELLED');
  expect(cancelledCurrent.error.message).toBe('Operation cancelled by host');

  let nextCallWork = 0;
  const nextCall = amount => { nextCallWork += amount; return ''; };
  const nextStage = direct.prepareVerification(receiptWire, nextCall);
  expect(decodeEnvelope(nextStage.verifyCurrent(currentWire, nextCall)).ok).toBe(true);
  expect(nextCallWork).toBeGreaterThan(0);
  const successReuse = actualOutcome(() => nextStage.verifyCurrent(currentWire, nextCall));
  expect(successReuse.ok).toBe(false);
  expect(successReuse.error.code).toBe('KEY_TUPLE_STAGE');

  // The legacy byte-read stage is also one logical operation: receipt
  // admission and current admission/output share the same Rust usage ledger.
  let byteReceipt = 0;
  let byteCurrent = 0;
  let bytePhase = 'receipt';
  const byteMeasure = amount => { if (bytePhase === 'receipt') byteReceipt += amount; else byteCurrent += amount; return ''; };
  const byteStage = direct.prepareByteRead(receiptWire, byteMeasure);
  bytePhase = 'current';
  expect(byteStage.readBytes(currentWire, byteMeasure).length).toBeGreaterThan(0);
  const byteThreshold = Math.max(byteReceipt, byteCurrent);
  let byteCombined = 0;
  const byteLimited = amount => {
    byteCombined += amount;
    return byteCombined > byteThreshold
      ? wire({ok: false, code: 'RESOURCE_LIMIT', message: 'Host work budget exceeded'})
      : '';
  };
  const limitedByteStage = direct.prepareByteRead(receiptWire, byteLimited);
  const byteRefusal = actualOutcome(() => limitedByteStage.readBytes(currentWire, byteLimited));
  expect(byteRefusal.ok).toBe(false);
  expect(byteRefusal.error.code).toBe('RESOURCE_LIMIT');
  expect(byteCombined).toBeGreaterThan(byteThreshold);
  const byteRetry = actualOutcome(() => limitedByteStage.readBytes(currentWire, byteLimited));
  expect(byteRetry.ok).toBe(false);
  expect(byteRetry.error.code).toBe('KEY_TUPLE_STAGE');
});

test('direct staged byte reads cross the tagged-array ceiling and retain the 4M boundary', () => {
  const direct = runtime();
  const item = frozen.cases['empty-string-present'];
  for (const [textLength, expectedBytes] of [[99_991, 100_001], [3_999_989, 4_000_000]]) {
    const encoded = decodeEnvelope(direct.encode(wire(item.source), wire(item.identity), wire([{string: 'x'.repeat(textLength)}])));
    expect(encoded.ok).toBe(true);
    const stage = direct.prepareVerification(wire(encoded.value));
    const bytes = stage.readBytes(wire(item.source));
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.byteLength).toBe(expectedBytes);
  }

  const overLimit = decodeEnvelope(direct.encode(wire(item.source), wire(item.identity), wire([{string: 'x'.repeat(3_999_990)}])));
  expect(overLimit).toEqual({ok: false, error: {code: 'LIMIT', message: 'Encoded tuple exceeds limit', path: '/values'}});
});
