import { type Json, type Diagnostic } from '../model/types';
import type { PostgresqlBackend } from '../adapters/postgresql';
import { type RecordTableSpecProjection } from './record-tablespec-projection';
import { type RecordPostgresqlProjection } from './record-postgresql-projection';
import { type RecordSqlServerProjection } from './record-sqlserver-projection';
import { type RecordAvroProjection } from './record-avro-projection';
import { type RecordParquetProjection } from './record-parquet-projection';
export { default as recordProjectionInspectionSchema } from '../../spec/core/record-projection-inspection.schema.json';
export type AuthoredRecordProjection = RecordTableSpecProjection | RecordPostgresqlProjection | RecordSqlServerProjection | RecordAvroProjection | RecordParquetProjection;
type Binding = AuthoredRecordProjection['binding'];
export interface RecordProjectionInspection {
    operation: 'inspect-record-projection';
    version: '1.0.0';
    status: 'projected' | 'blocked';
    receipt: AuthoredRecordProjection;
    mappings: {
        kind: 'record' | 'field';
        origin: 'authored';
        idealPath: string;
        nativePath: string;
        binding: Binding;
        basis: {
            kind: 'explicit-native-carrier';
            nativeType: string;
        } | {
            kind: 'explicit-record-membership';
        };
        outcome: 'exact' | 'unknown' | 'not-expressible';
    }[];
    residuals: {
        sourcePath: string;
        sourceValue: Json;
        targetPath: null;
        outcome: 'unknown' | 'not-expressible';
        reason: string;
        binding: Binding;
        recovery: {
            strategy: 'retained-receipt';
            receiptPath: '/receipt/source';
            instruction: string;
        };
    }[];
    diagnostics: Diagnostic[];
}
/** Recompute a native-specific receipt before exposing common consumer metadata. */
export declare function inspectRecordProjection(input: AuthoredRecordProjection, backend?: PostgresqlBackend): Promise<RecordProjectionInspection>;
export declare function verifyRecordProjectionInspection(input: RecordProjectionInspection, backend?: PostgresqlBackend): Promise<RecordProjectionInspection>;
