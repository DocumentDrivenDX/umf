// SPDX-License-Identifier: MIT OR Apache-2.0
import {initializeCodegenWasm} from '../bindings/core/wasm/index.js';
import {CODEGEN_RESOURCES} from './access/codegen-resources';
import {createPythonClientRustGenerator,type PythonClientEngine} from './access/rust-runtime';
import type {PythonClientRustGenerator,PythonClientRustOptions} from './access/rust-candidate';

/** Initialize browser WASM and return a synchronous V2 snapshot generator. */
export async function createPythonClientRustCandidateV2(options:PythonClientRustOptions={}):Promise<PythonClientRustGenerator> {
 const engine=await initializeCodegenWasm(undefined,globalThis,CODEGEN_RESOURCES,options);
 return createPythonClientRustGenerator(engine as PythonClientEngine);
}

export type {PythonClientRequest,PythonClientResult,PythonClientRustControls,PythonClientRustGenerator,PythonClientRustOptions} from './access/rust-candidate';
