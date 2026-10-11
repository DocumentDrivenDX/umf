import { type Json, type Diagnostic } from '../model/types';
import type { PostgresqlBackend } from '../adapters/postgresql';
import { type FieldTableSpecProjection } from './field-tablespec-projection';
import { type FieldPostgresqlProjection } from './field-postgresql-projection';
import { type FieldSqlServerProjection } from './field-sqlserver-projection';
import { type FieldAvroProjection } from './field-avro-projection';
import { type FieldParquetProjection } from './field-parquet-projection';
export { default as fieldProjectionInspectionSchema } from '../../spec/core/field-projection-inspection.schema.json';
export type AuthoredFieldProjection = FieldTableSpecProjection | FieldPostgresqlProjection | FieldSqlServerProjection | FieldAvroProjection | FieldParquetProjection;
type Binding = AuthoredFieldProjection['binding'];
export interface FieldProjectionInspection {
    operation: 'inspect-field-projection';
    version: '1.0.0';
    status: 'projected' | 'blocked';
    receipt: AuthoredFieldProjection;
    mapping: {
        origin: 'authored';
        idealPath: string;
        nativePath: string;
        binding: Binding;
        basis: {
            kind: 'explicit-native-carrier';
            nativeType: string;
        };
        outcome: 'exact' | 'unknown' | 'not-expressible';
    };
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
export declare function inspectFieldProjection(input: AuthoredFieldProjection, backend?: PostgresqlBackend): Promise<FieldProjectionInspection>;
export declare function verifyFieldProjectionInspection(input: FieldProjectionInspection, backend?: PostgresqlBackend): Promise<FieldProjectionInspection>;
