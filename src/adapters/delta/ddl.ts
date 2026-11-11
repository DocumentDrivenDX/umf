// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Json} from '../../model/types';
import type {DELTA_DEFINITION_EXTENSION,deltaDefinitionPackage} from './package';
export {DELTA_DEFINITION_EXTENSION,deltaDefinitionPackage} from './package';
export interface DeltaDefinition {
  profile:'databricks-managed-delta/0.1';
  name:string[];
  clusterBy:string[];
  partitionBy:string[];
  properties:Record<string,string>;
}
export interface SparkDelta4Disposition {
  sourcePointer:string;
  authoredValue:Json;
  outcome:'sql'|'writer-setting'|'unrealized-performance-hint'|'none-authored';
  explanation:string;
}
export interface SparkDelta4DDLRealization {
  targetProfile:'spark-delta4/0.1';
  realizationProfile:'umf.delta.spark-realization/0.1.0';
  target:{profile:'spark-delta4/0.1';kind:'relation';relation:string[];location:string;identitySha256:string}
    | {profile:'spark-delta4/0.1';kind:'delta-path';path:string;identitySha256:string};
  sql:string;
  definition:DeltaDefinition;
  schemaJson:string;
  sourceSha256:string;
  schemaSha256:string;
  writerSettings:{key:string;value:string}[];
  dispositions:SparkDelta4Disposition[];
  qualification:string;
}
const properties=new Set(['delta.dataSkippingStatsColumns','delta.targetFileSize','delta.parquet.compression.codec','delta.deletedFileRetentionDuration','delta.logRetentionDuration']);
export type SparkDelta4TargetBinding = {
  /** Existing local relation plus path; useful where a stable catalog relation is available. */
  kind:'relation';
  relation:readonly string[];
  location:string;
} | {
  /** Direct Delta path relation avoids creating a metastore binding for local installations. */
  kind:'delta-path';
  path:string;
}
