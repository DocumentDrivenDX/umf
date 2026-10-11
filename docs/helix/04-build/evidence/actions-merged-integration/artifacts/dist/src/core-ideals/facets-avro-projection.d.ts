import { type Document, type Json, type Diagnostic } from '../model/types';
import { type CoreFacetDeclaration, type CoreFacetPatch } from '../model/facets';
import { type CoreKindDeclaration } from '../model/field-kind';
export { default as facetsAvroProjectionSchema } from '../../spec/core/facets-avro-projection.schema.json';
declare const families: {
    readonly boolean: 'boolean';
    readonly int: 'integer';
    readonly long: 'integer';
    readonly float: 'float';
    readonly double: 'float';
    readonly bytes: 'binary';
    readonly string: 'string';
    readonly fixed: 'binary';
    readonly 'decimal-bytes': 'decimal';
    readonly 'decimal-fixed': 'decimal';
    readonly date: 'date';
    readonly 'time-millis': 'time';
    readonly 'time-micros': 'time';
    readonly 'timestamp-millis': 'timestamp';
    readonly 'timestamp-micros': 'timestamp';
    readonly 'local-timestamp-micros': 'timestamp';
};
export interface FacetsAvroRequest {
    id: string;
    recordName: string;
    namespace: string;
    fieldName: string;
    nativeType: keyof typeof families;
    fixedName?: string;
    fixedSize?: number;
    mode: 'strict' | 'report';
    encoding: 'native-type' | 'metadata-only' | 'carrier-only';
    profile: 'declared-schema' | 'apache-datum-writer' | 'fastavro-schemaless-writer';
    obligation: 'value-domain' | 'exact-input';
}
type Author = CoreFacetDeclaration | CoreKindDeclaration;
type Outcome = 'exact' | 'approximated' | 'unknown' | 'not-expressible';
declare const binding: {
    id: string;
    version: string;
    nativeVersion: string;
    subset: string;
};
declare const recovery: 'Recover source meaning with retained projection receipt; native-only import does not recover author intent';
export interface FacetsAvroProjection {
    operation: 'project-facets-avro';
    version: '1.0.0';
    status: 'projected' | 'blocked';
    source: Document;
    author: Author;
    request: FacetsAvroRequest;
    target?: {
        format: 'avro-schema-json';
        schema: string;
    };
    nativeSchema?: string;
    binding: typeof binding;
    diagnostics: Diagnostic[];
    mapping: {
        origin: 'authored';
        idealPath: string;
        nativePath: '/fields/0/type';
        facets: CoreFacetPatch;
        encoding: FacetsAvroRequest['encoding'];
        profile: FacetsAvroRequest['profile'];
        outcome: Outcome;
    };
    residuals: {
        path: string;
        value: Json;
        reason: string;
        outcome: Exclude<Outcome, 'exact'>;
        recovery: typeof recovery;
    }[];
}
/** Project verified ideal assertions; custom metadata never becomes an implicit validator. */
export declare function projectFacetsToAvro(input: Author, options: FacetsAvroRequest): FacetsAvroProjection;
/** Recompute the complete author projection and compare exact emitted text. */
export declare function recoverFacetsFromAvro(input: FacetsAvroProjection, nativeText: string): Document;
