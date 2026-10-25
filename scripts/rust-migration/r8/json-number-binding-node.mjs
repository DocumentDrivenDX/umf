import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const root = resolve(import.meta.dirname, '../../..');
const packageRoot = resolve(process.env.UMF_JSON_NUMBER_PACKAGE_ROOT ?? 'bindings/core/node');
const facade = await import(pathToFileURL(resolve(packageRoot, 'index.js')).href);
const packetPath = resolve(root, 'docs/helix/04-build/evidence/rust-migration/r8-json-number-predecessor/typescript-predecessor.json');
const packetBytes = await readFile(packetPath);
const packet = JSON.parse(packetBytes);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
assert.equal(facade.JSON_NUMBER_PROFILE, 'umf-json-number/0.1');
const engine = facade.createJsonNumberEngine();
let passed = 0;
for (const item of packet.cases) {
  let actual;
  try {
    actual = engine.assertExactJsonNumber(item.token);
    assert.equal(item.outcome, 'accepted', `${item.id} unexpectedly accepted`);
    assert.equal(actual, undefined, `${item.id} must preserve void success`);
  } catch (error) {
    assert.equal(item.outcome, 'refused', `${item.id} unexpectedly refused: ${error}`);
    assert.deepEqual({name: error.name, code: error.code, message: error.message}, item.error, item.id);
  }
  passed++;
}

let coercions = 0;
assert.throws(() => engine.assertExactJsonNumber({toString() { coercions++; return '1'; }}), TypeError);
assert.equal(coercions, 0, 'the opt-in declared-string interface must not invoke user coercion');
let surrogateError;
try { engine.assertExactJsonNumber('\ud800'); } catch (error) { surrogateError = error; }
assert.equal(surrogateError?.name, 'UmfError');
assert.equal(surrogateError?.code, 'NUMBER');
assert.equal(surrogateError?.message, 'Noninteroperable JSON number');

let measured = 0;
const measuring = facade.createJsonNumberEngine({controls: {meter(amount) { measured += amount; }}});
measuring.assertExactJsonNumber('42');
assert.ok(measured > 0);
const budget = Math.floor(measured * 1.5);
const sticky = facade.createJsonNumberEngine({controls: {maxWork: budget}});
sticky.assertExactJsonNumber('42');
sticky.assertExactJsonNumber('42');
let cancelled = true;
const cancellation = facade.createJsonNumberEngine({controls: {isCancelled() { return cancelled; }}});
assert.throws(() => cancellation.assertExactJsonNumber('42'), error => error.code === 'CANCELLED');
cancelled = false;
cancellation.assertExactJsonNumber('42');

console.log(JSON.stringify({host: typeof Bun === 'undefined' ? 'node' : 'bun', version: typeof Bun === 'undefined' ? process.version : Bun.version, profile: facade.JSON_NUMBER_PROFILE,
  cases: passed, mismatches: 0, nonStringCoercions: coercions, utf16Surrogate: 'NUMBER/Noninteroperable JSON number',
  measuredWork: measured, stickyPerOperationBudget: budget, cancellationReset: true,
  packetSha256: sha256(packetBytes), addonPath: resolve(packageRoot, 'umf_core_node.node')}));
