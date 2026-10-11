import { type Document, type Diagnostic } from '../../model/types';
export declare function renameSparkField(document: Document, options: {
    fieldPointer: string;
    name: string;
    uninterpretedMetadata: 'preserve-and-report';
}): {
    source: Document;
    document: Document;
    validation: import("../..").Validation;
    complete: false;
    renamedCollationPaths: {
        from: string;
        to: string;
    }[];
    diagnostics: Diagnostic[];
};
