// SPDX-License-Identifier: MIT OR Apache-2.0
import {createPreparedJsonSchemaEngine} from '../../bindings/core/wasm/index.js';
// @ts-expect-error The loader helper is plain ESM and deliberately has no declaration surface.
import {loadDefaultWasmModule} from '../../bindings/core/wasm/loader.js';
import {createValidator as createRustFacade} from './loader-contract-validator';
const wasm=await loadDefaultWasmModule();if(typeof wasm.default==='function')await wasm.default();
export function createValidator(strict=true){return createRustFacade(createPreparedJsonSchemaEngine(wasm),strict);}
