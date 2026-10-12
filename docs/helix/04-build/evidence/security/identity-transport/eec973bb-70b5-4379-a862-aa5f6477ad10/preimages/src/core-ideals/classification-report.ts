import {copyJson} from '../model/json';import {type Json,type Diagnostic,UmfError} from '../model/types';
import {classifyTableSpecField,type TableSpecFieldClassification} from './tablespec-field';import {classifyPostgresqlField,type PostgresqlFieldClassification} from './postgresql-field';import {classifySqlServerField,type SqlServerFieldClassification} from './sqlserver-field';import {classifyAvroField,type AvroFieldClassification} from './avro-field';import {classifyParquetField,type ParquetFieldClassification} from './parquet-field';
import {createValidator} from '../validation/schema';import core from '../../spec/core/schema.json';import fields from '../../spec/core/field-document.schema.json';import kinds from '../../spec/core/kind-operation.schema.json';import ts from '../../spec/core/tablespec-field-classification.schema.json';import pg from '../../spec/core/postgresql-field-classification.schema.json';import ms from '../../spec/core/sqlserver-field-classification.schema.json';import avro from '../../spec/core/avro-field-classification.schema.json';import parquet from '../../spec/core/parquet-field-classification.schema.json';import schema from '../../spec/core/field-classification-inspection.schema.json';
export {default as fieldClassificationInspectionSchema} from '../../spec/core/field-classification-inspection.schema.json';
export type NativeFieldClassification=TableSpecFieldClassification|PostgresqlFieldClassification|SqlServerFieldClassification|AvroFieldClassification|ParquetFieldClassification;
type Binding=NativeFieldClassification['binding'];
export interface FieldClassificationInspection {operation:'inspect-field-classification';version:'1.0.0';status:'classified'|'blocked';receipt:NativeFieldClassification;mapping:NativeFieldClassification['mapping']&{binding:Binding};residuals:{sourcePath:string;sourceValue:Json;targetPath:null;outcome:'unknown';reason:string;binding:Binding;recovery:{strategy:'retained-source-and-receipt';receiptPath:'/receipt/source';instruction:string}}[];diagnostics:Diagnostic[]}
const validator=createValidator();for(const s of [core,fields,kinds,ts,pg,ms,avro,parquet])validator.addSchema(s);const check=validator.compile(schema);
const canonical=(v:Json):string=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v!==null&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k]!)).join(',')+'}':JSON.stringify(v);
export function inspectFieldClassification(input:NativeFieldClassification):FieldClassificationInspection {
 const receipt=copyJson(input) as unknown as NativeFieldClassification;let expected:NativeFieldClassification;
 switch(receipt?.operation){
 case 'classify-tablespec-field':expected=classifyTableSpecField(receipt.source,receipt.request);break;
 case 'classify-postgresql-field':expected=classifyPostgresqlField(receipt.source,receipt.request);break;
 case 'classify-sqlserver-field':expected=classifySqlServerField(receipt.source,receipt.request);break;
 case 'classify-avro-field':expected=classifyAvroField(receipt.source,receipt.request);break;
 case 'classify-parquet-field':expected=classifyParquetField(receipt.source,receipt.request);break;
 default:throw new UmfError('CLASSIFICATION_REPORT_OPERATION','Unsupported native Field classification');
 }
 const diagnostics=copyJson(expected.diagnostics??[]) as unknown as Diagnostic[];if(receipt.operation==='classify-tablespec-field'&&!Object.hasOwn(receipt,'diagnostics'))delete expected.diagnostics;
 if(canonical(copyJson(receipt))!==canonical(copyJson(expected)))throw new UmfError('CLASSIFICATION_REPORT_RECEIPT','Receipt differs from checked native classification');
 const report:FieldClassificationInspection={operation:'inspect-field-classification',version:'1.0.0',status:receipt.status,receipt,mapping:{...receipt.mapping,binding:receipt.binding},residuals:receipt.residuals.map(r=>({sourcePath:r.path,sourceValue:r.value,targetPath:null,outcome:'unknown',reason:r.reason,binding:receipt.binding,recovery:{strategy:'retained-source-and-receipt',receiptPath:'/receipt/source',instruction:r.recovery}})),diagnostics};
 const output=copyJson(report);if(!check(output))throw new UmfError('CLASSIFICATION_REPORT_RESULT',JSON.stringify(check.errors));return output as unknown as FieldClassificationInspection;
}
export function verifyFieldClassificationInspection(input:FieldClassificationInspection):FieldClassificationInspection {const report=copyJson(input) as unknown as FieldClassificationInspection;if(!check(report))throw new UmfError('CLASSIFICATION_REPORT_STRUCTURE','Invalid common classification report');const expected=inspectFieldClassification(report.receipt);if(canonical(copyJson(report))!==canonical(copyJson(expected)))throw new UmfError('CLASSIFICATION_REPORT_STALE','Common report differs from checked native receipt');return report;}
