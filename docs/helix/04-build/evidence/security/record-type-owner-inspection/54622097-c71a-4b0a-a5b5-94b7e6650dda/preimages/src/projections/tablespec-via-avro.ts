import {copyJson} from '../model/json';
import {UmfError,type Document} from '../model/types';
import {projectPostgresqlToAvro,type PostgresqlAvroPolicy,type PostgresqlAvroProjection} from './postgresql-avro';
import {projectSqlServerToAvro,type SqlServerAvroPolicy,type SqlServerAvroProjection} from './sqlserver-avro';
import {projectParquetToAvro,type ParquetAvroPolicy,type ParquetAvroProjection} from './parquet-avro';
import {projectAvroToTableSpec,type AvroTableSpecPolicy,type AvroTableSpecProjection} from './avro-tablespec';
import type {ProjectionIssue} from './json-schema-protobuf';
import {createValidator} from '../validation/schema';
import tableSpecSchema from '../../spec/projections/avro-tablespec.schema.json';
const checkSecondPolicy=createValidator().compile(tableSpecSchema.properties.policy);
export type TableSpecViaAvroPolicy=({sourceKind:'postgresql';toAvro:PostgresqlAvroPolicy}|{sourceKind:'sqlserver';toAvro:SqlServerAvroPolicy}|{sourceKind:'parquet';toAvro:ParquetAvroPolicy})&{toTableSpec:AvroTableSpecPolicy};
export interface TableSpecViaAvroProjection {
 status:'blocked'|'projected';source:Document;policy:TableSpecViaAvroPolicy;
 stages:{sourceToAvro:PostgresqlAvroProjection|SqlServerAvroProjection|ParquetAvroProjection;avroToTableSpec?:AvroTableSpecProjection};
 issues:{stage:'sourceToAvro'|'avroToTableSpec';sourceDocumentPath:string;issue:ProjectionIssue}[];
 target?:Document;nativeSchema?:string;
}
/** Preserve every native source and stage-specific loss across the two explicit schema bindings. */
export function projectToTableSpecViaAvro(input:Document,options:TableSpecViaAvroPolicy):TableSpecViaAvroProjection{
 const source=copyJson(input) as Document,policy=copyJson(options) as unknown as TableSpecViaAvroPolicy;
 if(!policy||typeof policy!=='object'||Array.isArray(policy)||!['postgresql','sqlserver','parquet'].includes(policy.sourceKind)||Object.keys(policy).some(k=>!['sourceKind','toAvro','toTableSpec'].includes(k))||!policy.toAvro||!policy.toTableSpec)throw new UmfError('TABLESPEC_CHAIN_POLICY','Explicit source kind and both stage policies required');
 if(!checkSecondPolicy(policy.toTableSpec)||new Set(Object.values(policy.toTableSpec.fields).map(f=>f.name)).size!==Object.keys(policy.toTableSpec.fields).length)throw new UmfError('TABLESPEC_CHAIN_POLICY','Invalid or duplicate second-stage column bindings');
 const first=policy.sourceKind==='postgresql'?projectPostgresqlToAvro(source,policy.toAvro):policy.sourceKind==='sqlserver'?projectSqlServerToAvro(source,policy.toAvro):projectParquetToAvro(source,policy.toAvro);
 const result:TableSpecViaAvroProjection={status:'blocked',source,policy,stages:{sourceToAvro:first},issues:first.issues.map(issue=>({stage:'sourceToAvro',sourceDocumentPath:'/stages/sourceToAvro/source',issue}))};
 if(first.status==='projected'&&first.target){
  const second=projectAvroToTableSpec(first.target,policy.toTableSpec);result.stages.avroToTableSpec=second;
  result.issues.push(...second.issues.map(issue=>({stage:'avroToTableSpec' as const,sourceDocumentPath:'/stages/avroToTableSpec/source',issue})));
  if(second.status==='projected'&&second.target&&second.nativeSchema!==undefined){result.status='projected';result.target=second.target;result.nativeSchema=second.nativeSchema;}
 }
 return copyJson(result) as unknown as TableSpecViaAvroProjection;
}
