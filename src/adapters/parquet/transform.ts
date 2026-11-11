// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Diagnostic} from '../../model/types';
export interface ParquetKeyValue {key:string;value?:string}
export interface ParquetMetadataTransform {source:Document;status:'transformed'|'blocked';complete:false;diagnostics:Diagnostic[];output?:Document;added?:ParquetKeyValue[];unchangedPrefixBytes?:number}
