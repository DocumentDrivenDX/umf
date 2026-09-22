import native from '../../fixtures/validation/nullability-tablespec-profile-native.json';
import {importTableSpec,upgradeFieldEnvelope,classifyTableSpecField,upgradeNullabilityEnvelope,writeJsonValue,copyJson} from '../../src';
import type {Document,TableSpecNullabilityRequest} from '../../src';
export function tableSpecAvailabilitySource(text:string,format:'json'|'yaml'='json'):Document{
 const imported=importTableSpec(text,{id:'availability',format}),fields=classifyTableSpecField(upgradeFieldEnvelope(imported).target,{column:0,mode:'strict'});
 return upgradeNullabilityEnvelope(fields.target!).target;
}
export function nullabilityTableSpecCases(){
 const rows=[];
 for(const nativeCase of native.rows)for(const nativeFormat of ['json','yaml'] as const){
  const text=writeJsonValue(copyJson(nativeCase.source),nativeFormat),source=tableSpecAvailabilitySource(text,nativeFormat);
  for(const profile of ['runtime-model','checked-schema','unresolved'] as const)for(const context of [null,'MD'])for(const mode of ['strict','report'] as const){
   // Independent expectations from explicit source booleans, not native helper/coercion output.
   let expected:'required'|'absent-allowed'|'unspecified'='unspecified';
   if(profile==='runtime-model'&&['false','true'].includes(nativeCase.case))expected=nativeCase.case==='false'?'required':'absent-allowed';
   if(profile!=='unresolved'&&context==='MD'&&['mixed-map','all-false','all-true'].includes(nativeCase.case))expected=nativeCase.case==='all-true'?'absent-allowed':'required';
   const request:TableSpecNullabilityRequest={column:0,profile,context,mode,carrier:'null-value'};
   rows.push({name:nativeCase.case,nativeFormat,text,source,request,expected,status:mode==='strict'&&expected==='unspecified'?'blocked' as const:'classified' as const});
  }
 }
 return rows;
}
