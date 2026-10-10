import { type Document } from '../model/types';
import { type PostgresqlAvroPolicy, type PostgresqlAvroProjection } from './postgresql-avro';
import { type SqlServerAvroPolicy, type SqlServerAvroProjection } from './sqlserver-avro';
import { type ParquetAvroPolicy, type ParquetAvroProjection } from './parquet-avro';
import { type AvroTableSpecPolicy, type AvroTableSpecProjection } from './avro-tablespec';
import type { ProjectionIssue } from './json-schema-protobuf';
export type TableSpecViaAvroPolicy = ({
    sourceKind: 'postgresql';
    toAvro: PostgresqlAvroPolicy;
} | {
    sourceKind: 'sqlserver';
    toAvro: SqlServerAvroPolicy;
} | {
    sourceKind: 'parquet';
    toAvro: ParquetAvroPolicy;
}) & {
    toTableSpec: AvroTableSpecPolicy;
};
export interface TableSpecViaAvroProjection {
    status: 'blocked' | 'projected';
    source: Document;
    policy: TableSpecViaAvroPolicy;
    stages: {
        sourceToAvro: PostgresqlAvroProjection | SqlServerAvroProjection | ParquetAvroProjection;
        avroToTableSpec?: AvroTableSpecProjection;
    };
    issues: {
        stage: 'sourceToAvro' | 'avroToTableSpec';
        sourceDocumentPath: string;
        issue: ProjectionIssue;
    }[];
    target?: Document;
    nativeSchema?: string;
}
/** Preserve every native source and stage-specific loss across the two explicit schema bindings. */
export declare function projectToTableSpecViaAvro(input: Document, options: TableSpecViaAvroPolicy): TableSpecViaAvroProjection;
