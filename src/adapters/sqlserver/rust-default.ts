// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Diagnostic,ExtensionPackage} from '../../model/types';
import type {NativeJson} from '../../model/native-json';
import {UmfError} from '../../model/errors';
import {Registry} from '../../registry/registry';
import manifest from '../../../spec/extensions/sqlserver/package.json';
import cardinalityManifest from '../../../spec/extensions/sqlserver-cardinality/package.json';
import type {importSqlServerCatalog,inspectSqlServer,exportSqlServerCatalog,proposeSqlServerCatalogEdit,getSqlServerColumnMetadata,getSqlServerConstraintMetadata,getSqlServerIndexMetadata,SqlServerColumnMetadata,SqlServerConstraintMetadata,SqlServerIndexMetadata} from './index';
import type {SqlServerFacetTypeInspection,inspectSqlServerFacetType} from './facet-type';
import type {SqlServerFacetPredicateInspection,inspectSqlServerFacetPredicate} from './facet-predicate';
import type {SqlServerFacetConstraintsInspection,inspectSqlServerFacetConstraints} from './facet-constraints';
import type {SqlServerFieldClassification,SqlServerFieldRequest} from '../../core-ideals/sqlserver-field';
import type {SqlServerRecordClassification,SqlServerRecordRequest} from '../../core-ideals/sqlserver-record';
import type {SqlServerCardinalityClassification,SqlServerCardinalityRequest} from '../../core-ideals/cardinality-sqlserver';

export interface SqlServerNativeFamilyEngine {
 sqlserver:{
  import(fields:{source:string;id:string}):unknown;
  inspectPayload(fields:{payload:unknown}):unknown;
  inspect(fields:{document:Document}):unknown;
  export(fields:{document:Document}):unknown;
  columns(fields:{document:Document}):unknown;
  constraints(fields:{document:Document}):unknown;
  indexes(fields:{document:Document}):unknown;
  edit(fields:{document:Document;path:string;text:string}):unknown;
  facetType(fields:{native:NativeJson}):unknown;
  facetPredicate(fields:{source:unknown;columnName:string}):unknown;
  facetConstraints(fields:{document:Document;columnPath:string}):unknown;
  classifyField(fields:{source:Document;request:SqlServerFieldRequest}):unknown;
  verifyFieldClassification(fields:{receipt:SqlServerFieldClassification;current:Document}):unknown;
  recoverFieldCapture(fields:{receipt:SqlServerFieldClassification;current:Document}):unknown;
  classifyRecord(fields:{source:Document;request:SqlServerRecordRequest}):unknown;
  verifyRecordClassification(fields:{receipt:SqlServerRecordClassification;current:Document}):unknown;
  recoverRecordCapture(fields:{receipt:SqlServerRecordClassification;current:Document}):unknown;
  classifyCardinality(fields:{source:Document;request:SqlServerCardinalityRequest}):unknown;
  verifyCardinalityClassification(fields:{receipt:SqlServerCardinalityClassification;current:Document}):unknown;
  recoverCardinalitySource(fields:{receipt:SqlServerCardinalityClassification;current:Document}):unknown;
 }
}

type NativeCoreErrorGuard=(error:unknown)=>boolean;
const CONTROL_CODES=new Set(['RESOURCE_LIMIT','CANCELLED','METER_FAILURE','CANCELLATION_CHECK_FAILURE','CLOCK_CAPABILITY_REQUIRED','DEADLINE']);

/** Route the current SQL Server catalog API through the native wire family. */
export function createSqlServerRustDefault(engine:SqlServerNativeFamilyEngine,isNativeUmfCoreError:NativeCoreErrorGuard=()=>false,createRegistry:()=>Registry=()=>new Registry()){
 const call=<T>(operation:()=>unknown):T=>{
  try{return operation() as T;}
  catch(error){
   if(!isNativeUmfCoreError(error)||CONTROL_CODES.has((error as {code?:string})?.code??''))throw error;
   const native=error as {code?:unknown;message?:unknown;path?:unknown};
   if(typeof native.code==='string'&&(native.code.startsWith('SQLSERVER_')||native.code==='REQUEST'||native.code==='JSON_SCHEMA_SYNTAX'||native.code==='JSON_SCHEMA_POINTER'||native.code.startsWith('NATIVE_YAML_')))throw new UmfError(native.code,String(native.message??''),typeof native.path==='string'?native.path:'');
   throw error;
  }
 };
 return Object.freeze({
  sqlserverRegistry():Registry{return createRegistry().register(manifest as unknown as ExtensionPackage,(payload)=>call<Diagnostic[]>(()=>engine.sqlserver.inspectPayload({payload}))).register(cardinalityManifest as unknown as ExtensionPackage);},
  importSqlServerCatalog(text:string,options:Parameters<typeof importSqlServerCatalog>[1]):ReturnType<typeof importSqlServerCatalog>{return call(()=>engine.sqlserver.import({source:text,id:options.id}) as ReturnType<typeof importSqlServerCatalog>);},
  inspectSqlServer(document:Parameters<typeof inspectSqlServer>[0]):ReturnType<typeof inspectSqlServer>{return call(()=>engine.sqlserver.inspect({document}) as ReturnType<typeof inspectSqlServer>);},
  exportSqlServerCatalog(document:Parameters<typeof exportSqlServerCatalog>[0]):ReturnType<typeof exportSqlServerCatalog>{return call(()=>engine.sqlserver.export({document}) as ReturnType<typeof exportSqlServerCatalog>);},
  getSqlServerColumnMetadata(document:Parameters<typeof getSqlServerColumnMetadata>[0]):SqlServerColumnMetadata[]{return call(()=>engine.sqlserver.columns({document}) as SqlServerColumnMetadata[]);},
  getSqlServerConstraintMetadata(document:Parameters<typeof getSqlServerConstraintMetadata>[0]):SqlServerConstraintMetadata{return call(()=>engine.sqlserver.constraints({document}) as SqlServerConstraintMetadata);},
  getSqlServerIndexMetadata(document:Parameters<typeof getSqlServerIndexMetadata>[0]):SqlServerIndexMetadata{return call(()=>engine.sqlserver.indexes({document}) as SqlServerIndexMetadata);},
  proposeSqlServerCatalogEdit(document:Parameters<typeof proposeSqlServerCatalogEdit>[0],path:Parameters<typeof proposeSqlServerCatalogEdit>[1],text:Parameters<typeof proposeSqlServerCatalogEdit>[2]):ReturnType<typeof proposeSqlServerCatalogEdit>{return call(()=>engine.sqlserver.edit({document,path,text}) as ReturnType<typeof proposeSqlServerCatalogEdit>);},
  inspectSqlServerFacetType(input:Parameters<typeof inspectSqlServerFacetType>[0]):SqlServerFacetTypeInspection{return call(()=>engine.sqlserver.facetType({native:input}) as SqlServerFacetTypeInspection);},
  inspectSqlServerFacetPredicate(input:Parameters<typeof inspectSqlServerFacetPredicate>[0],columnName:Parameters<typeof inspectSqlServerFacetPredicate>[1]):SqlServerFacetPredicateInspection{
   return call(()=>engine.sqlserver.facetPredicate({source:input,columnName}) as SqlServerFacetPredicateInspection);
  },
  inspectSqlServerFacetConstraints(document:Parameters<typeof inspectSqlServerFacetConstraints>[0],columnPath:Parameters<typeof inspectSqlServerFacetConstraints>[1]):SqlServerFacetConstraintsInspection{return call(()=>engine.sqlserver.facetConstraints({document,columnPath}) as SqlServerFacetConstraintsInspection);},
  classifySqlServerField(source:Document,request:SqlServerFieldRequest):SqlServerFieldClassification{return call(()=>engine.sqlserver.classifyField({source,request}) as SqlServerFieldClassification);},
  verifySqlServerFieldClassification(receipt:SqlServerFieldClassification,current:Document):SqlServerFieldClassification{return call(()=>engine.sqlserver.verifyFieldClassification({receipt,current}) as SqlServerFieldClassification);},
  recoverSqlServerFieldCapture(receipt:SqlServerFieldClassification,current:Document):string{return call(()=>engine.sqlserver.recoverFieldCapture({receipt,current}) as string);},
  classifySqlServerRecord(source:Document,request:SqlServerRecordRequest):SqlServerRecordClassification{return call(()=>engine.sqlserver.classifyRecord({source,request}) as SqlServerRecordClassification);},
  verifySqlServerRecordClassification(receipt:SqlServerRecordClassification,current:Document):SqlServerRecordClassification{return call(()=>engine.sqlserver.verifyRecordClassification({receipt,current}) as SqlServerRecordClassification);},
  recoverSqlServerRecordCapture(receipt:SqlServerRecordClassification,current:Document):string{return call(()=>engine.sqlserver.recoverRecordCapture({receipt,current}) as string);},
  classifySqlServerCardinality(source:Document,request:SqlServerCardinalityRequest):SqlServerCardinalityClassification{return call(()=>engine.sqlserver.classifyCardinality({source,request}) as SqlServerCardinalityClassification);},
  verifySqlServerCardinalityClassification(receipt:SqlServerCardinalityClassification,current:Document):SqlServerCardinalityClassification{return call(()=>engine.sqlserver.verifyCardinalityClassification({receipt,current}) as SqlServerCardinalityClassification);},
  recoverSqlServerCardinalitySource(receipt:SqlServerCardinalityClassification,current:Document):string{return call(()=>engine.sqlserver.recoverCardinalitySource({receipt,current}) as string);},
 });
}
