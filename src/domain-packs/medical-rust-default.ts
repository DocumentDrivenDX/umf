// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError} from '../model/types';
import type {MedicalRow,MedicalTables,MedicalTerminologyRecord} from './medical';

type Engine={readonly ['medical-projection']:Readonly<Record<'projectMedicalFhir'|'projectCdcMortality'|'projectDicomMetadata'|'lookupMedicalTerminology',(fields?:Record<string,unknown>)=>unknown>>};
type Guard=(error:unknown)=>boolean;
const CONTROL=new Set(['LIMIT','CAPACITY','RESOURCE_LIMIT','CANCELLED','METER_FAILURE','CANCELLATION_CHECK_FAILURE','CLOCK_CAPABILITY_REQUIRED','DEADLINE','DEADLINE_EXCEEDED']);
function invoke<T>(engine:Engine,operation:keyof Engine['medical-projection'],fields:Record<string,unknown>,guard:Guard):T{
 try{return engine['medical-projection'][operation](fields) as T;}
 catch(error){
  if(!guard(error))throw error;
  const native=error as {code?:unknown;message?:unknown;path?:unknown};
  if(typeof native.code!=='string'||CONTROL.has(native.code)||(!native.code.startsWith('MEDICAL_')&&!native.code.startsWith('JSON_SCHEMA_')&&native.code!=='REQUEST'))throw error;
  throw new UmfError(native.code,String(native.message??''),typeof native.path==='string'?native.path:'');
 }
}
export function createMedicalRustDefault(engine:Engine,isNativeError:Guard=()=>false){
 return Object.freeze({
  projectMedicalFhir(inputs:{source_id:string;text:string}[],namespace:string):MedicalTables{return invoke(engine,'projectMedicalFhir',{inputs,namespace},isNativeError);},
  projectCdcMortality(source:string,sourceId:string):MedicalRow[]{return invoke(engine,'projectCdcMortality',{source,sourceId},isNativeError);},
  projectDicomMetadata(source:string,sourceId:string):MedicalTables{return invoke(engine,'projectDicomMetadata',{source,sourceId},isNativeError);},
  lookupMedicalTerminology(query:{system:string;release:string;code:string},records?:MedicalTerminologyRecord[]):{status:'matched'|'not-in-subset'|'source-unavailable';matches:MedicalTerminologyRecord[]}{return invoke(engine,'lookupMedicalTerminology',{query,...(records===undefined?{}:{records})},isNativeError);},
 });
}
