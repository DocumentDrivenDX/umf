import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const root = process.env.UMF_NODE_PACKAGE;
const dataDir = process.env.UMF_FIXTURE_DIR;
const fixtures = ['predecessor.json', 'options-predecessor.json'];
const {createJsonSchemaEngine} = await import(pathToFileURL(join(root, 'index.js')));
const api = createJsonSchemaEngine();
const outcomes = [];
for (const name of fixtures) {
  const bytes = await readFile(join(dataDir, name));
  const packet = JSON.parse(bytes);
  for (const c of packet.cases) {
    if (name === 'predecessor.json' && c.options) continue;
    const actual = {id:c.id, outcome:null};
    try { actual.tree = api.parseNativeYaml(c.source, c.options); actual.outcome = 'return'; }
    catch (e) { actual.outcome = 'throw'; actual.code=e.code ?? null; actual.message=e.message; }
    actual.matches = actual.outcome === c.outcome && (c.outcome === 'return' ? JSON.stringify(actual.tree) === JSON.stringify(c.tree) : actual.code === c.code && actual.message === c.message);
    outcomes.push(actual);
  }
}
const source = `value: "${String.fromCharCode(0xd800)}"`;
const surrogate = api.parseNativeYaml(source).members.value.value;
const result = {profile:'umf-r8-native-yaml-options-node/0.1.0', nodeVersion:process.version, outcomes, cases:outcomes.length, matches:outcomes.filter(x=>x.matches).length, mismatches:outcomes.filter(x=>!x.matches), loneSurrogateUtf16Unit:surrogate.length===1&&surrogate.charCodeAt(0)===0xd800};
await writeFile(process.env.UMF_NODE_RECEIPT, JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
