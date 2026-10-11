import { type Document, type Json, type Diagnostic } from '../model/types';
import { type CoreKindDeclaration } from '../model/field-kind';
export { default as tableSpecFieldClassificationSchema } from '../../spec/core/tablespec-field-classification.schema.json';
export interface TableSpecFieldRequest {
    column: number;
    mode: 'strict' | 'report';
    author?: CoreKindDeclaration;
}
declare const binding: {
    readonly id: 'umf.tablespec.field';
    readonly version: '1.0.0';
    readonly nativeVersion: '647e8e566ad78b864282ec65c0b0b2237aa63084';
    readonly subset: 'Table version 1.0 captured column member role; no scalar/container/native validation claim';
};
export interface TableSpecFieldClassification {
    operation: 'classify-tablespec-field';
    version: '1.0.0';
    status: 'classified' | 'blocked';
    source: Document;
    target?: Document;
    request: TableSpecFieldRequest;
    binding: typeof binding;
    diagnostics?: Diagnostic[];
    mapping: {
        origin: 'classified';
        kind: 'field';
        idealPath: string;
        nativePath: string;
        nativeFragment: Json;
        basis: 'checked-native-column-membership';
        outcome: 'exact' | 'unknown';
    };
    residuals: {
        path: string;
        value: Json;
        reason: string;
        recovery: 'Original assertion and native fragment retained in source; reclassify with corrected provenance';
    }[];
}
/** Classify one checked native member. Does not infer scalar family, cardinality, requiredness or author intent. */
export declare function classifyTableSpecField(input: Document, options: TableSpecFieldRequest): TableSpecFieldClassification & {
    diagnostics: Diagnostic[];
};
/** Recompute the native basis and reject classification receipts after any target edit. */
export declare function verifyTableSpecFieldClassification(input: TableSpecFieldClassification, current: Document): TableSpecFieldClassification;
