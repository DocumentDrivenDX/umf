import { type ArrowFlatbufferEncodingBackend } from '../arrow/flatbuffer-encode';
import { type Document, type Diagnostic } from '../../model/types';
export interface ParquetArrowRenamePolicy {
    parquetIndex: number;
    arrowFieldPath: number[];
    name: string;
    parquetName?: string;
    uninterpretedMetadata: 'preserve-and-report';
}
export interface ParquetArrowRenameResult {
    source: Document;
    policy: ParquetArrowRenamePolicy;
    status: 'blocked' | 'transformed';
    complete: false;
    diagnostics: Diagnostic[];
    output?: Document;
    unchangedPrefixBytes?: number;
    rename?: {
        from: string[];
        to: string[];
        parquetFrom?: string[];
        parquetTo?: string[];
    };
}
/** Coordinated name edit using explicit native indexes and interpreted container roles. */
export declare function renameParquetFieldWithArrowSchema(input: Document, options: ParquetArrowRenamePolicy, backend: ArrowFlatbufferEncodingBackend): ParquetArrowRenameResult;
