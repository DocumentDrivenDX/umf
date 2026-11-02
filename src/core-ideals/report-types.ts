// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Json,Diagnostic} from '../model/types';
import type {TableSpecFieldClassification} from './tablespec-field';
import type {PostgresqlFieldClassification} from './postgresql-field';
import type {SqlServerFieldClassification} from './sqlserver-field';
import type {AvroFieldClassification} from './avro-field';
import type {ParquetFieldClassification} from './parquet-field';
import type {TableSpecRecordClassification} from './tablespec-record';
import type {PostgresqlRecordClassification} from './postgresql-record';
import type {SqlServerRecordClassification} from './sqlserver-record';
import type {AvroRecordClassification} from './avro-record';
import type {ParquetRecordClassification} from './parquet-record';
import type {AvroRecordTypeClassification} from './avro-record-type';
import type {ParquetRecordTypeClassification} from './parquet-record-type';
import type {PostgresqlCompositeClassification} from './postgresql-composite';
import type {PostgresqlDdlKinds} from './postgresql-ddl-kinds';
import type {FieldTableSpecProjection} from './field-tablespec-projection';
import type {FieldPostgresqlProjection} from './field-postgresql-projection';
import type {FieldSqlServerProjection} from './field-sqlserver-projection';
import type {FieldAvroProjection} from './field-avro-projection';
import type {FieldParquetProjection} from './field-parquet-projection';
import type {RecordTableSpecProjection} from './record-tablespec-projection';
import type {RecordPostgresqlProjection} from './record-postgresql-projection';
import type {RecordSqlServerProjection} from './record-sqlserver-projection';
import type {RecordAvroProjection} from './record-avro-projection';
import type {RecordParquetProjection} from './record-parquet-projection';

export type NativeFieldClassification = TableSpecFieldClassification | PostgresqlFieldClassification | SqlServerFieldClassification | AvroFieldClassification | ParquetFieldClassification;
type FieldBinding = NativeFieldClassification['binding'];
export interface FieldClassificationInspection {operation:'inspect-field-classification';version:'1.0.0';status:'classified'|'blocked';receipt:NativeFieldClassification;mapping:NativeFieldClassification['mapping']&{binding:FieldBinding};residuals:{sourcePath:string;sourceValue:Json;targetPath:null;outcome:'unknown';reason:string;binding:FieldBinding;recovery:{strategy:'retained-source-and-receipt';receiptPath:'/receipt/source';instruction:string}}[];diagnostics:Diagnostic[]}

export type AuthoredFieldProjection = FieldTableSpecProjection | FieldPostgresqlProjection | FieldSqlServerProjection | FieldAvroProjection | FieldParquetProjection;
type FieldProjectionBinding = AuthoredFieldProjection['binding'];
export interface FieldProjectionInspection {operation:'inspect-field-projection';version:'1.0.0';status:'projected'|'blocked';receipt:AuthoredFieldProjection;mapping:{origin:'authored';idealPath:string;nativePath:string;binding:FieldProjectionBinding;basis:{kind:'explicit-native-carrier';nativeType:string};outcome:'exact'|'unknown'|'not-expressible'};residuals:{sourcePath:string;sourceValue:Json;targetPath:null;outcome:'unknown'|'not-expressible';reason:string;binding:FieldProjectionBinding;recovery:{strategy:'retained-receipt';receiptPath:'/receipt/source';instruction:string}}[];diagnostics:Diagnostic[]}

export type AuthoredRecordProjection = RecordTableSpecProjection | RecordPostgresqlProjection | RecordSqlServerProjection | RecordAvroProjection | RecordParquetProjection;
type RecordProjectionBinding = AuthoredRecordProjection['binding'];
export interface RecordProjectionInspection {operation:'inspect-record-projection';version:'1.0.0';status:'projected'|'blocked';receipt:AuthoredRecordProjection;mappings:{kind:'record'|'field';origin:'authored';idealPath:string;nativePath:string;binding:RecordProjectionBinding;basis:{kind:'explicit-native-carrier';nativeType:string}|{kind:'explicit-record-membership'};outcome:'exact'|'unknown'|'not-expressible'}[];residuals:{sourcePath:string;sourceValue:Json;targetPath:null;outcome:'unknown'|'not-expressible';reason:string;binding:RecordProjectionBinding;recovery:{strategy:'retained-receipt';receiptPath:'/receipt/source';instruction:string}}[];diagnostics:Diagnostic[]}

export type NativeStructuredClassification = TableSpecRecordClassification | PostgresqlRecordClassification | SqlServerRecordClassification | AvroRecordClassification | ParquetRecordClassification | AvroRecordTypeClassification | ParquetRecordTypeClassification | PostgresqlCompositeClassification | PostgresqlDdlKinds;
type StructuredClassificationBinding = NativeStructuredClassification['binding'];
export interface StructuredClassificationInspection {operation:'inspect-structured-classification';version:'1.0.0';status:'classified'|'blocked';receipt:NativeStructuredClassification;nativeContext:{scope:'declared-only';namespaceResolution:'explicit'|'create-schema-context'|'unresolved'}|null;mappings:(NativeStructuredClassification['mappings'][number]&{binding:StructuredClassificationBinding})[];residuals:{sourcePath:string;sourceValue:Json;targetPath:null;outcome:'unknown';reason:string;binding:StructuredClassificationBinding;recovery:{strategy:'retained-source-and-receipt';receiptPath:'/receipt/source';instruction:string}}[];diagnostics:Diagnostic[]}
