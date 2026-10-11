import { type Document, type Diagnostic } from '../../model/types';
import type { RdfNode, RdfLiteral } from '../rdf';
import { type ShaclPath } from './index';
type Term = RdfNode | RdfLiteral;
export interface ShaclMetadataField {
    predicate: string;
    values: Term[];
    quadIndexes: number[];
}
export interface ShaclShapeMetadataNode {
    node: RdfNode;
    annotations: ShaclMetadataField[];
    constraints: ShaclMetadataField[];
    controls: ShaclMetadataField[];
    uninterpreted: ShaclMetadataField[];
    path: {
        status: 'absent';
    } | {
        status: 'compiled';
        value: ShaclPath;
    } | {
        status: 'invalid';
        message: string;
    };
}
export interface ShaclShapeMetadata {
    profile: 'shacl-metadata-1';
    complete: false;
    source: Document;
    blankNodeScope: string;
    shape: ShaclShapeMetadataNode;
    properties: ShaclShapeMetadataNode[];
    diagnostics: Diagnostic[];
}
/** Declared metadata only. Constraint grouping does not assert validity, inference or enforcement. */
export declare function getShaclShapeMetadata(document: Document, shape: RdfNode): ShaclShapeMetadata;
export {};
