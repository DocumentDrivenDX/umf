import {cardinalityTableSpecCases} from './cardinality-tablespec-cases';
import * as u from '../../src';
const rows=cardinalityTableSpecCases().map(row=>{
 const result=u.classifyTableSpecCardinality(row.source,row.request);
 const recovered=result.target?(['json','yaml'] as const).map(format=>{
  const receipt=u.readJsonValue(u.writeJsonValue(u.copyJson(result),format),format) as unknown as u.TableSpecCardinalityClassification;
  return {format,text:u.recoverTableSpecCardinalitySource(receipt,receipt.target!)};
 }):[];
 return {case:row.name,nativeFormat:row.nativeFormat,source:row.text,request:row.request,status:result.status,mapping:result.mapping,recovered};
});
await Bun.write('fixtures/validation/cardinality-tablespec-classification.json',JSON.stringify({scope:'Declared shape only; item metadata and execution refinements remain native',rows},null,2)+'\n');
console.log(JSON.stringify({cases:rows.length,recoveries:rows.reduce((n,r)=>n+r.recovered.length,0)}));
