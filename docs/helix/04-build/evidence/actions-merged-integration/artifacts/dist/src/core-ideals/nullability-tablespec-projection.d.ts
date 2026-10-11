import { type Document, type Json, type Diagnostic } from '../model/types';
import { type CoreNullabilityDeclaration } from '../model/nullability';
export { default as nullabilityTableSpecProjectionSchema } from '../../spec/core/nullability-tablespec-projection.schema.json';
export interface NullabilityTableSpecRequest {
    id: string;
    tableName: string;
    columnName: string;
    nativeType: 'BOOLEAN' | 'INTEGER' | 'DECIMAL' | 'FLOAT' | 'TEXT' | 'VARCHAR' | 'CHAR' | 'DATE' | 'DATETIME' | 'TIMESTAMP';
    mode: 'strict' | 'report';
    profile: 'runtime-model' | 'checked-schema' | 'unresolved';
    context: string | null;
    carrier: 'null-value' | 'unresolved';
}
declare const binding: {
    id: string;
    version: string;
    nativeVersion: string;
    subset: string;
};
export interface NullabilityTableSpecProjection {
    operation: 'project-nullability-tablespec';
    version: '1.0.0';
    status: 'projected' | 'blocked';
    source: Document;
    author: CoreNullabilityDeclaration;
    request: NullabilityTableSpecRequest;
    target?: Document;
    binding: typeof binding;
    diagnostics?: Diagnostic[];
    mapping: {
        origin: 'authored';
        idealPath: string;
        nativePath: string | null;
        nullability: 'required' | 'absent-allowed' | 'unspecified';
        encoding: 'boolean' | 'context-map' | 'omitted';
        context: string | null;
        carrier: NullabilityTableSpecRequest['carrier'];
        profile: NullabilityTableSpecRequest['profile'];
        outcome: 'exact' | 'unknown' | 'not-expressible';
    };
    profileNotes: {
        profile: 'checked-schema';
        code: 'SCALAR_BOOLEAN_REJECTED';
        message: string;
    }[];
    residuals: {
        path: string;
        value: Json;
        reason: string;
        outcome: 'unknown' | 'not-expressible';
        recovery: 'Recover source meaning with retained projection receipt; native-only import does not recover author intent';
    }[];
}
export declare function projectNullabilityToTableSpec(input: CoreNullabilityDeclaration, options: NullabilityTableSpecRequest): NullabilityTableSpecProjection & {
    diagnostics: Diagnostic[];
};
/** Recover retained author meaning only when the receipt and supplied native target still agree. */
export declare function recoverNullabilityFromTableSpec(input: NullabilityTableSpecProjection, nativeText: string): Document;
