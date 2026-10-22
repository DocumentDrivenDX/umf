import {copyJson} from '../model/json';import {type Json,type Diagnostic,UmfError} from '../model/types';import type {PostgresqlBackend} from '../adapters/postgresql';
import {projectFieldToTableSpec,type FieldTableSpecProjection} from './field-tablespec-projection';import {projectFieldToPostgresql,type FieldPostgresqlProjection} from './field-postgresql-projection';import {projectFieldToSqlServer,type FieldSqlServerProjection} from './field-sqlserver-projection';import {projectFieldToAvro,type FieldAvroProjection} from './field-avro-projection';import {projectFieldToParquet,type FieldParquetProjection} from './field-parquet-projection';
import {createValidator} from '../validation/schema';import core from '../../spec/core/schema.json';import fields from '../../spec/core/field-document.schema.json';import kinds from '../../spec/core/kind-operation.schema.json';import ts from '../../spec/core/field-tablespec-projection.schema.json';import pg from '../../spec/core/field-postgresql-projection.schema.json';import ms from '../../spec/core/field-sqlserver-projection.schema.json';import avro from '../../spec/core/field-avro-projection.schema.json';import parquet from '../../spec/core/field-parquet-projection.schema.json';import schema from '../../spec/core/field-projection-inspection.schema.json';
export {default as fieldProjectionInspectionSchema} from '../../spec/core/field-projection-inspection.schema.json';
export type AuthoredFieldProjection=FieldTableSpecProjection|FieldPostgresqlProjection|FieldSqlServerProjection|FieldAvroProjection|FieldParquetProjection;
type Binding=AuthoredFieldProjection['binding'];
export interface FieldProjectionInspection {operation:'inspect-field-projection';version:'1.0.0';status:'projected'|'blocked';receipt:AuthoredFieldProjection;mapping:{origin:'authored';idealPath:string;nativePath:string;binding:Binding;basis:{kind:'explicit-native-carrier';nativeType:string};outcome:'exact'|'unknown'|'not-expressible'};residuals:{sourcePath:string;sourceValue:Json;targetPath:null;outcome:'unknown'|'not-expressible';reason:string;binding:Binding;recovery:{strategy:'retained-receipt';receiptPath:'/receipt/source';instruction:string}}[];diagnostics:Diagnostic[]}
const validator=createValidator();for(const s of [core,fields,kinds,ts,pg,ms,avro,parquet])validator.addSchema(s);const check=validator.compile(schema);
const canonical=(v:Json):string=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v!==null&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k]!)).join(',')+'}':JSON.stringify(v);
/** Recompute a native-specific receipt before exposing common consumer metadata. */
export async function inspectFieldProjection(input:AuthoredFieldProjection,backend?:PostgresqlBackend):Promise<FieldProjectionInspection> {
 const receipt=copyJson(input) as unknown as AuthoredFieldProjection;let expected:AuthoredFieldProjection;
 switch(receipt?.operation){
 case 'project-field-tablespec':expected=projectFieldToTableSpec(receipt.author,receipt.request);break;
 case 'project-field-postgresql':if(!backend)throw new UmfError('FIELD_REPORT_BACKEND','Explicit PostgreSQL backend required');expected=await projectFieldToPostgresql(receipt.author,receipt.request,backend);break;
 case 'project-field-sqlserver':expected=projectFieldToSqlServer(receipt.author,receipt.request);break;
 case 'project-field-avro':expected=projectFieldToAvro(receipt.author,receipt.request);break;
 case 'project-field-parquet':expected=projectFieldToParquet(receipt.author,receipt.request);break;
 default:throw new UmfError('FIELD_REPORT_OPERATION','Unsupported authored Field projection operation');
 }
 const diagnostics=copyJson(expected.diagnostics??[]) as unknown as Diagnostic[];
 if(receipt.operation==='project-field-tablespec'&&!Object.hasOwn(receipt,'diagnostics'))delete expected.diagnostics;
 if(canonical(copyJson(receipt))!==canonical(copyJson(expected)))throw new UmfError('FIELD_REPORT_RECEIPT','Adapter receipt differs from recomputed projection');
 const report:FieldProjectionInspection={operation:'inspect-field-projection',version:'1.0.0',status:receipt.status,receipt,mapping:{...receipt.mapping,binding:receipt.binding,basis:{kind:'explicit-native-carrier',nativeType:receipt.request.nativeType}},residuals:receipt.residuals.map(r=>({sourcePath:r.path,sourceValue:r.value,targetPath:null,outcome:r.outcome,reason:r.reason,binding:receipt.binding,recovery:{strategy:'retained-receipt',receiptPath:'/receipt/source',instruction:r.recovery}})),diagnostics};
 const output=copyJson(report);if(!check(output))throw new UmfError('FIELD_REPORT_RESULT',JSON.stringify(check.errors));return output as unknown as FieldProjectionInspection;
}
export async function verifyFieldProjectionInspection(input:FieldProjectionInspection,backend?:PostgresqlBackend):Promise<FieldProjectionInspection>{const report=copyJson(input) as unknown as FieldProjectionInspection;if(!check(report))throw new UmfError('FIELD_REPORT_STRUCTURE','Invalid common report');const expected=await inspectFieldProjection(report.receipt,backend);if(canonical(copyJson(report))!==canonical(copyJson(expected)))throw new UmfError('FIELD_REPORT_STALE','Common report differs from checked adapter receipt');return report;}
