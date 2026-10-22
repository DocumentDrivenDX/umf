import { type Document, type Diagnostic } from '../../model/types';
export interface ShaclEngineReport {
    stringProfile: 'umf-string-1';
    numericProfile: 'umf-numeric-2';
    engine: 'rdf-validate-shacl@0.6.5';
    blankNodePolicy: 'disjoint-inputs' | 'shared-scope';
    status: 'evaluated' | 'blocked';
    complete: false;
    shapes: Document;
    data: Document;
    engineConforms?: boolean;
    report?: Document;
    diagnostics: Diagnostic[];
}
/** Engine evidence, NOT a UMF conformance verdict. All input meaning remains recoverable. */
export declare function proposeShaclEngineValidation(shapes: Document, data: Document, options: {
    id: string;
    blankNodePolicy: 'disjoint-inputs' | 'shared-scope';
}): Promise<ShaclEngineReport>;
