import { type Document, type Json, type Diagnostic } from '../model/types';
import { type CoreKindDeclaration } from '../model/field-kind';
import { type TableSpecFieldClassification } from './tablespec-field';
export { default as tableSpecRecordClassificationSchema } from '../../spec/core/tablespec-record-classification.schema.json';
export interface TableSpecRecordRequest {
    recordModule: string;
    recordId: string;
    mode: 'strict' | 'report';
    authors?: CoreKindDeclaration[];
}
declare const binding: {
    readonly id: 'umf.tablespec.record';
    readonly version: '1.0.0';
    readonly nativeVersion: '647e8e566ad78b864282ec65c0b0b2237aa63084';
    readonly subset: 'Captured table defines named column members; contextual groups and execution remain native';
};
type Mapping = Omit<TableSpecFieldClassification['mapping'], 'kind' | 'basis'> & {
    kind: 'field' | 'record';
    basis: 'checked-native-column-membership' | 'checked-native-table-members';
};
export interface TableSpecRecordClassification {
    operation: 'classify-tablespec-record';
    version: '1.0.0';
    status: 'classified' | 'blocked';
    source: Document;
    target?: Document;
    request: TableSpecRecordRequest;
    binding: typeof binding;
    mappings: Mapping[];
    residuals: {
        path: string;
        value: Json;
        reason: string;
        recovery: 'Source and native fragments retained; resolve conflict then recompute whole record classification';
    }[];
    diagnostics: Diagnostic[];
}
/** One record and its named members; atomic across every column. Physical/context groupings stay native. */
export declare function classifyTableSpecRecord(input: Document, options: TableSpecRecordRequest): TableSpecRecordClassification;
/** Whole-record receipt verification; native or authored changes require recomputation. */
export declare function verifyTableSpecRecordClassification(input: TableSpecRecordClassification, current: Document): TableSpecRecordClassification;
