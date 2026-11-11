// SPDX-License-Identifier: MIT OR Apache-2.0
import type {ParquetSchemaInspection} from './schema';
import type {Json} from '../../model/types';
export interface ParquetLogicalAnnotation {index:number;origin:'logical'|'converted';name:string;parameters:Json;validation:'checked'|'uninterpreted'|'invalid'}
export interface ParquetLogicalInspection extends ParquetSchemaInspection {annotations?:ParquetLogicalAnnotation[]}
