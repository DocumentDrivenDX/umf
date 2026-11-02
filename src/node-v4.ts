// SPDX-License-Identifier: MIT OR Apache-2.0
import {createCodegenEngine} from '../bindings/core/node/index.js';
import {CODEGEN_RESOURCES} from './access/codegen-resources';
import {createPythonClientRustGeneratorV4,type PythonClientHostEngineV4} from './access/rust-runtime';
import type {PythonClientRustOptions,PythonClientRustGeneratorV3} from './access/rust-candidate';

/** Initialize native Rust once and return the synchronous V4 generator. */
export async function createPythonClientRustCandidateV4(options:PythonClientRustOptions={}):Promise<PythonClientRustGeneratorV3> {
 const engine=createCodegenEngine(CODEGEN_RESOURCES,options) as PythonClientHostEngineV4;
 return createPythonClientRustGeneratorV4(engine);
}

export {PYTHON_CLIENT_HOST_READ_V4_PROFILE} from './access/rust-host-reads-v4';
export type {PythonClientRequest,PythonClientResult,PythonClientRustControls,PythonClientRustOptions} from './access/rust-candidate';
