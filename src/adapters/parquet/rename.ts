// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Diagnostic} from '../../model/types';
export interface ParquetRenameResult {source:Document;status:'transformed'|'blocked';complete:false;diagnostics:Diagnostic[];output?:Document;rename?:{index:number;from:string[];to:string[]};unchangedPrefixBytes?:number}
