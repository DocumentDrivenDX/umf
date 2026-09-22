import native from '../../fixtures/validation/facets-tablespec-profile-native.json';
import {importTableSpec,upgradeFieldEnvelope,classifyTableSpecField,upgradeNullabilityEnvelope,upgradeCardinalityEnvelope,upgradeFacetEnvelope,type Document,type TableSpecFacetRequest} from '../../src';
const providers=await Bun.file('native/tablespec/sources/examples/providers.yaml').text();
export function tableSpecFacetSource(text:string,format:'json'|'yaml'='json',column=0):Document{
 const imported=importTableSpec(text,{id:'facets',format}),fields=classifyTableSpecField(upgradeFieldEnvelope(imported).target,{column,mode:'strict'}).target!;
 return upgradeFacetEnvelope(upgradeCardinalityEnvelope(upgradeNullabilityEnvelope(fields).target).target).target;
}
export function facetTableSpecCases(){
 const rows=[];
 for(const row of native.declarations){
  const source=tableSpecFacetSource(row.sourceText);
  for(const profile of ['declared-metadata','json-schema','pyspark-schema','gx-spark','ingest-cast','unresolved'] as const)for(const input of ['raw','model-normalized'] as const)for(const mode of ['strict','report'] as const){
   const obligations:('value-domain'|'exact-input')[]=['value-domain'];if(['FLOAT-bare','INTEGER-bare','decimal-paired','max-only','unknown-unit','decimal-unsafe-precision'].includes(row.case))obligations.push('exact-input');
   for(const obligation of obligations){const request:TableSpecFacetRequest={column:0,profile,input,mode,obligation};rows.push({name:row.case,text:row.sourceText,nativeFormat:'json' as const,source,request});}
  }
 }
 for(let column=0;column<4;column++)for(const profile of ['gx-spark','pyspark-schema'] as const)for(const mode of ['strict','report'] as const){const source=tableSpecFacetSource(providers,'yaml',column),request:TableSpecFacetRequest={column,profile,mode,input:'raw',obligation:'value-domain'};rows.push({name:'providers:'+column,text:providers,nativeFormat:'yaml' as const,source,request});}
 return rows;
}
