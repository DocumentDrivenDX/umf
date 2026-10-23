// Node/Bun import smoke for the extracted browser package. Pass the wasm bytes
// directly because wasm-bindgen's web loader ordinarily fetches its URL.
import {readFile} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {pathToFileURL} from 'node:url';

const packageRoot = process.env.UMF_R7_WASM_PACKAGE;
if (!packageRoot) throw new Error('Set UMF_R7_WASM_PACKAGE to the extracted package directory');
const root = resolve(packageRoot);
const wrapper = await import(pathToFileURL(join(root, 'index.js')));
const wasm = await import(pathToFileURL(join(root, 'pkg/umf_core_wasm.js')));
await wasm.default(new Uint8Array(await readFile(join(root, 'pkg/umf_core_wasm_bg.wasm'))));
const core = wrapper.createEngine(wasm);
const copied = core.copyJson({retained: [1, 'two', null]});
if (copied.retained.length !== 3 || copied.retained[1] !== 'two') throw new Error('Extracted core package smoke failed');
const bit128 = wrapper.createBit128Engine(wasm);
if (bit128.parseBits128('f'.repeat(32)).hex !== 'f'.repeat(32)) throw new Error('Extracted bit128 package smoke failed');
console.log(JSON.stringify({status: 'pass', runtime: typeof Bun === 'undefined' ? 'node' : 'bun', core: true, bit128: true}));
