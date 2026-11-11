// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Diagnostic} from '../../model/types';

/** Result metadata returned by the bounded native SHACL validation subset. */
export interface ShaclEngineReport {
 stringProfile:'umf-string-1';
 numericProfile:'umf-numeric-2';
 engine:'umf-shacl-native-subset/2';
 blankNodePolicy:'disjoint-inputs'|'shared-scope';
 status:'evaluated'|'blocked';
 complete:false;
 shapes:Document;
 data:Document;
 engineConforms?:boolean;
 report?:Document;
 diagnostics:Diagnostic[];
}

export interface ShaclEngineValidationOptions {
 id:string;
 blankNodePolicy:'disjoint-inputs'|'shared-scope';
}
