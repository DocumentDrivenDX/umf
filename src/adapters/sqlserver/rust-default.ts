// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Diagnostic} from '../../model/types';
import type {NativeJson} from '../../model/native-json';
import {UmfError} from '../../model/errors';
import type {Registry} from '../../registry/registry';
import {sqlserverPackage,sqlserverCardinalityPackage} from './package';
import {sqlserverNullabilityPackage} from '../../core-ideals/nullability-sqlserver-package';
import {sqlserverKeysPackage} from '../../core-ideals/key-sqlserver-package';
import {sqlserverRelationshipsPackage} from '../../core-ideals/relationship-sqlserver-package';
import type {SqlServerColumnMetadata,SqlServerConstraintMetadata,SqlServerIndexMetadata} from './index';
import type {SqlServerFacetTypeInspection,inspectSqlServerFacetType} from './facet-type';
import type {SqlServerFacetPredicateInspection} from './facet-predicate-types';
import type {SqlServerFacetConstraintsInspection} from './facet-constraints';
import type {SqlServerFieldClassification,SqlServerFieldRequest} from '../../core-ideals/sqlserver-field';
import type {SqlServerRecordClassification,SqlServerRecordRequest} from '../../core-ideals/sqlserver-record';
import type {SqlServerCardinalityClassification,SqlServerCardinalityRequest} from '../../core-ideals/cardinality-sqlserver';
import type {SqlServerNullabilityClassification,SqlServerNullabilityRequest} from '../../core-ideals/nullability-sqlserver';
import type {SqlServerKeyClassification,SqlServerKeyRequest} from '../../core-ideals/key-sqlserver';

import type {SqlServerRelationshipClassification,SqlServerRelationshipRequest} from '../../core-ideals/relationship-sqlserver';
import type {SqlServerFacetClassification,SqlServerFacetRequest} from '../../core-ideals/facets-sqlserver';
import {sqlserverFacetsPackage} from '../../core-ideals/facets-sqlserver-package';
import type {Validation} from "../../model/types";

type ImportSqlServerCatalog = (text: string, options: { id: string; }) => Document;
type InspectSqlServer = (document: Document) => Validation;
type ExportSqlServerCatalog = (document: Document) => string;
type ProposeSqlServerCatalogEdit = (document: Document, path: string, text: string) => Document;
type GetSqlServerColumnMetadata = (document: Document) => SqlServerColumnMetadata[];
type GetSqlServerConstraintMetadata = (document: Document) => SqlServerConstraintMetadata;
type GetSqlServerIndexMetadata = (document: Document) => SqlServerIndexMetadata;
type InspectSqlServerFacetConstraints = (input: Document, columnPath: string) => SqlServerFacetConstraintsInspection;

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
  classifyNullability(fields:{source:Document;request:SqlServerNullabilityRequest}):unknown;
  verifyNullabilityClassification(fields:{receipt:SqlServerNullabilityClassification;current:Document}):unknown;
  recoverNullabilitySource(fields:{receipt:SqlServerNullabilityClassification;current:Document}):unknown;
  classifyKeys(fields:{source:Document;request:SqlServerKeyRequest}):unknown;
  verifyKeyClassification(fields:{receipt:SqlServerKeyClassification;current:Document}):unknown;
  recoverKeySource(fields:{receipt:SqlServerKeyClassification;current:Document}):unknown;
  recoverRelationshipSource(fields:{receipt:SqlServerRelationshipClassification;current:Document}):unknown;
  verifyRelationshipClassification(fields:{receipt:SqlServerRelationshipClassification;current:Document}):unknown;
  classifyRelationships(fields:{source:Document;request:SqlServerRelationshipRequest}):unknown;
  classifyFacets(fields:{source:Document;request:SqlServerFacetRequest}):unknown;
  verifyFacetClassification(fields:{receipt:SqlServerFacetClassification;current:Document}):unknown;
  recoverFacetSource(fields:{receipt:SqlServerFacetClassification;current:Document}):unknown;
 }
}

type NativeCoreErrorGuard=(error:unknown)=>boolean;
const CONTROL_CODES=new Set(['RESOURCE_LIMIT','CANCELLED','METER_FAILURE','CANCELLATION_CHECK_FAILURE','CLOCK_CAPABILITY_REQUIRED','DEADLINE']);

/** Route the current SQL Server catalog API through the native wire family. */
export function createSqlServerRustDefault(engine:SqlServerNativeFamilyEngine,isNativeUmfCoreError:NativeCoreErrorGuard=()=>false,createRegistry:()=>Registry){
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
  sqlserverRegistry():Registry{return createRegistry().register(sqlserverPackage,(payload)=>call<Diagnostic[]>(()=>engine.sqlserver.inspectPayload({payload}))).register(sqlserverCardinalityPackage).register(sqlserverNullabilityPackage).register(sqlserverKeysPackage).register(sqlserverRelationshipsPackage).register(sqlserverFacetsPackage);},
  importSqlServerCatalog(text:string,options:Parameters<ImportSqlServerCatalog>[1]):ReturnType<ImportSqlServerCatalog>{return call(()=>engine.sqlserver.import({source:text,id:options.id}) as ReturnType<ImportSqlServerCatalog>);},
  inspectSqlServer(document:Parameters<InspectSqlServer>[0]):ReturnType<InspectSqlServer>{return call(()=>engine.sqlserver.inspect({document}) as ReturnType<InspectSqlServer>);},
  exportSqlServerCatalog(document:Parameters<ExportSqlServerCatalog>[0]):ReturnType<ExportSqlServerCatalog>{return call(()=>engine.sqlserver.export({document}) as ReturnType<ExportSqlServerCatalog>);},
  getSqlServerColumnMetadata(document:Parameters<GetSqlServerColumnMetadata>[0]):SqlServerColumnMetadata[]{return call(()=>engine.sqlserver.columns({document}) as SqlServerColumnMetadata[]);},
  getSqlServerConstraintMetadata(document:Parameters<GetSqlServerConstraintMetadata>[0]):SqlServerConstraintMetadata{return call(()=>engine.sqlserver.constraints({document}) as SqlServerConstraintMetadata);},
  getSqlServerIndexMetadata(document:Parameters<GetSqlServerIndexMetadata>[0]):SqlServerIndexMetadata{return call(()=>engine.sqlserver.indexes({document}) as SqlServerIndexMetadata);},
  proposeSqlServerCatalogEdit(document:Parameters<ProposeSqlServerCatalogEdit>[0],path:Parameters<ProposeSqlServerCatalogEdit>[1],text:Parameters<ProposeSqlServerCatalogEdit>[2]):ReturnType<ProposeSqlServerCatalogEdit>{return call(()=>engine.sqlserver.edit({document,path,text}) as ReturnType<ProposeSqlServerCatalogEdit>);},
  inspectSqlServerFacetType(input:Parameters<typeof inspectSqlServerFacetType>[0]):SqlServerFacetTypeInspection{return call(()=>engine.sqlserver.facetType({native:input}) as SqlServerFacetTypeInspection);},
  inspectSqlServerFacetPredicate(input:unknown,columnName:string):SqlServerFacetPredicateInspection{
   return call(()=>engine.sqlserver.facetPredicate({source:input,columnName}) as SqlServerFacetPredicateInspection);
  },
  inspectSqlServerFacetConstraints(document:Parameters<InspectSqlServerFacetConstraints>[0],columnPath:Parameters<InspectSqlServerFacetConstraints>[1]):SqlServerFacetConstraintsInspection{return call(()=>engine.sqlserver.facetConstraints({document,columnPath}) as SqlServerFacetConstraintsInspection);},
  classifySqlServerField(source:Document,request:SqlServerFieldRequest):SqlServerFieldClassification{return call(()=>engine.sqlserver.classifyField({source,request}) as SqlServerFieldClassification);},
  verifySqlServerFieldClassification(receipt:SqlServerFieldClassification,current:Document):SqlServerFieldClassification{return call(()=>engine.sqlserver.verifyFieldClassification({receipt,current}) as SqlServerFieldClassification);},
  recoverSqlServerFieldCapture(receipt:SqlServerFieldClassification,current:Document):string{return call(()=>engine.sqlserver.recoverFieldCapture({receipt,current}) as string);},
  classifySqlServerRecord(source:Document,request:SqlServerRecordRequest):SqlServerRecordClassification{return call(()=>engine.sqlserver.classifyRecord({source,request}) as SqlServerRecordClassification);},
  verifySqlServerRecordClassification(receipt:SqlServerRecordClassification,current:Document):SqlServerRecordClassification{return call(()=>engine.sqlserver.verifyRecordClassification({receipt,current}) as SqlServerRecordClassification);},
  recoverSqlServerRecordCapture(receipt:SqlServerRecordClassification,current:Document):string{return call(()=>engine.sqlserver.recoverRecordCapture({receipt,current}) as string);},
  classifySqlServerCardinality(source:Document,request:SqlServerCardinalityRequest):SqlServerCardinalityClassification{return call(()=>engine.sqlserver.classifyCardinality({source,request}) as SqlServerCardinalityClassification);},
  verifySqlServerCardinalityClassification(receipt:SqlServerCardinalityClassification,current:Document):SqlServerCardinalityClassification{return call(()=>engine.sqlserver.verifyCardinalityClassification({receipt,current}) as SqlServerCardinalityClassification);},
  recoverSqlServerCardinalitySource(receipt:SqlServerCardinalityClassification,current:Document):string{return call(()=>engine.sqlserver.recoverCardinalitySource({receipt,current}) as string);},
  classifySqlServerNullability(source:Document,request:SqlServerNullabilityRequest):SqlServerNullabilityClassification{return call(()=>engine.sqlserver.classifyNullability({source,request}) as SqlServerNullabilityClassification);},
  verifySqlServerNullabilityClassification(receipt:SqlServerNullabilityClassification,current:Document):SqlServerNullabilityClassification{return call(()=>engine.sqlserver.verifyNullabilityClassification({receipt,current}) as SqlServerNullabilityClassification);},
  recoverSqlServerNullabilitySource(receipt:SqlServerNullabilityClassification,current:Document):string{return call(()=>engine.sqlserver.recoverNullabilitySource({receipt,current}) as string);},
  classifySqlServerKeys(source:Document,request:SqlServerKeyRequest):SqlServerKeyClassification{return call(()=>engine.sqlserver.classifyKeys({source,request}) as SqlServerKeyClassification);},
  verifySqlServerKeyClassification(receipt:SqlServerKeyClassification,current:Document):SqlServerKeyClassification{return call(()=>engine.sqlserver.verifyKeyClassification({receipt,current}) as SqlServerKeyClassification);},
  recoverSqlServerKeySource(receipt:SqlServerKeyClassification,current:Document):string{return call(()=>engine.sqlserver.recoverKeySource({receipt,current}) as string);},
  classifySqlServerRelationships(source:Document,request:SqlServerRelationshipRequest):SqlServerRelationshipClassification{return call(()=>engine.sqlserver.classifyRelationships({source,request}) as SqlServerRelationshipClassification);},
  verifySqlServerRelationshipClassification(receipt:SqlServerRelationshipClassification,current:Document):SqlServerRelationshipClassification{return call(()=>engine.sqlserver.verifyRelationshipClassification({receipt,current}) as SqlServerRelationshipClassification);},
  recoverSqlServerRelationshipSource(receipt:SqlServerRelationshipClassification,current:Document):string{return call(()=>engine.sqlserver.recoverRelationshipSource({receipt,current}) as string);},
  classifySqlServerFacets(source:Document,request:SqlServerFacetRequest):SqlServerFacetClassification{return call(()=>engine.sqlserver.classifyFacets({source,request}) as SqlServerFacetClassification);},
  verifySqlServerFacetClassification(receipt:SqlServerFacetClassification,current:Document):SqlServerFacetClassification{return call(()=>engine.sqlserver.verifyFacetClassification({receipt,current}) as SqlServerFacetClassification);},
  recoverSqlServerFacetSource(receipt:SqlServerFacetClassification,current:Document):string{return call(()=>engine.sqlserver.recoverFacetSource({receipt,current}) as string);},
 });
}
