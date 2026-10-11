import { type Json, type Diagnostic } from '../model/types';
import { type TableSpecFieldClassification } from './tablespec-field';
import { type PostgresqlFieldClassification } from './postgresql-field';
import { type SqlServerFieldClassification } from './sqlserver-field';
import { type AvroFieldClassification } from './avro-field';
import { type ParquetFieldClassification } from './parquet-field';
export { default as fieldClassificationInspectionSchema } from '../../spec/core/field-classification-inspection.schema.json';
export type NativeFieldClassification = TableSpecFieldClassification | PostgresqlFieldClassification | SqlServerFieldClassification | AvroFieldClassification | ParquetFieldClassification;
type Binding = NativeFieldClassification['binding'];
export interface FieldClassificationInspection {
    operation: 'inspect-field-classification';
    version: '1.0.0';
    status: 'classified' | 'blocked';
    receipt: NativeFieldClassification;
    mapping: NativeFieldClassification['mapping'] & {
        binding: Binding;
    };
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
export declare function inspectFieldClassification(input: NativeFieldClassification): FieldClassificationInspection;
export declare function verifyFieldClassificationInspection(input: FieldClassificationInspection): FieldClassificationInspection;
