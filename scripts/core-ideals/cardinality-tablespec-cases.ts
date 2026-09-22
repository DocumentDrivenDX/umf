import native from '../../fixtures/validation/cardinality-tablespec-profile-native.json';
import {importTableSpec,upgradeFieldEnvelope,classifyTableSpecField,upgradeNullabilityEnvelope,upgradeCardinalityEnvelope,writeJsonValue,copyJson,type Document,type TableSpecCardinalityRequest} from '../../src';
export function tableSpecCardinalitySource(text:string,format:'json'|'yaml'='json'):Document{
 const imported=importTableSpec(text,{id:'cardinality',format});
 const fields=classifyTableSpecField(upgradeFieldEnvelope(imported).target,{column:0,mode:'strict'}).target!;
 return upgradeCardinalityEnvelope(upgradeNullabilityEnvelope(fields).target).target;
}
export function cardinalityTableSpecCases(){
 const scalarNames=new Set(['VARCHAR','DECIMAL','INTEGER','DATE','DATETIME','TIMESTAMP','BOOLEAN','TEXT','CHAR','FLOAT']);
 const vectorNames=new Set(['embedding-one','embedding-three','future-column-content']);
 const rows=[];
 for(const n of native.declarations)for(const nativeFormat of ['json','yaml'] as const){
  const text=writeJsonValue(copyJson(n.source),nativeFormat),source=tableSpecCardinalitySource(text,nativeFormat);
  for(const profile of ['runtime-model','checked-schema','unresolved'] as const)for(const mode of ['strict','report'] as const){
   let expected:'one'|'array'|'unspecified'='unspecified';
   if(profile!=='unresolved'){
    if(scalarNames.has(n.case))expected='one';
    if(vectorNames.has(n.case))expected='array';
    if(profile==='checked-schema'&&['embedding-missing','embedding-null'].includes(n.case))expected='array';
    if(profile==='checked-schema'&&n.case==='scalar-stray-dimension')expected='one';
   }
   const request:TableSpecCardinalityRequest={column:0,mode,profile};
   rows.push({name:n.case,nativeFormat,text,source,request,expected,status:mode==='strict'&&expected==='unspecified'?'blocked' as const:'classified' as const});
  }
 }
 return rows;
}
