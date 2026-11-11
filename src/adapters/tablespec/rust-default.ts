// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Diagnostic,Document,ExtensionPackage} from '../../model/types';
import type {NativeJson} from '../../model/native-json';
import {UmfError} from '../../model/errors';
import type {Registry} from '../../registry/registry';
import manifest from '../../../spec/extensions/tablespec/package.json';

import type {TableSpecFieldClassification,TableSpecFieldRequest} from '../../core-ideals/tablespec-field';
import type {TableSpecRecordClassification,TableSpecRecordRequest} from '../../core-ideals/tablespec-record-package';
import type {TableSpecCardinalityClassification,TableSpecCardinalityRequest} from '../../core-ideals/cardinality-tablespec';
import type {TableSpecNullabilityClassification,TableSpecNullabilityRequest} from '../../core-ideals/nullability-tablespec';
import type {TableSpecKeyClassification,TableSpecKeyRequest} from '../../core-ideals/key-tablespec';
import type {KeyTableSpecProjection,KeyTableSpecRequest} from '../../core-ideals/key-tablespec-projection';
import type {CoreKeyDeclaration} from '../../model/keys';
import type {TableSpecFacetClassification,TableSpecFacetRequest} from '../../core-ideals/facets-tablespec';
import type {FacetsTableSpecProjection,FacetsTableSpecRequest} from '../../core-ideals/facets-tablespec-projection';
import type {CoreFacetDeclaration} from '../../model/facets';
import type {TableSpecRelationshipClassification,TableSpecRelationshipRequest} from '../../core-ideals/relationship-tablespec';
import type {FieldTableSpecProjection,FieldTableSpecRequest} from '../../core-ideals/field-tablespec-projection';
import type {RecordTableSpecProjection,RecordTableSpecRequest} from '../../core-ideals/record-tablespec-projection';
import type {CardinalityTableSpecProjection,CardinalityTableSpecRequest} from '../../core-ideals/cardinality-tablespec-projection';
import type {NullabilityTableSpecProjection,NullabilityTableSpecRequest} from '../../core-ideals/nullability-tablespec-projection';
import type {CoreCardinalityDeclaration} from '../../model/cardinality';
import type {CoreNullabilityDeclaration} from '../../model/nullability';
import type {CoreKindDeclaration} from '../../model/field-kind';
import type {Validation} from "../../model/types";

type ImportTableSpec = (text: string, options: { id: string; format: "json" | "yaml"; }) => Document;
type ExportTableSpec = (document: Document) => string;
type GetTableSpecColumn = (document: Document, index: number) => NativeJson;
type GetTableSpecTable = (document: Document) => NativeJson;
type EditTableSpecColumn = (document: Document, index: number, changes: Record<string, NativeJson>) => Document;
type EditTableSpecTable = (document: Document, changes: Record<string, NativeJson>) => Document;
type ImportTableSpecBundle = (files: Record<string, string>, options: { id: string; }) => Document;
type ExportTableSpecBundle = (document: Document) => Record<string, string>;
type InspectTableSpec = (document: Document) => Validation;

export interface TableSpecNativeFamilyEngine {
 tablespec:{
  importTableSpec(fields:{source:string;id:string;format:'json'|'yaml'}):unknown;
  exportTableSpec(fields:{document:Document}):unknown;
  inspectTableSpec(fields:{document:Document}):unknown;
  getTableSpecColumn(fields:{document:Document;index:number}):unknown;
  getTableSpecTable(fields:{document:Document}):unknown;
  editTableSpecColumn(fields:{document:Document;index:number;changes:Record<string,NativeJson>}):unknown;
  editTableSpecTable(fields:{document:Document;changes:Record<string,NativeJson>}):unknown;
  importTableSpecBundle(fields:{files:Record<string,string>;id:string}):unknown;
  exportTableSpecBundle(fields:{document:Document}):unknown;
  classifyTableSpecField(fields:{document:Document;request:TableSpecFieldRequest}):unknown;
  projectFieldToTableSpec(fields:{author:CoreKindDeclaration;request:FieldTableSpecRequest}):unknown;
  recoverFieldFromTableSpec(fields:{receipt:FieldTableSpecProjection;nativeText:string}):unknown;
  verifyTableSpecFieldClassification(fields:{receipt:TableSpecFieldClassification;current:Document}):unknown;
  classifyTableSpecRecord(fields:{document:Document;request:TableSpecRecordRequest}):unknown;
  projectRecordToTableSpec(fields:{author:CoreKindDeclaration;request:RecordTableSpecRequest}):unknown;
  recoverRecordFromTableSpec(fields:{receipt:RecordTableSpecProjection;nativeText:string}):unknown;
  projectCardinalityToTableSpec(fields:{author:CoreCardinalityDeclaration;request:CardinalityTableSpecRequest}):unknown;
  recoverCardinalityFromTableSpec(fields:{receipt:CardinalityTableSpecProjection;nativeText:string}):unknown;
  projectNullabilityToTableSpec(fields:{author:CoreNullabilityDeclaration;request:NullabilityTableSpecRequest}):unknown;
  recoverNullabilityFromTableSpec(fields:{receipt:NullabilityTableSpecProjection;nativeText:string}):unknown;
  verifyTableSpecRecordClassification(fields:{receipt:TableSpecRecordClassification;current:Document}):unknown;
  classifyTableSpecCardinality(fields:{document:Document;request:TableSpecCardinalityRequest}):unknown;
  verifyTableSpecCardinalityClassification(fields:{receipt:TableSpecCardinalityClassification;current:Document}):unknown;
  recoverTableSpecCardinalitySource(fields:{receipt:TableSpecCardinalityClassification;current:Document}):unknown;
  classifyTableSpecNullability(fields:{document:Document;request:TableSpecNullabilityRequest}):unknown;
  verifyTableSpecNullabilityClassification(fields:{receipt:TableSpecNullabilityClassification;current:Document}):unknown;
  recoverTableSpecNullabilitySource(fields:{receipt:TableSpecNullabilityClassification;current:Document}):unknown;
  classifyTableSpecKeys(fields:{document:Document;request:TableSpecKeyRequest}):unknown;
  verifyTableSpecKeyClassification(fields:{receipt:TableSpecKeyClassification;current:Document}):unknown;
  recoverTableSpecKeySource(fields:{receipt:TableSpecKeyClassification;current:Document}):unknown;
  projectKeysToTableSpec(fields:{source:Document;authors:CoreKeyDeclaration[];request:KeyTableSpecRequest}):unknown;
  verifyKeysTableSpecProjection(fields:{receipt:KeyTableSpecProjection;current:Document}):unknown;
  recoverKeysTableSpecIdeal(fields:{receipt:KeyTableSpecProjection;current:Document}):unknown;
  classifyTableSpecFacets(fields:{document:Document;request:TableSpecFacetRequest}):unknown;
  verifyTableSpecFacetClassification(fields:{receipt:TableSpecFacetClassification;current:Document}):unknown;
  recoverTableSpecFacetSource(fields:{receipt:TableSpecFacetClassification;current:Document}):unknown;
  projectFacetsToTableSpec(fields:{author:CoreFacetDeclaration|CoreKindDeclaration;request:FacetsTableSpecRequest}):unknown;
  recoverFacetsFromTableSpec(fields:{receipt:FacetsTableSpecProjection;nativeText:string}):unknown;
  classifyTableSpecRelationships(fields:{document:Document;request:TableSpecRelationshipRequest}):unknown;
  verifyTableSpecRelationshipClassification(fields:{receipt:TableSpecRelationshipClassification;current:Document}):unknown;
  recoverTableSpecRelationshipSource(fields:{receipt:TableSpecRelationshipClassification;current:Document}):unknown;
 }
}
type NativeCoreErrorGuard=(error:unknown)=>boolean;
const CONTROL_CODES=new Set(['RESOURCE_LIMIT','CANCELLED','METER_FAILURE','CANCELLATION_CHECK_FAILURE','CLOCK_CAPABILITY_REQUIRED','DEADLINE']);

/** Preserve TableSpec's synchronous public API while routing its semantics through Rust. */
export function createTableSpecRustDefault(engine:TableSpecNativeFamilyEngine,isNativeUmfCoreError:NativeCoreErrorGuard=()=>false,createRegistry:()=>Registry){
 const call=<T>(operation:()=>unknown):T=>{
  try{return operation() as T;}
  catch(error){
   if(!isNativeUmfCoreError(error)||CONTROL_CODES.has((error as {code?:string})?.code??''))throw error;
   const native=error as {code?:unknown;message?:unknown;path?:unknown};
   if(typeof native.code==='string'&&(native.code.startsWith('TABLESPEC_')||native.code.startsWith('CORE_KIND_')||native.code.startsWith('CORE_CARDINALITY_')||native.code.startsWith('CORE_NULLABILITY_')||native.code.startsWith('CORE_MEMBERS_')||native.code.startsWith('FIELD_TABLESPEC_')||native.code.startsWith('RECORD_TABLESPEC_')||native.code.startsWith('KEY_TABLESPEC_')||native.code.startsWith('FACETS_TABLESPEC_')||native.code.startsWith('CARDINALITY_TABLESPEC_')||native.code.startsWith('NULLABILITY_TABLESPEC_')||native.code.startsWith('FIELD_CLASSIFICATION_')||native.code==='FIELD_KIND_CONFLICT'||native.code==='REQUEST'||native.code==='JSON_SCHEMA_SYNTAX'||native.code==='JSON_SCHEMA_POINTER'||native.code.startsWith('NATIVE_YAML_')))throw new UmfError(native.code,String(native.message??''),typeof native.path==='string'?native.path:'');
   throw error;
  }
 };
 return Object.freeze({
  tablespecRegistry():Registry{return createRegistry().register(manifest as unknown as ExtensionPackage);},
  importTableSpec(text:string,options:Parameters<ImportTableSpec>[1]):ReturnType<ImportTableSpec>{return call(()=>engine.tablespec.importTableSpec({source:text,id:options.id,format:options.format}) as ReturnType<ImportTableSpec>);},
  exportTableSpec(document:Parameters<ExportTableSpec>[0]):ReturnType<ExportTableSpec>{return call(()=>engine.tablespec.exportTableSpec({document}) as ReturnType<ExportTableSpec>);},
  inspectTableSpec(document:Document):ReturnType<InspectTableSpec>{return call(()=>engine.tablespec.inspectTableSpec({document}) as ReturnType<InspectTableSpec>);},
  getTableSpecColumn(document:Parameters<GetTableSpecColumn>[0],index:Parameters<GetTableSpecColumn>[1]):ReturnType<GetTableSpecColumn>{return call(()=>engine.tablespec.getTableSpecColumn({document,index}) as ReturnType<GetTableSpecColumn>);},
  getTableSpecTable(document:Parameters<GetTableSpecTable>[0]):ReturnType<GetTableSpecTable>{return call(()=>engine.tablespec.getTableSpecTable({document}) as ReturnType<GetTableSpecTable>);},
  editTableSpecColumn(document:Parameters<EditTableSpecColumn>[0],index:Parameters<EditTableSpecColumn>[1],changes:Parameters<EditTableSpecColumn>[2]):ReturnType<EditTableSpecColumn>{return call(()=>engine.tablespec.editTableSpecColumn({document,index,changes}) as ReturnType<EditTableSpecColumn>);},
  editTableSpecTable(document:Parameters<EditTableSpecTable>[0],changes:Parameters<EditTableSpecTable>[1]):ReturnType<EditTableSpecTable>{return call(()=>engine.tablespec.editTableSpecTable({document,changes}) as ReturnType<EditTableSpecTable>);},
  importTableSpecBundle(files:Parameters<ImportTableSpecBundle>[0],options:Parameters<ImportTableSpecBundle>[1]):ReturnType<ImportTableSpecBundle>{return call(()=>engine.tablespec.importTableSpecBundle({files,id:options.id}) as ReturnType<ImportTableSpecBundle>);},
  exportTableSpecBundle(document:Parameters<ExportTableSpecBundle>[0]):ReturnType<ExportTableSpecBundle>{return call(()=>engine.tablespec.exportTableSpecBundle({document}) as ReturnType<ExportTableSpecBundle>);},
  projectFieldToTableSpec(author:CoreKindDeclaration,request:FieldTableSpecRequest):FieldTableSpecProjection & {diagnostics:Diagnostic[]}{return call(()=>engine.tablespec.projectFieldToTableSpec({author,request}) as FieldTableSpecProjection & {diagnostics:Diagnostic[]});},
  recoverFieldFromTableSpec(receipt:FieldTableSpecProjection,nativeText:string):Document{return call(()=>engine.tablespec.recoverFieldFromTableSpec({receipt,nativeText}) as Document);},
  projectRecordToTableSpec(author:CoreKindDeclaration,request:RecordTableSpecRequest):RecordTableSpecProjection{return call(()=>engine.tablespec.projectRecordToTableSpec({author,request}) as RecordTableSpecProjection);},
  recoverRecordFromTableSpec(receipt:RecordTableSpecProjection,nativeText:string):Document{return call(()=>engine.tablespec.recoverRecordFromTableSpec({receipt,nativeText}) as Document);},
  projectCardinalityToTableSpec(author:CoreCardinalityDeclaration,request:CardinalityTableSpecRequest):CardinalityTableSpecProjection & {diagnostics:Diagnostic[]}{return call(()=>engine.tablespec.projectCardinalityToTableSpec({author,request}) as CardinalityTableSpecProjection & {diagnostics:Diagnostic[]});},
  recoverCardinalityFromTableSpec(receipt:CardinalityTableSpecProjection,nativeText:string):Document{return call(()=>engine.tablespec.recoverCardinalityFromTableSpec({receipt,nativeText}) as Document);},
  projectNullabilityToTableSpec(author:CoreNullabilityDeclaration,request:NullabilityTableSpecRequest):NullabilityTableSpecProjection & {diagnostics:Diagnostic[]}{return call(()=>engine.tablespec.projectNullabilityToTableSpec({author,request}) as NullabilityTableSpecProjection & {diagnostics:Diagnostic[]});},
  recoverNullabilityFromTableSpec(receipt:NullabilityTableSpecProjection,nativeText:string):Document{return call(()=>engine.tablespec.recoverNullabilityFromTableSpec({receipt,nativeText}) as Document);},
  classifyTableSpecField(document:Document,request:TableSpecFieldRequest):TableSpecFieldClassification & {diagnostics:Diagnostic[]}{return call(()=>engine.tablespec.classifyTableSpecField({document,request}) as TableSpecFieldClassification & {diagnostics:Diagnostic[]});},
  verifyTableSpecFieldClassification(receipt:TableSpecFieldClassification,current:Document):TableSpecFieldClassification{return call(()=>engine.tablespec.verifyTableSpecFieldClassification({receipt,current}) as TableSpecFieldClassification);},
  classifyTableSpecRecord(document:Document,request:TableSpecRecordRequest):TableSpecRecordClassification{return call(()=>engine.tablespec.classifyTableSpecRecord({document,request}) as TableSpecRecordClassification);},
  verifyTableSpecRecordClassification(receipt:TableSpecRecordClassification,current:Document):TableSpecRecordClassification{return call(()=>engine.tablespec.verifyTableSpecRecordClassification({receipt,current}) as TableSpecRecordClassification);},
  classifyTableSpecCardinality(document:Document,request:TableSpecCardinalityRequest):TableSpecCardinalityClassification{return call(()=>engine.tablespec.classifyTableSpecCardinality({document,request}) as TableSpecCardinalityClassification);},
  verifyTableSpecCardinalityClassification(receipt:TableSpecCardinalityClassification,current:Document):TableSpecCardinalityClassification{return call(()=>engine.tablespec.verifyTableSpecCardinalityClassification({receipt,current}) as TableSpecCardinalityClassification);},
  recoverTableSpecCardinalitySource(receipt:TableSpecCardinalityClassification,current:Document):string|Record<string,string>{return call(()=>engine.tablespec.recoverTableSpecCardinalitySource({receipt,current}) as string|Record<string,string>);},
  classifyTableSpecNullability(document:Document,request:TableSpecNullabilityRequest):TableSpecNullabilityClassification{return call(()=>engine.tablespec.classifyTableSpecNullability({document,request}) as TableSpecNullabilityClassification);},
  verifyTableSpecNullabilityClassification(receipt:TableSpecNullabilityClassification,current:Document):TableSpecNullabilityClassification{return call(()=>engine.tablespec.verifyTableSpecNullabilityClassification({receipt,current}) as TableSpecNullabilityClassification);},
  recoverTableSpecNullabilitySource(receipt:TableSpecNullabilityClassification,current:Document):string|Record<string,string>{return call(()=>engine.tablespec.recoverTableSpecNullabilitySource({receipt,current}) as string|Record<string,string>);},
  classifyTableSpecKeys(document:Document,request:TableSpecKeyRequest):TableSpecKeyClassification{return call(()=>engine.tablespec.classifyTableSpecKeys({document,request}) as TableSpecKeyClassification);},
  verifyTableSpecKeyClassification(receipt:TableSpecKeyClassification,current:Document):TableSpecKeyClassification{return call(()=>engine.tablespec.verifyTableSpecKeyClassification({receipt,current}) as TableSpecKeyClassification);},
  recoverTableSpecKeySource(receipt:TableSpecKeyClassification,current:Document):string|Record<string,string>{return call(()=>engine.tablespec.recoverTableSpecKeySource({receipt,current}) as string|Record<string,string>);},
  projectKeysToTableSpec(source:Document,authors:CoreKeyDeclaration[],request:KeyTableSpecRequest):KeyTableSpecProjection{return call(()=>engine.tablespec.projectKeysToTableSpec({source,authors,request}) as KeyTableSpecProjection);},
  verifyKeysTableSpecProjection(receipt:KeyTableSpecProjection,current:Document):KeyTableSpecProjection{return call(()=>engine.tablespec.verifyKeysTableSpecProjection({receipt,current}) as KeyTableSpecProjection);},
  recoverKeysTableSpecIdeal(receipt:KeyTableSpecProjection,current:Document):Document{return call(()=>engine.tablespec.recoverKeysTableSpecIdeal({receipt,current}) as Document);},
  classifyTableSpecFacets(document:Document,request:TableSpecFacetRequest):TableSpecFacetClassification{return call(()=>engine.tablespec.classifyTableSpecFacets({document,request}) as TableSpecFacetClassification);},
  verifyTableSpecFacetClassification(receipt:TableSpecFacetClassification,current:Document):TableSpecFacetClassification{return call(()=>engine.tablespec.verifyTableSpecFacetClassification({receipt,current}) as TableSpecFacetClassification);},
  recoverTableSpecFacetSource(receipt:TableSpecFacetClassification,current:Document):string|Record<string,string>{return call(()=>engine.tablespec.recoverTableSpecFacetSource({receipt,current}) as string|Record<string,string>);},
  projectFacetsToTableSpec(author:CoreFacetDeclaration|CoreKindDeclaration,request:FacetsTableSpecRequest):FacetsTableSpecProjection{return call(()=>engine.tablespec.projectFacetsToTableSpec({author,request}) as FacetsTableSpecProjection);},
  recoverFacetsFromTableSpec(receipt:FacetsTableSpecProjection,nativeText:string):Document{return call(()=>engine.tablespec.recoverFacetsFromTableSpec({receipt,nativeText}) as Document);},
  classifyTableSpecRelationships(document:Document,request:TableSpecRelationshipRequest):TableSpecRelationshipClassification{return call(()=>engine.tablespec.classifyTableSpecRelationships({document,request}) as TableSpecRelationshipClassification);},
  verifyTableSpecRelationshipClassification(receipt:TableSpecRelationshipClassification,current:Document):TableSpecRelationshipClassification{return call(()=>engine.tablespec.verifyTableSpecRelationshipClassification({receipt,current}) as TableSpecRelationshipClassification);},
  recoverTableSpecRelationshipSource(receipt:TableSpecRelationshipClassification,current:Document):string|Record<string,string>{return call(()=>engine.tablespec.recoverTableSpecRelationshipSource({receipt,current}) as string|Record<string,string>);},
 });
}
