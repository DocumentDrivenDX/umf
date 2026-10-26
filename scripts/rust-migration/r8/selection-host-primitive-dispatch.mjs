import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { schemaPropertiesHostInput } from '../../../bindings/core/node/src/host-json.js';

const rootDir = resolve(import.meta.dirname, '../../..');

function decode(value) {
  switch (value.kind) {
    case 'null': return null;
    case 'undefined': return undefined;
    case 'boolean': return value.value;
    case 'number': return Number.parseInt(value.bits.slice(0, 8), 16); // used only for shape checks
    case 'string': return String.fromCharCode(...value.units);
    case 'array': return value.items.map(decode);
    case 'object': return Object.fromEntries(value.members.map(member => [String.fromCharCode(...member.key), decode(member.value)]));
    default: throw new Error(`Unexpected wire kind ${value.kind}`);
  }
}

function encodeString(text) { return { kind: 'string', units: Array.from({ length: text.length }, (_, i) => text.charCodeAt(i)) }; }
function key(text) { return { kind: 'string', units: Array.from({ length: text.length }, (_, i) => text.charCodeAt(i)) }; }
function runProbe(api, assert) {
  const transportStringify = JSON.stringify;
  const okEnvelope = { profile: 'umf.core-wire/1', status: 'ok', wire: '{"kind":"null"}' };
  const decode = value => {
    switch (value.kind) {
      case 'null': return null;
      case 'undefined': return undefined;
      case 'boolean': return value.value;
      case 'number': {
        const bytes = new Uint8Array(8);
        for (let i = 0; i < 8; i++) bytes[i] = Number.parseInt(value.bits.slice(i * 2, i * 2 + 2), 16);
        return new DataView(bytes.buffer).getFloat64(0, false);
      }
      case 'string': return String.fromCharCode(...value.units);
      case 'array': return value.items.map(decode);
      case 'object': return Object.fromEntries(value.members.map(member => [String.fromCharCode(...member.key), decode(member.value)]));
      default: throw new Error(`Unexpected wire kind ${value.kind}`);
    }
  };
  const key = text => ({ kind: 'string', units: Array.from({ length: text.length }, (_, i) => text.charCodeAt(i)) });
  const encodeString = text => ({ kind: 'string', units: Array.from({ length: text.length }, (_, i) => text.charCodeAt(i)) });
  const trace = [];
  const root = {
    get get() { trace.push(['get', this === root]); return function (scope) { trace.push(['method', this === root, scope]); return function (answer) { trace.push(['callback', this === root, answer]); return true; }; }; },
    get zero() { return 0n; },
    get one() { return 1n; },
    get thrower() { return function () { const error = { toString() { trace.push(['stringify']); return 'semantic callback'; } }; throw error; }; },
    get semanticGetter() { throw { toString() { trace.push(['stringify']); return 'semantic getter'; } }; },
    get stringifyThrows() { const marker = {}; return function () { throw { toString() { throw marker; } }; }; },
    get coercionValue() { return { [Symbol.toPrimitive](hint) { trace.push(['toPrimitive', hint]); return 7n; }, valueOf() { trace.push(['valueOf']); return 8; } }; },
    get fallbackValue() { return { valueOf() { trace.push(['fallback:valueOf']); return {}; }, toString() { trace.push(['fallback:toString']); return 12; } }; },
    get symbolValue() { return { [Symbol.toPrimitive]() { return Symbol('cannot concatenate'); } }; },
    get coercionThrows() { const marker = {}; return { [Symbol.toPrimitive](hint) { trace.push(['coercionThrows', hint]); throw marker; } }; },
  };
  function addon(input, script) {
    return { executeCoreSchemaPropertiesHostJson(_resources, _operation, inputHandle, dispatch) {
      assert.equal(inputHandle, 1);
      const send = request => decode(JSON.parse(dispatch(JSON.stringify(request))));
      script(send, dispatch);
      return okEnvelope;
    } };
  }
  const input = root;
  let callbackResult;
  api.schemaPropertiesHostInput(addon(input, send => {
    const get = send({ event: 'get-opaque-property', receiver: { kind: 'opaque', handle: 1 }, key: key('get'), semanticCatch: false });
    assert.equal(get.kind, 'opaque-value');
    const getHandle = get.value.handle;
    const method = send({ event: 'invoke-opaque', function: getHandle, receiver: { kind: 'opaque', handle: 1 }, args: [{ kind: 'json', value: encodeString('registered') }], semanticCatch: false });
    const methodHandle = method.value.handle;
    callbackResult = send({ event: 'invoke-opaque', function: methodHandle, receiver: { kind: 'opaque', handle: 1 }, args: [{ kind: 'json', value: { kind: 'boolean', value: true } }], semanticCatch: false });
    assert.equal(send({ event: 'get-opaque-property', receiver: { kind: 'opaque', handle: 1 }, key: key('zero'), semanticCatch: false }).value.isZero, true);
    assert.equal(send({ event: 'get-opaque-property', receiver: { kind: 'opaque', handle: 1 }, key: key('one'), semanticCatch: false }).value.isZero, false);
    const thrown = send({ event: 'get-opaque-property', receiver: { kind: 'opaque', handle: 1 }, key: key('thrower'), semanticCatch: false });
    const semantic = send({ event: 'invoke-opaque', function: thrown.value.handle, receiver: { kind: 'opaque', handle: 1 }, args: [], semanticCatch: true });
    assert.equal(semantic.kind, 'semantic-throw');
    const messageChunk = send({ event: 'read-utf16-chunk', token: semantic.message.token, offset: 0, maxUnits: 64 });
    assert.equal(String.fromCharCode(...messageChunk.units), 'semantic callback');
    const getterThrow = send({ event: 'get-opaque-property', receiver: { kind: 'opaque', handle: 1 }, key: key('semanticGetter'), semanticCatch: true });
    assert.equal(getterThrow.kind, 'semantic-throw');
    const getterMessage = send({ event: 'read-utf16-chunk', token: getterThrow.message.token, offset: 0, maxUnits: 64 });
    assert.equal(String.fromCharCode(...getterMessage.units), 'semantic getter');
    for (const [number, expectedNegativeZero] of [[-0, true], [NaN, false]]) {
      const primitive = { kind: 'json', value: { kind: 'number', bits: number === 0 ? '8000000000000000' : '7ff8000000000000' } };
      const valueOf = send({ event: 'get-opaque-property', receiver: primitive, key: key('valueOf'), semanticCatch: false });
      const returned = send({ event: 'invoke-opaque', function: valueOf.value.handle, receiver: primitive, args: [], semanticCatch: false });
      if (expectedNegativeZero) assert.equal(Object.is(decode({ kind: 'number', ...returned.value }), -0), true);
      else assert.equal(Number.isNaN(decode({ kind: 'number', ...returned.value })), true);
    }
    assert.equal(send({ event: 'get-opaque-property', receiver: { kind: 'opaque', handle: 999 }, key: key('x'), semanticCatch: true }).kind, 'protocol-error');
    const coercionHandle = send({ event: 'get-opaque-property', receiver: { kind: 'opaque', handle: 1 }, key: key('coercionValue'), semanticCatch: false }).value.handle;
    const coercionResult = send({ event: 'string-concat', prefix: key('/prefix/').units, value: { kind: 'opaque', handle: coercionHandle } });
    const coercionChunk = send({ event: 'read-utf16-chunk', token: coercionResult.value.token, offset: 0, maxUnits: 64 });
    assert.equal(String.fromCharCode(...coercionChunk.units), '/prefix/7');
    const fallbackHandle = send({ event: 'get-opaque-property', receiver: { kind: 'opaque', handle: 1 }, key: key('fallbackValue'), semanticCatch: false }).value.handle;
    const fallbackResult = send({ event: 'string-concat', prefix: key('/fallback/').units, value: { kind: 'opaque', handle: fallbackHandle } });
    const fallbackChunk = send({ event: 'read-utf16-chunk', token: fallbackResult.value.token, offset: 0, maxUnits: 64 });
    assert.equal(String.fromCharCode(...fallbackChunk.units), '/fallback/12');
  }), null, 'inspectCoreSchemaProperties', [input]);
  assert.deepEqual(callbackResult, { kind: 'invocation', value: { kind: 'boolean', value: true } });
  assert.deepEqual(trace.slice(0, 3), [['get', true], ['method', true, 'registered'], ['callback', true, true]]);
  assert.deepEqual(trace.slice(-3), [['toPrimitive', 'default'], ['fallback:valueOf'], ['fallback:toString']]);
  assert.equal(trace.filter(item => item[0] === 'stringify').length, 2);

  const stringifyMarker = {};
  const failing = { get stringifyThrows() { return function () { throw { toString() { throw stringifyMarker; } }; }; } };
  assert.throws(() => api.schemaPropertiesHostInput(addon(failing, send => {
    const fn = send({ event: 'get-opaque-property', receiver: { kind: 'opaque', handle: 1 }, key: key('stringifyThrows'), semanticCatch: false });
    send({ event: 'invoke-opaque', function: fn.value.handle, receiver: { kind: 'opaque', handle: 1 }, args: [], semanticCatch: true });
  }), null, 'inspectCoreSchemaProperties', [failing]), error => error === stringifyMarker);

  const nullReceiver = {};
  assert.throws(() => api.schemaPropertiesHostInput(addon(nullReceiver, send => {
    send({ event: 'get-opaque-property', receiver: { kind: 'json', value: { kind: 'null' } }, key: key('x'), semanticCatch: false });
  }), null, 'inspectCoreSchemaProperties', [nullReceiver]), TypeError);
  const concatMarker = {};
  const concatFailure = { get value() { return { [Symbol.toPrimitive]() { throw concatMarker; } }; } };
  assert.throws(() => api.schemaPropertiesHostInput(addon(concatFailure, send => {
    const handle = send({ event: 'get-opaque-property', receiver: { kind: 'opaque', handle: 1 }, key: key('value'), semanticCatch: false }).value.handle;
    send({ event: 'string-concat', prefix: key('/x/').units, value: { kind: 'opaque', handle } });
  }), null, 'inspectCoreSchemaProperties', [concatFailure]), error => error === concatMarker);
  const symbolFailure = { get value() { return { [Symbol.toPrimitive]() { return Symbol('bad'); } }; } };
  assert.throws(() => api.schemaPropertiesHostInput(addon(symbolFailure, send => {
    const handle = send({ event: 'get-opaque-property', receiver: { kind: 'opaque', handle: 1 }, key: key('value'), semanticCatch: false }).value.handle;
    send({ event: 'string-concat', prefix: key('/x/').units, value: { kind: 'opaque', handle } });
  }), null, 'inspectCoreSchemaProperties', [symbolFailure]), TypeError);

  function iteratorCloseCase(closeFailure) {
    const trace = [], bodyThrow = { kind: 'body-throw' }, closeThrow = { kind: 'close-throw' };
    const iterator = { get return() {
      trace.push('return:get');
      if (closeFailure === 'getter') throw closeThrow;
      return function () { trace.push('return:call'); if (closeFailure === 'call') throw closeThrow; if (closeFailure === 'primitive') return 1; return {}; };
    } };
    const subject = { get body() { trace.push('body:get'); throw bodyThrow; } };
    const caseInput = { subject, iterator };
    assert.throws(() => api.schemaPropertiesHostInput(addon(caseInput, (send, dispatch) => {
      const sendRaw = request => decode(JSON.parse(dispatch(JSON.stringify(request))));
      const body = sendRaw({ event: 'get-opaque-property', receiver: { kind: 'opaque', handle: 1 }, key: key('subject'), semanticCatch: false });
      assert.equal(body.kind, 'opaque-value');
      const subjectHandle = body.value.handle;
      const bodyThrowReply = sendRaw({ event: 'get-opaque-property', receiver: { kind: 'opaque', handle: subjectHandle }, key: key('body'), semanticCatch: false });
      assert.equal(bodyThrowReply.kind, 'host-exception');
      assert.equal(sendRaw({ event: 'close-opaque-iterator', iterator: 999 }).kind, 'iterator-closed');
      const iteratorReply = sendRaw({ event: 'get-opaque-property', receiver: { kind: 'opaque', handle: 1 }, key: key('iterator'), semanticCatch: false });
      assert.equal(iteratorReply.kind, 'opaque-value');
      assert.equal(sendRaw({ event: 'close-opaque-iterator', iterator: iteratorReply.value.handle }).kind, 'iterator-closed');
    }), null, 'inspectCoreSchemaProperties', [caseInput]), error => error === bodyThrow);
    assert.deepEqual(trace, ['body:get', ...(closeFailure === 'getter' ? ['return:get'] : ['return:get', 'return:call'])]);
  }
  const diagnosticInput = { callbackDiagnostic: { code: 'CALLBACK', path: '/callback', message: 'caller diagnostic', severity: 'warning', unknown: 9 } };
  const diagnosticEvents = [];
  function diagnosticAddon(input, script) {
    return { executeCoreSchemaPropertiesHostJson(_resources, _operation, _handle, dispatch) {
      const send = request => decode(JSON.parse(dispatch(transportStringify(request))));
      script(send);
      return okEnvelope;
    } };
  }
  const staticItem = { kind: 'static', value: { kind: 'object', members: [
    { key: key('code').units, value: encodeString('STATIC') },
    { key: key('severity').units, value: encodeString('warning') },
  ] } };
  api.schemaPropertiesHostInput(diagnosticAddon(diagnosticInput, send => {
    const callback = send({ event: 'get-opaque-property', receiver: { kind: 'opaque', handle: 1 }, key: key('callbackDiagnostic'), semanticCatch: false });
    const result = send({ event: 'stringify-diagnostic-array', items: [staticItem, { kind: 'opaque', handle: callback.value.handle }] });
    assert.equal(result.kind, 'opaque-value');
    const chunk = send({ event: 'read-utf16-chunk', token: result.value.token, offset: 0, maxUnits: 512 });
    const serialized = String.fromCharCode(...chunk.units);
    assert.deepEqual(JSON.parse(serialized), [
      { code: 'STATIC', severity: 'warning' },
      { code: 'CALLBACK', path: '/callback', message: 'caller diagnostic', severity: 'warning', unknown: 9 },
    ]);
    diagnosticEvents.push('mixed-order');
  }), null, 'inspectCoreSchemaProperties', [diagnosticInput]);

  const liveDiagnosticInput = { callbackDiagnostic: { code: 'CALLBACK' } };
  const stringifyCalls = [];
  const originalStringify = JSON.stringify;
  try {
    JSON.stringify = function (value) {
      if (Array.isArray(value) && value[0]?.code === 'STATIC') {
        stringifyCalls.push({ receiverIsJson: this === JSON, codes: value.map(item => item?.code) });
        return 17;
      }
      return Reflect.apply(originalStringify, this, [value]);
    };
    api.schemaPropertiesHostInput(diagnosticAddon(liveDiagnosticInput, send => {
      const callback = send({ event: 'get-opaque-property', receiver: { kind: 'opaque', handle: 1 }, key: key('callbackDiagnostic'), semanticCatch: false });
      const result = send({ event: 'stringify-diagnostic-array', items: [staticItem, { kind: 'opaque', handle: callback.value.handle }] });
      assert.equal(result.kind, 'opaque-value');
      const carrier = send({ event: 'construct-error-carrier', value: { kind: 'json', value: { kind: 'number', bits: '4031000000000000' } } });
      assert.equal(carrier.kind, 'opaque-value');
      const message = send({ event: 'get-opaque-property', receiver: { kind: 'opaque', handle: carrier.value.handle }, key: key('message'), semanticCatch: false });
      assert.equal(message.kind, 'opaque-value');
      const chunk = send({ event: 'read-utf16-chunk', token: message.value.token, offset: 0, maxUnits: 16 });
      assert.equal(String.fromCharCode(...chunk.units), '17');
    }), null, 'inspectCoreSchemaProperties', [liveDiagnosticInput]);
  } finally { JSON.stringify = originalStringify; }
  assert.deepEqual(stringifyCalls, [{ receiverIsJson: true, codes: ['STATIC', 'CALLBACK'] }]);

  const toJSONTrace = [];
  const prototypeToJSON = Object.prototype.toJSON;
  try {
    Object.prototype.toJSON = function (key) {
      if (this?.code || key === '' && Array.isArray(this) && this[0]?.code) toJSONTrace.push({ key, isArray: Array.isArray(this), code: this.code });
      return this;
    };
    const inheritedInput = { callbackDiagnostic: { code: 'CALLBACK', severity: 'warning' } };
    api.schemaPropertiesHostInput(diagnosticAddon(inheritedInput, send => {
      const callback = send({ event: 'get-opaque-property', receiver: { kind: 'opaque', handle: 1 }, key: key('callbackDiagnostic'), semanticCatch: false });
      const result = send({ event: 'stringify-diagnostic-array', items: [staticItem, { kind: 'opaque', handle: callback.value.handle }] });
      const chunk = send({ event: 'read-utf16-chunk', token: result.value.token, offset: 0, maxUnits: 256 });
      assert.equal(JSON.parse(String.fromCharCode(...chunk.units))[1].code, 'CALLBACK');
    }), null, 'inspectCoreSchemaProperties', [inheritedInput]);
  } finally { Object.prototype.toJSON = prototypeToJSON; }
  assert.deepEqual(toJSONTrace.slice(0, 3), [
    { key: '', isArray: true, code: undefined },
    { key: '0', isArray: false, code: 'STATIC' },
    { key: '1', isArray: false, code: 'CALLBACK' },
  ]);

  const callbackThrow = {};
  const throwingDiagnostic = { callbackDiagnostic: { get code() { throw callbackThrow; } } };
  assert.throws(() => api.schemaPropertiesHostInput(diagnosticAddon(throwingDiagnostic, send => {
    const callback = send({ event: 'get-opaque-property', receiver: { kind: 'opaque', handle: 1 }, key: key('callbackDiagnostic'), semanticCatch: false });
    send({ event: 'stringify-diagnostic-array', items: [{ kind: 'opaque', handle: callback.value.handle }] });
  }), null, 'inspectCoreSchemaProperties', [throwingDiagnostic]), error => error === callbackThrow);

  const messageThrow = {};
  const constructionTrace = [];
  const inheritedMessage = Object.getOwnPropertyDescriptor(Error.prototype, 'message');
  try {
    Object.defineProperty(Error.prototype, 'message', { configurable: true, get() { constructionTrace.push({ receiverIsCarrier: this instanceof Error, hasOwnMessage: Object.hasOwn(this, 'message') }); throw messageThrow; } });
    const undefinedInput = {};
    assert.throws(() => api.schemaPropertiesHostInput(diagnosticAddon(undefinedInput, send => {
      const carrier = send({ event: 'construct-error-carrier', value: { kind: 'undefined' } });
      assert.equal(carrier.kind, 'opaque-value');
      assert.deepEqual(constructionTrace, []);
      send({ event: 'get-opaque-property', receiver: { kind: 'opaque', handle: carrier.value.handle }, key: key('message'), semanticCatch: false });
    }), null, 'inspectCoreSchemaProperties', [undefinedInput]), error => error === messageThrow);
    assert.deepEqual(constructionTrace, [{ receiverIsCarrier: true, hasOwnMessage: false }]);
  } finally {
    if (inheritedMessage) Object.defineProperty(Error.prototype, 'message', inheritedMessage);
    else delete Error.prototype.message;
  }
  diagnosticEvents.push('live-stringify', 'inherited-toJSON', 'callback-getter-throw-identity', 'delayed-error-message-getter');
  iteratorCloseCase('getter');
  iteratorCloseCase('call');
  iteratorCloseCase('primitive');
  return { callbackReceiverAndOrder: true, bigintZeroAndOne: true, semanticCatchAndStringOnce: true, stringifyThrowIdentity: true, malformedHandleFailsClosed: true, nullPropertyAccessThrows: true, stringConcatDefaultHintAndBigInt: true, stringConcatFallbackOrder: true, stringConcatThrowIdentity: true, stringConcatSymbolTypeError: true, iteratorCloseReturnGetterThrowIdentity: true, iteratorCloseReturnCallThrowIdentity: true, iteratorClosePrimitiveReturnIdentity: true, diagnosticArrayMixedStaticOpaqueOrder: true, liveJSONStringifyReceiverAndNonStringReturn: true, inheritedObjectToJSONOnArrayAndEntries: true, diagnosticGetterThrowIdentity: true, delayedErrorMessageGetter: true };
}

const nodeResult = runProbe({ schemaPropertiesHostInput }, assert);
if (typeof Bun === 'undefined') {
  console.log(JSON.stringify({ status: 'node-pass', runtime: process.version, node: nodeResult }, null, 2));
} else {
const temp = await mkdtemp(join(tmpdir(), 'umf-selection-host-primitive-'));
let browser;
let browserResult;
let browserUnavailable;
try {
  const bundle = join(temp, 'host-json.js');
  const build = await Bun.build({ entrypoints: [resolve(rootDir, 'bindings/core/wasm/src/host-json.js')], target: 'browser', format: 'esm', outdir: temp });
  if (!build.success) throw new Error(build.logs.map(log => log.message).join('\n'));
  const generated = build.outputs.find(output => output.path.endsWith('host-json.js'));
  await Bun.write(bundle, await generated.text());
  try { browser = await chromium.launch({ headless: true, ...(process.env.UMF_CHROMIUM_PATH ? { executablePath: process.env.UMF_CHROMIUM_PATH } : {}) }); }
  catch (error) { browserUnavailable = String(error).split('\n')[0]; }
  if (browser) {
    const page = await browser.newPage();
    await page.goto('about:blank');
    try {
      browserResult = await page.evaluate(async ({ probeSource, moduleSource }) => {
        const api = await import(`data:text/javascript;base64,${btoa(moduleSource)}`);
        const browserAssert = {
          equal(a, b) { if (a !== b) throw new Error(`Expected ${String(a)} === ${String(b)}`); },
          deepEqual(a, b) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error('Deep equality assertion failed'); },
          throws(fn, expected) { try { fn(); } catch (error) { const matches = typeof expected === 'function' && expected.prototype ? error instanceof expected : expected(error); if (!matches) throw new Error('Unexpected thrown identity/type'); return; } throw new Error('Expected throw'); },
        };
        return (new Function('api', 'assert', `return (${probeSource})(api, assert);`))(api, browserAssert);
      }, { probeSource: runProbe.toString(), moduleSource: await readFile(bundle, 'utf8') });
    } catch (error) {
      throw new Error(`Chromium probe failed: ${error?.name ?? 'Error'}: ${String(error?.message ?? error).split('\n')[0].slice(0, 240)}`);
    }
    assert.deepEqual(browserResult, nodeResult);
  }
  console.log(JSON.stringify({ status: browser ? 'pass' : 'partial', bun: Bun.version, nodeAdapterOnBun: nodeResult, chromium: browser ? { version: browser.version(), assertions: browserResult } : { status: 'unavailable', reason: browserUnavailable } }, null, 2));
} finally {
  if (browser) await browser.close();
  await rm(temp, { recursive: true, force: true });
}
}
