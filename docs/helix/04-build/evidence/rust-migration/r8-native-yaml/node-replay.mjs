import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

const root = process.env.UMF_R8_NATIVE_YAML_NODE_PACKAGE_ROOT;
if (!root) throw new Error('UMF_R8_NATIVE_YAML_NODE_PACKAGE_ROOT is required');
const fixtureUrl = new URL('./predecessor.json', import.meta.url);
const fixtureBytes = await readFile(fixtureUrl);
const fixture = JSON.parse(fixtureBytes.toString('utf8'));
const {createJsonSchemaEngine} = await import(pathToFileURL(join(root, 'index.js')));
const engine = createJsonSchemaEngine();
let cases = 0, returned = 0, threw = 0;
const messageMismatches = [];
for (const test of fixture.cases) {
  if (test.options) continue; // YAML 1.1 and option profiles are outside this candidate.
  cases++;
  if (test.outcome === 'return') {
    const actual = engine.parseNativeYaml(test.source);
    assert.equal(JSON.stringify(actual), JSON.stringify(test.tree), `tree mismatch: ${test.id}`);
    returned++;
  } else {
    let error;
    try { engine.parseNativeYaml(test.source); } catch (caught) { error = caught; }
    assert.ok(error, `expected predecessor error: ${test.id}`);
    assert.equal(error.code, test.code, `error code mismatch: ${test.id}`);
    if (error.message !== test.message) messageMismatches.push({id: test.id, expected: test.message, actual: error.message});
    threw++;
  }
}
const rawSurrogateSource = `value: "${String.fromCharCode(0xd800)}"`;
const surrogate = engine.parseNativeYaml(rawSurrogateSource).members.value.value;
assert.equal(surrogate.length, 1);
assert.equal(surrogate.charCodeAt(0), 0xd800);
const addonBytes = await readFile(join(root, 'umf_core_node.node'));
const receipt = {profile: 'umf-r8-native-yaml-node/0.1.0', nodeVersion: process.version, cases, returned, threw, matchingErrorCodes: threw, exactMessageMismatches: messageMismatches.length, messageMismatches, loneSurrogateUtf16Unit: true, packetSha256: createHash('sha256').update(fixtureBytes).digest('hex'), addonSha256: createHash('sha256').update(addonBytes).digest('hex')};
const output = process.env.UMF_R8_NATIVE_YAML_NODE_RECEIPT;
if (output) await writeFile(output, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify(receipt));
