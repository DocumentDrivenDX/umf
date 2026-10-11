import type { ParquetWireValue } from './footer';
import type { Diagnostic, Json } from '../../model/types';
export declare function mapParquetIdl(value: ParquetWireValue, ref: string, diagnostics: Diagnostic[]): Json;
