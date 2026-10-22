// SPDX-License-Identifier: MIT OR Apache-2.0
// Compatibility exports delegate all executable compiler behavior to Rust.
import {rustMetamodelValue} from './rust';
export const vocabulary='umf.metamodel';
export function parseModel(text:string):any{return rustMetamodelValue('parse',text);}
export function compileModel(model:any):any{return rustMetamodelValue('compile',model);}
