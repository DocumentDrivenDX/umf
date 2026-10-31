// SPDX-License-Identifier: MIT OR Apache-2.0
import {createCodegenEngine} from '../bindings/core/node/index.js';
import {CODEGEN_RESOURCES} from './access/codegen-resources';
import {createPythonClientRustGeneratorV3,type PythonClientHostEngineV3} from './access/rust-runtime';
import type {PythonClientRustOptions,PythonClientRustGeneratorV3} from './access/rust-candidate';

/** Initialize native Rust once and return a synchronous legacy-read V3 generator. */
export async function createPythonClientRustCandidateV3(options:PythonClientRustOptions={}):Promise<PythonClientRustGeneratorV3> {
 const engine=createCodegenEngine(CODEGEN_RESOURCES,options) as PythonClientHostEngineV3;
 return createPythonClientRustGeneratorV3(engine);
}

export {PYTHON_CLIENT_HOST_READ_V3_PROFILE} from './access/rust-host-reads-v3';
export type {PythonClientRequest,PythonClientResult,PythonClientRustControls,PythonClientRustOptions,PythonClientRustGeneratorV3} from './access/rust-candidate';
