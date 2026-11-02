// SPDX-License-Identifier: MIT OR Apache-2.0
import {initializeCodegenWasm} from '../bindings/core/wasm/index.js';
import {CODEGEN_RESOURCES} from './access/codegen-resources';
import {createPythonClientRustGeneratorV3,type PythonClientHostEngineV3} from './access/rust-runtime';
import type {PythonClientRustOptions,PythonClientRustGeneratorV3} from './access/rust-candidate';

/** Initialize browser WASM and return a synchronous legacy-read V3 generator. */
export async function createPythonClientRustCandidateV3(options:PythonClientRustOptions={}):Promise<PythonClientRustGeneratorV3> {
 const engine=await initializeCodegenWasm(undefined,globalThis,CODEGEN_RESOURCES,options);
 return createPythonClientRustGeneratorV3(engine as PythonClientHostEngineV3);
}

export {PYTHON_CLIENT_HOST_READ_V3_PROFILE} from './access/rust-host-reads-v3';
export type {PythonClientRequest,PythonClientResult,PythonClientRustControls,PythonClientRustOptions,PythonClientRustGeneratorV3} from './access/rust-candidate';
