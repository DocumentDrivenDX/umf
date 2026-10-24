import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {runControlProbes} from './control-probes.js';

const [packagePath, outputPath, label, kind = 'node'] = process.argv.slice(2);
if (!packagePath || !outputPath || !label) throw new Error('usage: control-replay.mjs package-dir output.json label [node|wasm]');
const api = await import(pathToFileURL(`${packagePath}/index.js`));
let makeEngine;
let artifactSha256 = null;
if (kind === 'wasm') {
  const wasmPath = `${packagePath}/pkg/umf_core_wasm.js`;
  const wasm = await import(pathToFileURL(wasmPath));
  const binary = await readFile(`${packagePath}/pkg/umf_core_wasm_bg.wasm`);
  artifactSha256 = createHash('sha256').update(binary).digest('hex');
  await wasm.default({module: binary});
  makeEngine = (options = {}) => api.createJsonSchemaEngine(wasm, options);
} else {
  makeEngine = (options = {}) => api.createJsonSchemaEngine(options);
}
const cases = runControlProbes(makeEngine);
const expectedCodes = ['RESOURCE_LIMIT', 'CANCELLED', 'DEADLINE', 'METER_FAILURE', 'METER_FAILURE'];
const matched = cases.filter((item, index) => item.actual.status === 'threw' && item.actual.code === expectedCodes[index] && (index !== 4 || item.userMeterCalls === 4)).length;
const receipt = {format: 'umf-r5-json-schema-host-control-probes-v1', label, kind, runtime: {node: process.version, bun: typeof Bun === 'undefined' ? null : Bun.version}, artifactSha256, caseCount: cases.length, matched, cases};
await writeFile(outputPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify({label, caseCount: cases.length, matched, results: cases.map(({id, userMeterCalls, actual}) => ({id, userMeterCalls, status: actual.status, code: actual.code, message: actual.message}))}));
