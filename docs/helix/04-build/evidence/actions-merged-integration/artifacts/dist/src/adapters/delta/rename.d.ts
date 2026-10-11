import { type Document, type Diagnostic } from '../../model/types';
/** Candidate context edit only; applying it requires a transaction and external-state checks. */
export declare function renameDeltaMappedField(source: Document, options: {
    fieldPointer: string;
    name: string;
    uninterpretedReferences: 'preserve-and-report';
}): {
    source: Document;
    document: Document;
    complete: false;
    partitionUpdates: {
        index: number;
        from: string;
        to: string;
    }[];
    validation: import("../..").Validation;
    diagnostics: Diagnostic[];
};
