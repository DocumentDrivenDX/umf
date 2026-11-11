// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document} from '../model/types';
import type {AvroTableSpecPolicy,AvroTableSpecProjection} from './avro-tablespec-types';
import type {ParquetAvroPolicy,ParquetAvroProjection} from './parquet-avro-types';
import type {PostgresqlAvroPolicy,PostgresqlAvroProjection} from './postgresql-avro-types';
import type {SqlServerAvroPolicy,SqlServerAvroProjection} from './sqlserver-avro-types';
import type {ProjectionIssue} from './projection-types';
export type TableSpecViaAvroPolicy=({sourceKind:'postgresql';toAvro:PostgresqlAvroPolicy}|{sourceKind:'sqlserver';toAvro:SqlServerAvroPolicy}|{sourceKind:'parquet';toAvro:ParquetAvroPolicy})&{toTableSpec:AvroTableSpecPolicy};
export interface TableSpecViaAvroProjection {status:'blocked'|'projected';source:Document;policy:TableSpecViaAvroPolicy;stages:{sourceToAvro:PostgresqlAvroProjection|SqlServerAvroProjection|ParquetAvroProjection;avroToTableSpec?:AvroTableSpecProjection};issues:{stage:'sourceToAvro'|'avroToTableSpec';sourceDocumentPath:string;issue:ProjectionIssue}[];target?:Document;nativeSchema?:string;}
