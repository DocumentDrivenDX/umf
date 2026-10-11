import { type ArrowIpcConsistency } from './ipc-consistency';
import { type ArrowFlatbufferEncodingBackend } from './flatbuffer-encode';
import { type Document, type Diagnostic } from '../../model/types';
export interface ArrowIpcRenameResult {
    source: Document;
    document: Document;
    complete: false;
    bodyBytesPreserved: true;
    validation: ArrowIpcConsistency;
    diagnostics: Diagnostic[];
}
/** Renames a positional field without changing physical types or record/dictionary messages. */
export declare function renameArrowIpcField(document: Document, options: {
    fieldPath: number[];
    name: string;
    uninterpretedMetadata: 'preserve-and-report';
}, backend: ArrowFlatbufferEncodingBackend): ArrowIpcRenameResult;
