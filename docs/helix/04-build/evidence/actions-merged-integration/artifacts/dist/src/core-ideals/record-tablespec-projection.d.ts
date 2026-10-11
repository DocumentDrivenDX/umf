import { type Document, type Diagnostic } from '../model/types';
import { type CoreKindDeclaration } from '../model/field-kind';
import { type FieldTableSpecRequest, type FieldTableSpecProjection } from './field-tablespec-projection';
export { default as recordTableSpecProjectionSchema } from '../../spec/core/record-tablespec-projection.schema.json';
export interface RecordTableSpecRequest {
    id: string;
    tableName: string;
    mode: 'strict' | 'report';
    fields: {
        author: CoreKindDeclaration;
        columnName: string;
        nativeType: FieldTableSpecRequest['nativeType'];
    }[];
}
declare const binding: {
    readonly id: 'umf.core.record.tablespec';
    readonly version: '1.0.0';
    readonly nativeVersion: '647e8e566ad78b864282ec65c0b0b2237aa63084';
    readonly subset: 'Authored record with explicit flat field carriers; no value-domain or execution equivalence';
};
export interface RecordTableSpecProjection {
    operation: 'project-record-tablespec';
    version: '1.0.0';
    status: 'projected' | 'blocked';
    source: Document;
    author: CoreKindDeclaration;
    request: RecordTableSpecRequest;
    binding: typeof binding;
    target?: Document;
    mappings: {
        origin: 'authored';
        kind: 'record' | 'field';
        idealPath: string;
        nativePath: string;
        outcome: 'exact' | 'unknown' | 'not-expressible';
    }[];
    residuals: FieldTableSpecProjection['residuals'];
    diagnostics: Diagnostic[];
}
export declare function projectRecordToTableSpec(input: CoreKindDeclaration, options: RecordTableSpecRequest): RecordTableSpecProjection;
export declare function recoverRecordFromTableSpec(input: RecordTableSpecProjection, nativeText: string): Document;
