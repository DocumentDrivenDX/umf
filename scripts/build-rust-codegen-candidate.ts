import {cp,mkdir} from 'node:fs/promises';

const outdir='dist';
await mkdir(outdir,{recursive:true});
const types=Bun.spawn([process.execPath,'node_modules/typescript/bin/tsc','--emitDeclarationOnly'],{stdout:'inherit',stderr:'inherit'});
if(await types.exited)throw new Error('Type declaration build failed');
const browser=await Bun.build({entrypoints:['src/browser.ts'],outdir,naming:'umf-rust-codegen-candidate-v2-browser.js',target:'browser',format:'esm',sourcemap:'external'});
if(!browser.success)throw new Error(browser.logs.join('\n'));
const node=await Bun.build({entrypoints:['src/node.ts'],outdir,naming:'umf-rust-codegen-candidate-v2-node.js',target:'node',format:'esm',sourcemap:'external'});
if(!node.success)throw new Error(node.logs.join('\n'));
const browserV3=await Bun.build({entrypoints:['src/browser-v3.ts'],outdir,naming:'umf-rust-codegen-candidate-v3-browser.js',target:'browser',format:'esm',sourcemap:'external'});
if(!browserV3.success)throw new Error(browserV3.logs.join('\n'));
const nodeV3=await Bun.build({entrypoints:['src/node-v3.ts'],outdir,naming:'umf-rust-codegen-candidate-v3-node.js',target:'node',format:'esm',sourcemap:'external'});
if(!nodeV3.success)throw new Error(nodeV3.logs.join('\n'));
const browserV4=await Bun.build({entrypoints:['src/browser-v4.ts'],outdir,naming:'umf-rust-codegen-candidate-v4-browser.js',target:'browser',format:'esm',sourcemap:'external'});
if(!browserV4.success)throw new Error(browserV4.logs.join('\n'));
const nodeV4=await Bun.build({entrypoints:['src/node-v4.ts'],outdir,naming:'umf-rust-codegen-candidate-v4-node.js',target:'node',format:'esm',sourcemap:'external'});
if(!nodeV4.success)throw new Error(nodeV4.logs.join('\n'));
await cp('bindings/core/node/umf_core_node.node',`${outdir}/umf_core_node.node`);
await cp('bindings/core/wasm/pkg',`${outdir}/pkg`,{recursive:true,force:true});
// The bundled wasm-bindgen glue resolves its binary relative to the emitted
// browser bundle, so ship the WASM binary beside that bundle as well.
await cp('bindings/core/wasm/pkg/umf_core_wasm_bg.wasm',`${outdir}/umf_core_wasm_bg.wasm`);
console.log(`Opt-in Rust codegen candidates built: V2 browser ${browser.outputs[0]!.size} bytes, Node ${node.outputs[0]!.size} bytes; V3 browser ${browserV3.outputs[0]!.size} bytes, Node ${nodeV3.outputs[0]!.size} bytes; V4 browser ${browserV4.outputs[0]!.size} bytes, Node ${nodeV4.outputs[0]!.size} bytes.`);
