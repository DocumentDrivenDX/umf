// SPDX-License-Identifier: MIT OR Apache-2.0
import {initializeCodegenWasm} from '../bindings/core/wasm/index.js';
import {CODEGEN_RESOURCES} from './access/codegen-resources';
import {createPythonClientRustGeneratorV4,type PythonClientHostEngineV4} from './access/rust-runtime';
import type {PythonClientRustOptions,PythonClientRustGeneratorV3} from './access/rust-candidate';

/** Initialize browser WASM and return the synchronous V4 generator. */
export async function createPythonClientRustCandidateV4(options:PythonClientRustOptions={}):Promise<PythonClientRustGeneratorV3> {
 const engine=await initializeCodegenWasm(undefined,globalThis,CODEGEN_RESOURCES,options);
 return createPythonClientRustGeneratorV4(engine as PythonClientHostEngineV4);
}

export {PYTHON_CLIENT_HOST_READ_V4_PROFILE} from './access/rust-host-reads-v4';
export type {PythonClientRequest,PythonClientResult,PythonClientRustControls,PythonClientRustOptions} from './access/rust-candidate';
