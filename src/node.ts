// SPDX-License-Identifier: MIT OR Apache-2.0
import {createCodegenEngine} from '../bindings/core/node/index.js';
import {CODEGEN_RESOURCES} from './access/codegen-resources';
import {createPythonClientRustGenerator,type PythonClientEngine} from './access/rust-runtime';
import type {PythonClientRustGenerator,PythonClientRustOptions} from './access/rust-candidate';

/** Initialize native Rust once and return a synchronous V2 snapshot generator. */
export async function createPythonClientRustCandidateV2(options:PythonClientRustOptions={}):Promise<PythonClientRustGenerator> {
 const engine=createCodegenEngine(CODEGEN_RESOURCES,options) as PythonClientEngine;
 return createPythonClientRustGenerator(engine);
}

export type {PythonClientRequest,PythonClientResult,PythonClientRustControls,PythonClientRustGenerator,PythonClientRustOptions} from './access/rust-candidate';
