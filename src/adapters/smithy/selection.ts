// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Diagnostic} from '../../model/types';
import type {SmithyAssemblyBackend,SmithyAssemblyResult} from './assembly';
export interface SmithySelectionBackend extends SmithyAssemblyBackend {select(modelJson:string,selector:string,control?:{signal?:AbortSignal}):string|Promise<string>;}
export interface SmithySelectionResult {status:'selected'|'blocked';selector:string;assembly:SmithyAssemblyResult;shapeIds?:string[];issues:Diagnostic[];complete:false;}

/** Explicit opt-in adapter for the pinned generated JavaScript Smithy selector. */
export {createSmithyJavaScriptSelectionBackend} from './host-backends';
