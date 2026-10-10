import { type Document, type Diagnostic } from '../../model/types';
import type { NativeJson } from '../../model/native-json';
export interface OdcsReferenceResult {
    source: Document;
    reference: string;
    usage: 'element' | 'foreignKey';
    status: 'resolved' | 'blocked';
    complete: false;
    target?: {
        path: string;
        notation: 'id' | 'name';
        node: NativeJson;
    };
    diagnostics: Diagnostic[];
}
/** Resolve local ODCS identifiers/names. These are not JSON Pointer array indexes. */
export declare function resolveOdcsReference(document: Document, options: {
    reference: string;
    usage: 'element' | 'foreignKey';
}): OdcsReferenceResult;
