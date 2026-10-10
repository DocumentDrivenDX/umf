import { type Document, type Element, type CoreItemTypeReference, type Validation } from './types';
import { Registry } from '../registry/registry';
export interface CoreElementQuery {
    references: 'none' | 'transitive';
    modules?: string[];
    namespaces?: string[];
    names?: string[];
    scalarTypes?: string[];
    cardinalities?: string[];
    identities?: {
        module: string;
        element: string;
    }[];
}
export interface CoreElementSelectionEntry {
    module: string;
    namespace: string;
    path: string;
    element: Element;
    includedBy: 'match' | 'reference';
}
export interface CoreElementSelection {
    scope: 'core-elements';
    referenceScope: 'explicit-core-references' | 'explicit-core-references-and-item-types' | 'explicit-core-references-item-types-members-and-keys';
    source: Document;
    query: CoreElementQuery;
    sourceValidation: Validation;
    selection: CoreElementSelectionEntry[];
    boundaryReferences: {
        from: {
            module: string;
            element: string;
        };
        reference: NonNullable<Element['references']>[number];
        targetPath: string;
    }[];
    boundaryMembers?: {
        from: {
            module: string;
            element: string;
        };
        reference: CoreItemTypeReference;
        path: string;
        targetPath: string;
    }[];
    boundaryKeyFields?: {
        from: {
            module: string;
            element: string;
        };
        key: string;
        reference: CoreItemTypeReference;
        path: string;
        targetPath: string;
    }[];
    boundaryItemTypes?: {
        from: {
            module: string;
            element: string;
        };
        reference: CoreItemTypeReference;
        path: string;
        targetPath: string;
    }[];
}
/** Select core metadata with full source context and explicitly scoped reference traversal. */
export declare function selectCoreElements(input: Document, queryInput: CoreElementQuery, registry?: Registry): CoreElementSelection;
