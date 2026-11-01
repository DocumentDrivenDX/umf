// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError} from '../model/errors';
import {copyJson} from '../model/json';
import type {Document} from '../model/types';
import type {PostgresqlBackend} from '../adapters/postgresql';
import type {CoreKindDeclaration} from '../model/field-kind';
import type {FieldPostgresqlRequest} from './field-postgresql-projection';
import type {RecordPostgresqlRequest} from './record-postgresql-projection';
import type {PostgresqlDdlKindRequest,PostgresqlDdlKinds} from './postgresql-ddl-kinds';
import type {NativeFieldClassification,FieldClassificationInspection} from './classification-report';
import type {AuthoredFieldProjection,FieldProjectionInspection} from './field-report';
import type {AuthoredRecordProjection,RecordProjectionInspection} from './record-report';
import type {NativeStructuredClassification,StructuredClassificationInspection} from './structured-report';

type Guard=(error:unknown)=>boolean;
type Dispatcher={['core-ideal-reports']:ReportOperations};
type PostgresqlReportRuntime={
 projectFieldToPostgresql(author:CoreKindDeclaration,request:FieldPostgresqlRequest,backend:PostgresqlBackend):Promise<unknown>;
 projectRecordToPostgresql(author:CoreKindDeclaration,request:RecordPostgresqlRequest,backend:PostgresqlBackend):Promise<unknown>;
 classifyPostgresqlDdlRecord(source:Document,request:PostgresqlDdlKindRequest,backend:PostgresqlBackend):Promise<PostgresqlDdlKinds>;
};
type ReportOperations={
 inspectFieldClassification(fields:{receipt:NativeFieldClassification}):unknown;
 verifyFieldClassificationInspection(fields:{report:FieldClassificationInspection}):unknown;
 inspectFieldProjection(fields:{receipt:AuthoredFieldProjection;fresh?:unknown}):unknown;
 verifyFieldProjectionInspection(fields:{report:FieldProjectionInspection;fresh?:unknown}):unknown;
 inspectRecordProjection(fields:{receipt:AuthoredRecordProjection;fresh?:unknown}):unknown;
 verifyRecordProjectionInspection(fields:{report:RecordProjectionInspection;fresh?:unknown}):unknown;
 inspectStructuredClassification(fields:{receipt:NativeStructuredClassification;fresh?:unknown}):unknown;
 verifyStructuredClassificationInspection(fields:{report:StructuredClassificationInspection;fresh?:unknown}):unknown;
};
type NativeErrorGuard=(error:unknown)=>boolean;
const CONTROL_CODES=new Set(['LIMIT','CAPACITY','RESOURCE_LIMIT','CANCELLED','METER_FAILURE','CANCELLATION_CHECK_FAILURE','CLOCK_CAPABILITY_REQUIRED','DEADLINE','DEADLINE_EXCEEDED']);
function translate<T>(operation:()=>unknown,isNative:NativeErrorGuard):T{
 try{return operation() as T;}catch(error){
  if(!isNative(error))throw error;
  const native=error as {code?:unknown;message?:unknown;path?:unknown};
  if(typeof native.code!=='string'||CONTROL_CODES.has(native.code))throw error;
  throw new UmfError(native.code,String(native.message??''),typeof native.path==='string'?native.path:'');
 }
}
async function translateAsync<T>(operation:()=>unknown,isNative:NativeErrorGuard):Promise<T>{
 try{return await operation() as T;}catch(error){
  if(!isNative(error))throw error;
  const native=error as {code?:unknown;message?:unknown;path?:unknown};
  if(typeof native.code!=='string'||CONTROL_CODES.has(native.code))throw error;
  throw new UmfError(native.code,String(native.message??''),typeof native.path==='string'?native.path:'');
 }
}
export function createCoreIdealReportsRustDefault(
 engine:Dispatcher,
 isNativeError:NativeErrorGuard=()=>false,
 postgresql?:PostgresqlReportRuntime,
){
 async function freshField(receipt:AuthoredFieldProjection,backend?:PostgresqlBackend):Promise<unknown|undefined>{
  if(receipt.operation!=='project-field-postgresql')return undefined;
  if(!backend)throw new UmfError('FIELD_REPORT_BACKEND','Explicit PostgreSQL backend required');
  if(!postgresql)throw new UmfError('FIELD_REPORT_BACKEND','Rust PostgreSQL projection runtime is unavailable');
  return copyJson(await postgresql.projectFieldToPostgresql(receipt.author as CoreKindDeclaration,receipt.request as FieldPostgresqlRequest,backend));
 }
 async function freshRecord(receipt:AuthoredRecordProjection,backend?:PostgresqlBackend):Promise<unknown|undefined>{
  if(receipt.operation!=='project-record-postgresql')return undefined;
  if(!backend)throw new UmfError('RECORD_REPORT_BACKEND','Explicit PostgreSQL backend required');
  if(!postgresql)throw new UmfError('RECORD_REPORT_BACKEND','Rust PostgreSQL projection runtime is unavailable');
  return copyJson(await postgresql.projectRecordToPostgresql(receipt.author as CoreKindDeclaration,receipt.request as RecordPostgresqlRequest,backend));
 }
 async function freshStructured(receipt:NativeStructuredClassification,backend?:PostgresqlBackend):Promise<unknown|undefined>{
  if(receipt.operation!=='classify-postgresql-ddl-record')return undefined;
  if(!backend)throw new UmfError('CLASSIFICATION_REPORT_BACKEND','Explicit PostgreSQL backend required');
  if(!postgresql)throw new UmfError('CLASSIFICATION_REPORT_BACKEND','Rust PostgreSQL classification runtime is unavailable');
  return copyJson(await postgresql.classifyPostgresqlDdlRecord(receipt.source as Document,receipt.request as PostgresqlDdlKindRequest,backend));
 }
 return Object.freeze({
  inspectFieldClassification(receipt:NativeFieldClassification):FieldClassificationInspection{
   return translate(()=>engine['core-ideal-reports'].inspectFieldClassification({receipt:copyJson(receipt) as unknown as NativeFieldClassification}),isNativeError);
  },
  verifyFieldClassificationInspection(report:FieldClassificationInspection):FieldClassificationInspection{
   return translate(()=>engine['core-ideal-reports'].verifyFieldClassificationInspection({report:copyJson(report) as unknown as FieldClassificationInspection}),isNativeError);
  },
  async inspectFieldProjection(receipt:AuthoredFieldProjection,backend?:PostgresqlBackend):Promise<FieldProjectionInspection>{
   const source=copyJson(receipt) as unknown as AuthoredFieldProjection,fresh=await freshField(source,backend);
   return translateAsync(()=>engine['core-ideal-reports'].inspectFieldProjection({receipt:source,...(fresh!==undefined?{fresh}:{})}),isNativeError);
  },
  async verifyFieldProjectionInspection(report:FieldProjectionInspection,backend?:PostgresqlBackend):Promise<FieldProjectionInspection>{
   const source=copyJson(report) as unknown as FieldProjectionInspection;
   try{return await translateAsync(()=>engine['core-ideal-reports'].verifyFieldProjectionInspection({report:source}),isNativeError);}
   catch(error){if(!(error instanceof UmfError)||error.code!=='FIELD_REPORT_BACKEND')throw error;}
   const fresh=await freshField(source.receipt,backend);
   return translateAsync(()=>engine['core-ideal-reports'].verifyFieldProjectionInspection({report:source,fresh}),isNativeError);
  },
  async inspectRecordProjection(receipt:AuthoredRecordProjection,backend?:PostgresqlBackend):Promise<RecordProjectionInspection>{
   const source=copyJson(receipt) as unknown as AuthoredRecordProjection,fresh=await freshRecord(source,backend);
   return translateAsync(()=>engine['core-ideal-reports'].inspectRecordProjection({receipt:source,...(fresh!==undefined?{fresh}:{})}),isNativeError);
  },
  async verifyRecordProjectionInspection(report:RecordProjectionInspection,backend?:PostgresqlBackend):Promise<RecordProjectionInspection>{
   const source=copyJson(report) as unknown as RecordProjectionInspection;
   try{return await translateAsync(()=>engine['core-ideal-reports'].verifyRecordProjectionInspection({report:source}),isNativeError);}
   catch(error){if(!(error instanceof UmfError)||error.code!=='RECORD_REPORT_BACKEND')throw error;}
   const fresh=await freshRecord(source.receipt,backend);
   return translateAsync(()=>engine['core-ideal-reports'].verifyRecordProjectionInspection({report:source,fresh}),isNativeError);
  },
  async inspectStructuredClassification(receipt:NativeStructuredClassification,backend?:PostgresqlBackend):Promise<StructuredClassificationInspection>{
   const source=copyJson(receipt) as unknown as NativeStructuredClassification,fresh=await freshStructured(source,backend);
   return translateAsync(()=>engine['core-ideal-reports'].inspectStructuredClassification({receipt:source,...(fresh!==undefined?{fresh}:{})}),isNativeError);
  },
  async verifyStructuredClassificationInspection(report:StructuredClassificationInspection,backend?:PostgresqlBackend):Promise<StructuredClassificationInspection>{
   const source=copyJson(report) as unknown as StructuredClassificationInspection;
   try{return await translateAsync(()=>engine['core-ideal-reports'].verifyStructuredClassificationInspection({report:source}),isNativeError);}
   catch(error){if(!(error instanceof UmfError)||error.code!=='CLASSIFICATION_REPORT_BACKEND')throw error;}
   const fresh=await freshStructured(source.receipt,backend);
   return translateAsync(()=>engine['core-ideal-reports'].verifyStructuredClassificationInspection({report:source,fresh}),isNativeError);
  },
 });
}
