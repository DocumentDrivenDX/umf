// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Element,Json,Diagnostic} from '../../model/types';
export interface ParquetFieldMetadata {index:number;path:string[];definitionLevel:number;repetitionLevel:number;element:Element;nativeField:Json;}
export interface ParquetFieldMetadataResult {status:'checked'|'blocked';complete:false;fields:ParquetFieldMetadata[];diagnostics:Diagnostic[];}
