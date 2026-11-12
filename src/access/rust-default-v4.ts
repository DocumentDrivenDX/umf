// SPDX-License-Identifier: MIT OR Apache-2.0
import type {PythonClientRequest,PythonClientResult} from './rust-candidate';

export type PythonClientRustInitializerV4=()=>Promise<unknown>;
export type PythonClientRustDefaultV4=(request:PythonClientRequest)=>PythonClientResult;

/** Releases ship native archives only for these cohorts (linux/arm64 is built and smoke tested by release.yml). */
export function assertPythonClientRustPlatformV4(platform:string,architecture:string):void {
 if((platform==='darwin'&&architecture==='arm64')||(platform==='linux'&&(architecture==='x64'||architecture==='arm64')))return;
 throw new Error(`UMF_RUST_CODEGEN_UNSUPPORTED_PLATFORM: ${platform}/${architecture}; supported cohorts are darwin/arm64, linux/x64 and linux/arm64`);
}

/** Await candidate initialization now so callers retain the synchronous API. */
export async function initializePythonClientRustDefaultV4(initialize:PythonClientRustInitializerV4):Promise<PythonClientRustDefaultV4> {
 const generator=await initialize();
 if(typeof generator!=='function')throw new TypeError('Rust codegen initialization did not return a generator');
 return generator as PythonClientRustDefaultV4;
}
