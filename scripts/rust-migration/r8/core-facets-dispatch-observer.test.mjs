// SPDX-License-Identifier: MIT OR Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import {installCoreFacetsDispatchObserver, findUniqueDispatchLines, installCoreFacetsBrowserDispatchBreakpoints} from './core-facets-dispatch-observer.mjs';

const decode = wire => wire;
const model = 'model/inspectCoreFacets';

function fixture() {
  const calls = [];
  const proto = { executeModelRequestWire(...args) { calls.push(['retained', this, args]); if (args[1] === 'throw') throw args[2]; return args[2]; } };
  const addon = { CoreKindNullabilityRuntime: function Runtime() {} };
  addon.CoreKindNullabilityRuntime.prototype = proto;
  addon.executeRequestWire = function (...args) { calls.push(['legacy', this, args]); if (args[1] === 'throw') throw args[2]; return args[2]; };
  return {addon, calls};
}

test('observes actual legacy and retained methods in call order, preserving receiver, args, result and thrown identity', () => {
  const {addon, calls} = fixture(), events = [], legacyThis = addon, runtime = Object.create(addon.CoreKindNullabilityRuntime.prototype), sentinel = {};
  const beforeLegacy = Object.getOwnPropertyDescriptor(addon, 'executeRequestWire');
  const beforeRetained = Object.getOwnPropertyDescriptor(addon.CoreKindNullabilityRuntime.prototype, 'executeModelRequestWire');
  const restore = installCoreFacetsDispatchObserver(addon, decode, op => events.push(op));
  const result = addon.executeRequestWire.call(legacyThis, model, 'ok', 17);
  assert.equal(result, 17);
  assert.throws(() => runtime.executeModelRequestWire(model, 'throw', sentinel), error => error === sentinel);
  assert.deepEqual(events, [model, model]);
  assert.deepEqual(calls.map(x => [x[0], x[2]]), [['legacy', [model, 'ok', 17]], ['retained', [model, 'throw', sentinel]]]);
  assert.equal(calls[0][1], legacyThis); assert.equal(calls[1][1], runtime);
  restore();
  assert.deepEqual(Object.getOwnPropertyDescriptor(addon, 'executeRequestWire'), beforeLegacy);
  assert.deepEqual(Object.getOwnPropertyDescriptor(addon.CoreKindNullabilityRuntime.prototype, 'executeModelRequestWire'), beforeRetained);
});

test('ignores non-model operations and untouched reference operations without inventing events', () => {
  const {addon} = fixture(), events = [];
  installCoreFacetsDispatchObserver(addon, decode, op => events.push(op));
  addon.executeRequestWire('resource/read');
  addon.executeRequestWire('reference/inspectCoreFacets');
  assert.deepEqual(events, []);
});

test('rejects absent and non-writable required entrypoints before modifying either method', () => {
  const {addon} = fixture(), original = addon.executeRequestWire;
  assert.throws(() => installCoreFacetsDispatchObserver({executeRequestWire: original, CoreKindNullabilityRuntime: function () {}}, decode, () => {}), /executeModelRequestWire/);
  Object.defineProperty(addon.CoreKindNullabilityRuntime.prototype, 'executeModelRequestWire', {value: addon.CoreKindNullabilityRuntime.prototype.executeModelRequestWire, writable: false, configurable: true});
  assert.throws(() => installCoreFacetsDispatchObserver(addon, decode, () => {}), /immutable/);
  assert.equal(addon.executeRequestWire, original);
});

test('browser marker lookup derives unique zero-based source lines and rejects missing or duplicate markers', () => {
  const markers = ['function executeRequestWire(wire_json, profile, dispatcher, control_dispatcher) {', 'executeModelRequestWire(wire_json, profile, dispatcher, control_dispatcher) {'];
  assert.deepEqual(findUniqueDispatchLines('a\n'+markers[0]+'\nx\n'+markers[1], markers), [1, 3]);
  assert.throws(() => findUniqueDispatchLines(markers[0], markers), /found 0/);
  assert.throws(() => findUniqueDispatchLines(markers[0]+'\n'+markers[0]+'\n'+markers[1], markers), /found 2/);
});

const bundle = 'header\nfunction executeRequestWire(wire_json, profile, dispatcher, control_dispatcher) {\n}\nclass Runtime {\nexecuteModelRequestWire(wire_json, profile, dispatcher, control_dispatcher) {\n}\n}';

test('registers both actual browser dispatch signatures and removes both breakpoints', async () => {
  const calls = [], cdp = {async send(method, args) {calls.push([method,args]); return {breakpointId: 'b'+args.lineNumber};}};
  const restore = await installCoreFacetsBrowserDispatchBreakpoints(cdp, 'http://localhost/bundle.js', bundle);
  assert.deepEqual(calls, [1,4].map(lineNumber => ['Debugger.setBreakpointByUrl',{url:'http://localhost/bundle.js',lineNumber}]));
  await restore(); await restore();
  assert.deepEqual(calls.slice(2), ['b1','b4'].map(breakpointId => ['Debugger.removeBreakpoint',{breakpointId}]));
});

test('fails before setting breakpoints when either browser marker is missing or ambiguous', async () => {
  let calls = 0; const cdp = {async send() {calls++;}};
  await assert.rejects(installCoreFacetsBrowserDispatchBreakpoints(cdp, 'u', bundle.replace('executeModelRequestWire','missing')), /found 0/);
  await assert.rejects(installCoreFacetsBrowserDispatchBreakpoints(cdp, 'u', bundle+'\n'+bundle), /found 2/);
  assert.equal(calls, 0);
});

test('rolls back first browser breakpoint if the second registration fails', async () => {
  const calls = [], sentinel = new Error('registration failure');
  const cdp = {async send(method,args) {calls.push([method,args]);if(method==='Debugger.setBreakpointByUrl' && args.lineNumber===4)throw sentinel;return {breakpointId:'first'};}};
  await assert.rejects(installCoreFacetsBrowserDispatchBreakpoints(cdp,'u',bundle), error => error===sentinel);
  assert.deepEqual(calls.at(-1), ['Debugger.removeBreakpoint',{breakpointId:'first'}]);
});

test('attempts to remove both browser breakpoints even if the first removal fails', async () => {
  const removed = [], cdp = {async send(method,args) {if(method==='Debugger.removeBreakpoint'){removed.push(args.breakpointId);if(args.breakpointId==='b1')throw Error('remove failed');}return {breakpointId:'b'+args.lineNumber};}};
  const restore = await installCoreFacetsBrowserDispatchBreakpoints(cdp,'u',bundle);
  await assert.rejects(restore(), /Could not remove/);
  assert.deepEqual(removed, ['b1','b4']);
});
