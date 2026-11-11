// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Diagnostic,Document} from '../../model/types';

/** Trusted installed runtime callback. Rust owns document assembly orchestration. */
export interface SmithyAssemblyBackend {identity:string;assemble(files:Record<string,string>,control?:{signal?:AbortSignal}):string|Promise<string>;}
export interface SmithyAssemblyEvent {id:string;severity:'SUPPRESSED'|'NOTE'|'WARNING'|'DANGER'|'ERROR';message:string;source?:{filename:string;line:number;column:number};shapeId?:string;}
export interface SmithyAssemblyResult {status:'assembled'|'blocked';compiler:string;source:Document;inputs:{file:string;dependencyId?:string}[];events:SmithyAssemblyEvent[];issues:Diagnostic[];complete:false;limitations:string[];model?:Document;nativeModel?:string;}

/** Explicit opt-in adapter for the pinned generated JavaScript Smithy module. */
export {createSmithyJavaScriptBackend} from './host-backends';
