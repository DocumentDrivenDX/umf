import test from 'node:test';
import assert from 'node:assert/strict';
import {invokeReadJsonValueHostPrivate} from '../src/read-json-value-host-private.js';

test('private raw-host dispatcher preserves ordered observations and UTF-16 chunks', () => {
  const events = [];
  const replies = [];
  const addon = {executeReadJsonValueRawHostPrivate(raw, format, dispatch) {
    assert.equal(raw, 1); assert.equal(format, 2);
    for (const [op, offset = 0, count = 0] of [['limit', 0, 4_000_000], ['format'], ['preflight'], ['length'], ['kind'], ['chunk', 0, 5]]) {
      const request = {op, raw, format, offset, count};
      events.push(request);
      replies.push(dispatch(JSON.stringify(request)));
    }
    return 'ok:test-frame';
  }};
  assert.equal(invokeReadJsonValueHostPrivate(addon, '"A\uD800B"', 'json'), 'ok:test-frame');
  assert.deepEqual(events.map((event) => event.op), ['limit', 'format', 'preflight', 'length', 'kind', 'chunk']);
  assert.equal(events[5].count, 5);
  assert.deepEqual(replies, ['false', 'json', 'ok', 'ok', 'string:5', '34,65,55296,66,34']);
});

test('private dispatcher retains the exact thrown value through the facade', () => {
  const sentinel = new Error('sentinel');
  const source = new Proxy({}, {get(_target, key) { if (key === 'length') throw sentinel; }});
  const addon = {executeReadJsonValueRawHostPrivate(_raw, _format, dispatch) {
    const reply = dispatch(JSON.stringify({op: 'limit', raw: 1, format: 2, count: 4_000_000}));
    return reply;
  }};
  assert.throws(() => invokeReadJsonValueHostPrivate(addon, source, 'yaml'), (error) => error === sentinel);
});

test('error frames preserve isolated surrogates and decode long diagnostics in bounded chunks', () => {
  const units = (text) => Array.from(text, (char) => char.charCodeAt(0)).join(',');
  const path = '\uD800';
  const message = `\uDC00${'x'.repeat(10_000)}`;
  const addon = {executeReadJsonValueRawHostPrivate() {
    return `error:SYNTAX:${units('SYNTAX')}:${units(path)}:${units(message)}`;
  }};
  assert.throws(() => invokeReadJsonValueHostPrivate(addon, '', 'yaml'), (error) =>
    error.code === 'SYNTAX' && error.path.length === 1 && error.path.charCodeAt(0) === 0xD800 &&
    error.message.length === message.length && error.message.charCodeAt(0) === 0xDC00 && error.message.slice(1) === message.slice(1));
});

test('malformed UTF-16 error frames fail closed', () => {
  const addon = {executeReadJsonValueRawHostPrivate() { return 'error:SYNTAX:83,89,78,84,65,88:65536:65'; }};
  assert.throws(() => invokeReadJsonValueHostPrivate(addon, '', 'yaml'), /Invalid host error frame/);
});
