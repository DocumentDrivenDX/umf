import { type BindingPayload } from '../../extensions/binding';
import { type Document } from '../../model/types';
export interface ParquetBindingResidual {
    path: string;
    reason: string;
    choice: unknown;
}
export interface ParquetBindingReport {
    status: 'blocked' | 'reported' | 'preserved';
    logical: Document;
    binding: Document;
    target: BindingPayload['target'];
    residuals: ParquetBindingResidual[];
    nativeArchive?: Document;
}
/** Parquet's initial file-schema profile preserves physical choices as residuals. */
export declare function projectBindingToParquet(logical: Document, binding: Document, lossPolicy: 'strict' | 'report', nativeArchive?: Document): ParquetBindingReport;
