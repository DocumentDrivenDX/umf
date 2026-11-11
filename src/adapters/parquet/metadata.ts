// SPDX-License-Identifier: MIT OR Apache-2.0
import type {ParquetWireValue} from './footer';
import type {Document,Diagnostic,Json} from '../../model/types';
export interface ParquetMetadataInspection {source:Document;status:'mapped'|'blocked';complete:false;diagnostics:Diagnostic[];wire?:ParquetWireValue;metadata?:Json}
