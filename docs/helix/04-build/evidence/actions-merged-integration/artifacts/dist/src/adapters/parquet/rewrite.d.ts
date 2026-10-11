import type { Document } from '../../model/types';
import type { ParquetWireValue } from './footer';
/** Caller must check footer signatures, crypto, unknown fields and operation-specific semantics. */
export declare function rewriteParquetFooter(source: Document, tree: ParquetWireValue): {
    output: Document;
    unchangedPrefixBytes: number;
};
export declare function unsafeParquetMetadata(v: any): boolean;
