import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {parseNativeYaml} from '../../../../../../src/model/native-json.ts';

const packageRoot = process.env.UMF_R8_NATIVE_YAML_NODE_PACKAGE_ROOT;
if (!packageRoot) throw new Error('UMF_R8_NATIVE_YAML_NODE_PACKAGE_ROOT is required');
const {createJsonSchemaEngine} = await import(new URL(`file://${join(packageRoot, 'index.js')}`));
const rust = createJsonSchemaEngine();
const sources = [
  ['large-exponent', 'x: 1e999'],
  ['signed-positive-radix', 'x: +0x10'],
  ['signed-negative-radix', 'x: -0x10'],
  ['leading-zero-decimal', 'x: 01'],
  ['non-finite-float', 'x: .inf'],
  ['negative-zero-exponent', 'x: -0e0'],
  ['explicit-scalar-tag', 'x: !!str 1'],
  ['unknown-alias', 'x: *missing'],
  ['tagged-alias', 'x: !!str *missing'],
  ['defined-alias', 'x: &a 1\ny: *a'],
];
const observe = (parse, source) => {
  try { return {outcome: 'return', tree: parse(source)}; }
  catch (error) { return {outcome: 'throw', code: error.code ?? null, message: error.message}; }
};
const cases = sources.map(([id, source]) => ({id, source, predecessor: observe(parseNativeYaml, source), rustNode: observe(rust.parseNativeYaml.bind(rust), source)}));
const packet = await readFile(new URL('./predecessor.json', import.meta.url));
const receipt = {profile: 'umf-r8-native-yaml-edge-probes/0.1.0', nodeVersion: process.version, cases, packetSha256: createHash('sha256').update(packet).digest('hex')};
if (process.env.UMF_R8_NATIVE_YAML_EDGE_RECEIPT) await writeFile(process.env.UMF_R8_NATIVE_YAML_EDGE_RECEIPT, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify(receipt, null, 2));
