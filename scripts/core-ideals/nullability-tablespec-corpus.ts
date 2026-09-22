import {nullabilityTableSpecCases} from './nullability-tablespec-cases';
import {classifyTableSpecNullability,verifyTableSpecNullabilityClassification,recoverTableSpecNullabilitySource,writeJsonValue,readJsonValue,copyJson} from '../../src';
const rows=[];
for(const c of nullabilityTableSpecCases()){
 const result=classifyTableSpecNullability(c.source,c.request),recovered=[];
 if(result.status!==c.status||result.mapping.nullability!==c.expected)throw Error('Unexpected classification');
 if(result.target)for(const format of ['json','yaml'] as const){const receipt=readJsonValue(writeJsonValue(copyJson(result),format),format) as unknown as typeof result;verifyTableSpecNullabilityClassification(receipt,receipt.target!);const text=recoverTableSpecNullabilitySource(receipt,receipt.target!);if(text!==c.text)throw Error('Recovery changed');recovered.push({format,text});}
 rows.push({case:c.name,nativeFormat:c.nativeFormat,source:c.text,request:c.request,status:result.status,mapping:result.mapping,residuals:result.residuals,recovered});
}
await Bun.write('fixtures/validation/nullability-tablespec-classification.json',JSON.stringify({scope:'Declared TableSpec nullable metadata classification under selected profile/context/carrier; exact retained source recovery, not row enforcement',rows},null,2)+'\n');
console.log(JSON.stringify({cases:rows.length,classified:rows.filter(r=>r.status==='classified').length,blocked:rows.filter(r=>r.status==='blocked').length,recoveries:rows.reduce((n,r)=>n+r.recovered.length,0)}));
