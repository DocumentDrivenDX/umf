import { type PostgresqlDdlKinds } from './postgresql-ddl-kinds';
import type { PostgresqlBackend } from '../adapters/postgresql';
import { type PostgresqlCompositeClassification } from './postgresql-composite';
import { type ParquetRecordTypeClassification } from './parquet-record-type';
import { type AvroRecordTypeClassification } from './avro-record-type';
import { type Json, type Diagnostic } from '../model/types';
import { type TableSpecRecordClassification } from './tablespec-record';
import { type PostgresqlRecordClassification } from './postgresql-record';
import { type SqlServerRecordClassification } from './sqlserver-record';
import { type AvroRecordClassification } from './avro-record';
import { type ParquetRecordClassification } from './parquet-record';
export { default as structuredClassificationInspectionSchema } from '../../spec/core/structured-classification-inspection.schema.json';
export type NativeStructuredClassification = TableSpecRecordClassification | PostgresqlRecordClassification | SqlServerRecordClassification | AvroRecordClassification | ParquetRecordClassification | AvroRecordTypeClassification | ParquetRecordTypeClassification | PostgresqlCompositeClassification | PostgresqlDdlKinds;
type Binding = NativeStructuredClassification['binding'];
export interface StructuredClassificationInspection {
    operation: 'inspect-structured-classification';
    version: '1.0.0';
    status: 'classified' | 'blocked';
    receipt: NativeStructuredClassification;
    nativeContext: {
        scope: 'declared-only';
        namespaceResolution: 'explicit' | 'create-schema-context' | 'unresolved';
    } | null;
    mappings: (NativeStructuredClassification['mappings'][number] & {
        binding: Binding;
    })[];
    residuals: {
        sourcePath: string;
        sourceValue: Json;
        targetPath: null;
        outcome: 'unknown';
        reason: string;
        binding: Binding;
        recovery: {
            strategy: 'retained-source-and-receipt';
            receiptPath: '/receipt/source';
            instruction: string;
        };
    }[];
    diagnostics: Diagnostic[];
}
export declare function inspectStructuredClassification(input: NativeStructuredClassification, backend?: PostgresqlBackend): Promise<StructuredClassificationInspection>;
export declare function verifyStructuredClassificationInspection(input: StructuredClassificationInspection, backend?: PostgresqlBackend): Promise<StructuredClassificationInspection>;
