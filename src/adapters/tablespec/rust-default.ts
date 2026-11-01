// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Diagnostic,Document,ExtensionPackage} from '../../model/types';
import type {NativeJson} from '../../model/native-json';
import {UmfError} from '../../model/errors';
import {Registry} from '../../registry/registry';
import manifest from '../../../spec/extensions/tablespec/package.json';
import type {importTableSpec,exportTableSpec,getTableSpecColumn,getTableSpecTable,editTableSpecColumn,editTableSpecTable,importTableSpecBundle,exportTableSpecBundle} from './index';
import type {TableSpecFieldClassification,TableSpecFieldRequest} from '../../core-ideals/tablespec-field';
import type {TableSpecRecordClassification,TableSpecRecordRequest} from '../../core-ideals/tablespec-record-package';

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
  verifyTableSpecFieldClassification(fields:{receipt:TableSpecFieldClassification;current:Document}):unknown;
  classifyTableSpecRecord(fields:{document:Document;request:TableSpecRecordRequest}):unknown;
  verifyTableSpecRecordClassification(fields:{receipt:TableSpecRecordClassification;current:Document}):unknown;
 }
}
type NativeCoreErrorGuard=(error:unknown)=>boolean;
const CONTROL_CODES=new Set(['RESOURCE_LIMIT','CANCELLED','METER_FAILURE','CANCELLATION_CHECK_FAILURE','CLOCK_CAPABILITY_REQUIRED','DEADLINE']);

/** Preserve TableSpec's synchronous public API while routing its semantics through Rust. */
export function createTableSpecRustDefault(engine:TableSpecNativeFamilyEngine,isNativeUmfCoreError:NativeCoreErrorGuard=()=>false,createRegistry:()=>Registry=()=>new Registry()){
 const call=<T>(operation:()=>unknown):T=>{
  try{return operation() as T;}
  catch(error){
   if(!isNativeUmfCoreError(error)||CONTROL_CODES.has((error as {code?:string})?.code??''))throw error;
   const native=error as {code?:unknown;message?:unknown;path?:unknown};
   if(typeof native.code==='string'&&(native.code.startsWith('TABLESPEC_')||native.code.startsWith('CORE_KIND_')||native.code.startsWith('CORE_MEMBERS_')||native.code.startsWith('FIELD_CLASSIFICATION_')||native.code==='FIELD_KIND_CONFLICT'||native.code==='REQUEST'||native.code==='JSON_SCHEMA_SYNTAX'||native.code==='JSON_SCHEMA_POINTER'||native.code.startsWith('NATIVE_YAML_')))throw new UmfError(native.code,String(native.message??''),typeof native.path==='string'?native.path:'');
   throw error;
  }
 };
 return Object.freeze({
  tablespecRegistry():Registry{return createRegistry().register(manifest as unknown as ExtensionPackage);},
  importTableSpec(text:string,options:Parameters<typeof importTableSpec>[1]):ReturnType<typeof importTableSpec>{return call(()=>engine.tablespec.importTableSpec({source:text,id:options.id,format:options.format}) as ReturnType<typeof importTableSpec>);},
  exportTableSpec(document:Parameters<typeof exportTableSpec>[0]):ReturnType<typeof exportTableSpec>{return call(()=>engine.tablespec.exportTableSpec({document}) as ReturnType<typeof exportTableSpec>);},
  inspectTableSpec(document:Document):ReturnType<typeof import('./index').inspectTableSpec>{return call(()=>engine.tablespec.inspectTableSpec({document}) as ReturnType<typeof import('./index').inspectTableSpec>);},
  getTableSpecColumn(document:Parameters<typeof getTableSpecColumn>[0],index:Parameters<typeof getTableSpecColumn>[1]):ReturnType<typeof getTableSpecColumn>{return call(()=>engine.tablespec.getTableSpecColumn({document,index}) as ReturnType<typeof getTableSpecColumn>);},
  getTableSpecTable(document:Parameters<typeof getTableSpecTable>[0]):ReturnType<typeof getTableSpecTable>{return call(()=>engine.tablespec.getTableSpecTable({document}) as ReturnType<typeof getTableSpecTable>);},
  editTableSpecColumn(document:Parameters<typeof editTableSpecColumn>[0],index:Parameters<typeof editTableSpecColumn>[1],changes:Parameters<typeof editTableSpecColumn>[2]):ReturnType<typeof editTableSpecColumn>{return call(()=>engine.tablespec.editTableSpecColumn({document,index,changes}) as ReturnType<typeof editTableSpecColumn>);},
  editTableSpecTable(document:Parameters<typeof editTableSpecTable>[0],changes:Parameters<typeof editTableSpecTable>[1]):ReturnType<typeof editTableSpecTable>{return call(()=>engine.tablespec.editTableSpecTable({document,changes}) as ReturnType<typeof editTableSpecTable>);},
  importTableSpecBundle(files:Parameters<typeof importTableSpecBundle>[0],options:Parameters<typeof importTableSpecBundle>[1]):ReturnType<typeof importTableSpecBundle>{return call(()=>engine.tablespec.importTableSpecBundle({files,id:options.id}) as ReturnType<typeof importTableSpecBundle>);},
  exportTableSpecBundle(document:Parameters<typeof exportTableSpecBundle>[0]):ReturnType<typeof exportTableSpecBundle>{return call(()=>engine.tablespec.exportTableSpecBundle({document}) as ReturnType<typeof exportTableSpecBundle>);},
  classifyTableSpecField(document:Document,request:TableSpecFieldRequest):TableSpecFieldClassification & {diagnostics:Diagnostic[]}{return call(()=>engine.tablespec.classifyTableSpecField({document,request}) as TableSpecFieldClassification & {diagnostics:Diagnostic[]});},
  verifyTableSpecFieldClassification(receipt:TableSpecFieldClassification,current:Document):TableSpecFieldClassification{return call(()=>engine.tablespec.verifyTableSpecFieldClassification({receipt,current}) as TableSpecFieldClassification);},
  classifyTableSpecRecord(document:Document,request:TableSpecRecordRequest):TableSpecRecordClassification{return call(()=>engine.tablespec.classifyTableSpecRecord({document,request}) as TableSpecRecordClassification);},
  verifyTableSpecRecordClassification(receipt:TableSpecRecordClassification,current:Document):TableSpecRecordClassification{return call(()=>engine.tablespec.verifyTableSpecRecordClassification({receipt,current}) as TableSpecRecordClassification);},
 });
}
