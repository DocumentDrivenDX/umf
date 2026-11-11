// SPDX-License-Identifier: MIT OR Apache-2.0
import type {LinkmlImportContext} from './imports';
import type {Document,Diagnostic} from '../../model/types';
import {LINKML_MERGE_COLLECTIONS} from './package';
export { LINKML_MERGE_COLLECTIONS };
export interface LinkmlImportMergeReport {
 context:LinkmlImportContext;mode:'view'|'merge-imports';status:'candidate'|'blocked';complete:false;
 closure:string[];selections:{collection:string;name:string;winner:string;shadowed:string[]}[];
 candidate?:Document;diagnostics:Diagnostic[];
}
