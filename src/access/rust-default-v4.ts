// SPDX-License-Identifier: MIT OR Apache-2.0
import type {PythonClientRequest,PythonClientResult} from './rust-candidate';

export type PythonClientRustInitializerV4=()=>Promise<unknown>;
export type PythonClientRustDefaultV4=(request:PythonClientRequest)=>PythonClientResult;

/** Release candidate ships native archives only for the reviewed initial cohorts. */
export function assertPythonClientRustPlatformV4(platform:string,architecture:string):void {
 if((platform==='darwin'&&architecture==='arm64')||(platform==='linux'&&architecture==='x64'))return;
 throw new Error(`UMF_RUST_CODEGEN_UNSUPPORTED_PLATFORM: ${platform}/${architecture}; supported cohorts are darwin/arm64 and linux/x64`);
}

/** Await candidate initialization now so callers retain the synchronous API. */
export async function initializePythonClientRustDefaultV4(initialize:PythonClientRustInitializerV4):Promise<PythonClientRustDefaultV4> {
 const generator=await initialize();
 if(typeof generator!=='function')throw new TypeError('Rust codegen initialization did not return a generator');
 return generator as PythonClientRustDefaultV4;
}
