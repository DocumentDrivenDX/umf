// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Diagnostic} from '../../model/types';
export interface OdcsRenameResult {
 source:Document;status:'candidate'|'blocked';complete:false;candidate?:Document;
 changes:{path:string;before:string;after:string}[];diagnostics:Diagnostic[];
}
