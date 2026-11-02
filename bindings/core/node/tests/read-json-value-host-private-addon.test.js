import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {invokeReadJsonValueHostPrivate} from '../src/read-json-value-host-private.js';

const addonPath = process.env.UMF_READ_JSON_VALUE_PRIVATE_ADDON;
const addon = addonPath ? createRequire(import.meta.url)(addonPath) : undefined;
const enabled = Boolean(addon);

test('compiled private N-API raw-host boundary preserves primitive sequencing and UTF-16', {skip: !enabled}, () => {
  const events = [];
  const dispatcher = (text) => {
    const request = JSON.parse(text); events.push(request.op);
    if (request.op === 'limit') return 'false';
    if (request.op === 'format') return 'yaml';
    if (request.op === 'length' || request.op === 'preflight') return 'ok';
    if (request.op === 'kind') return 'string:3';
    if (request.op === 'chunk') return '97,58,32';
    return 7;
  };
  assert.match(addon.executeReadJsonValueRawHostPrivate(1, 2, dispatcher), /^ok:/);
  assert.deepEqual(events, ['limit', 'format', 'length', 'kind', 'chunk']);
});

test('compiled private N-API raw-host boundary observes getters and retains throw identity', {skip: !enabled}, () => {
  let reads = 0;
  const objectSource = {get length() { reads++; return 0; }};
  assert.throws(() => invokeReadJsonValueHostPrivate(addon, objectSource, 'yaml'), TypeError);
  assert.equal(reads, 2);

  const sentinel = new Error('exact sentinel');
  const proxySource = new Proxy({}, {get(_target, key) { if (key === 'length') throw sentinel; }});
  assert.throws(() => invokeReadJsonValueHostPrivate(addon, proxySource, 'yaml'), (error) => error === sentinel);

  assert.throws(() => invokeReadJsonValueHostPrivate(addon, '{', 'json'), (error) =>
    error.code === 'SYNTAX' && error.path === '' && error.message === 'Invalid JSON syntax');
});

test('compiled private N-API raw-host boundary rejects malformed callback frames', {skip: !enabled}, () => {
  const frame = addon.executeReadJsonValueRawHostPrivate(1, 2, () => 7);
  assert.match(frame, /^error:PROTOCOL:/);
});
