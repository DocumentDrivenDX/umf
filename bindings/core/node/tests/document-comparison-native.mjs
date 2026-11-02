import assert from 'node:assert/strict';
import {copyJson, createDocumentComparisonEngine} from '../index.js';

const snapshot = (value) => copyJson(value);
const engine = createDocumentComparisonEngine({snapshot});
const before = JSON.parse('{"z":1,"a/b~c":"old","__proto__":"kept"}');
const after = JSON.parse('{"z":2,"a/b~c":"new","__proto__":"kept","extra":true}');
const scalarAndObjectChanges = engine.compareDocuments(before, after);
assert.equal(JSON.stringify(scalarAndObjectChanges), JSON.stringify([
  {path: '/z', status: 'changed', before: 1, after: 2},
  {path: '/a~1b~0c', status: 'changed', before: 'old', after: 'new'},
  {path: '/extra', status: 'created', after: true},
]));
assert.equal(Object.getPrototypeOf(scalarAndObjectChanges[0]), Object.prototype, 'change records retain predecessor plain-object shape');

const keyed = engine.compareDocuments(
  [{id: 'a/b~c', value: 'old'}, {id: 'gone'}],
  [{id: 'a/b~c', value: 'new'}, {id: 'new'}],
);
assert.equal(JSON.stringify(keyed), JSON.stringify([
  {path: '/id:a~1b~0c/value', status: 'changed', before: 'old', after: 'new'},
  {path: '/id:gone', status: 'removed', before: {id: 'gone'}},
  {path: '/id:new', status: 'created', after: {id: 'new'}},
]));

const nulJoinedOrder = engine.compareDocuments(
  [{id: 'a', value: 'first'}, {id: 'a\u0000a', value: 'second'}],
  [{id: 'a\u0000a', value: 'second'}, {id: 'a', value: 'first'}],
);
assert.deepEqual(nulJoinedOrder, [], 'shared-ID order preserves the predecessor NUL-join collision');

let afterReads = 0;
const invalidBefore = () => {};
const invalidAfter = Object.defineProperty({}, 'x', {enumerable: true, get() { afterReads++; return 1; }});
assert.throws(() => engine.compareDocuments(invalidBefore, invalidAfter), (error) => error.code === 'UNSUPPORTED_VALUE');
assert.equal(afterReads, 0, 'after snapshot must not run when before refuses');

let measured = 0;
createDocumentComparisonEngine({snapshot, controls: {meter: (amount) => measured += amount}}).compareDocuments({a: 1}, {a: 2});
assert.ok(measured > 0);
assert.throws(() => createDocumentComparisonEngine({snapshot, controls: {isCancelled: () => true}}).compareDocuments(null, true), (error) => error.code === 'CANCELLED');
assert.throws(() => createDocumentComparisonEngine({snapshot, controls: {maxWork: 0}}).compareDocuments(null, true), (error) => error.code === 'RESOURCE_LIMIT');
assert.throws(() => createDocumentComparisonEngine({snapshot, controls: {meter() { throw new Error('meter failed'); }}}).compareDocuments(null, true), (error) => error.code === 'METER_FAILURE' && error.message === 'meter failed');

process.stdout.write(`${JSON.stringify({scalarAndObjectChanges, keyed, nulJoinedOrder, measured})}\n`);
