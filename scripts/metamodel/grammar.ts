// SPDX-License-Identifier: MIT OR Apache-2.0
// Legacy build-test names; the production grammar is owned by umf-metamodel.
import {rustMetamodelValue} from './rust';
export type Shape=Record<string,any>;
export function checkShape(shape:any):void {rustMetamodelValue('shape',{shape,targets:[],checkOnly:true});}
export function emitShape(shape:any,targets:Set<string>):any {return rustMetamodelValue('shape',{shape,targets:[...targets],checkOnly:false});}
