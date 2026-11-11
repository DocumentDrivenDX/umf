// SPDX-License-Identifier: MIT OR Apache-2.0

export interface PythonClientRequest {
 text:string; format?:'json'|'yaml'; package:string;
 records?:{module:string;element:string}[];
 actions?:{module:string;action:string}[];
}
export interface PythonClientResult {
 sourceDigest:string; description:Record<string,unknown>;
 files:{path:string;text:string;sha256:string}[];
}
export interface PythonClientRustControls {
 maxWork?:number;
 meter?:(amount:number)=>void;
 isCancelled?:()=>boolean;
 now?:()=>number;
 deadlineMs?:number;
}
export interface PythonClientRustOptions {
 profile?:'cooperative'|'hard-isolated';
 controls?:PythonClientRustControls;
}
export type PythonClientRustGenerator=(request:PythonClientRequest)=>PythonClientResult;
/** Opt-in V3 generator using the closed synchronous legacy host-read protocol. */
export type PythonClientRustGeneratorV3=(request:PythonClientRequest)=>PythonClientResult;
