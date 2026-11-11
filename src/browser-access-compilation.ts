// SPDX-License-Identifier: MIT OR Apache-2.0
import {CODEGEN_RESOURCES} from './access/codegen-resources';
import {createAccessCompilationRustDefault} from './access-compilation-rust-default';
import {createCodegenEngine,isWireAdmissionError} from '../bindings/core/wasm/index.js';

// The V4 browser build resolves this module after serving the matching WASM
// binary, just as its other CodegenEngine-backed entrypoints do.
const wasmModule=await import('../bindings/core/wasm/pkg/umf_core_wasm.js');
await wasmModule.default();
const access=createAccessCompilationRustDefault(createCodegenEngine(wasmModule,CODEGEN_RESOURCES),isWireAdmissionError);
export const {inspectAccessViews,generateAccessPackage,diffAccessPackages}=access;
export type {AccessRequest,AccessProfile,AccessResult,AccessSymbolChange} from './access-compilation-rust-default';
