import {nullabilityTableSpecProjectionCases} from './nullability-tablespec-projection-cases';
import {projectNullabilityToTableSpec,recoverNullabilityFromTableSpec,exportTableSpec,writeJsonValue,readJsonValue,copyJson} from '../../src';
const rows=[];
for(const c of nullabilityTableSpecProjectionCases()){
 const result=projectNullabilityToTableSpec(c.author,c.request),recoveries=[];if(result.status!==c.status||result.mapping.encoding!==c.encoding)throw Error('Unexpected projection');
 const nativeText=result.target?exportTableSpec(result.target):null;
 if(nativeText!==null)for(const format of ['json','yaml'] as const){const receipt=readJsonValue(writeJsonValue(copyJson(result),format),format) as unknown as typeof result;if(JSON.stringify(recoverNullabilityFromTableSpec(receipt,nativeText))!==JSON.stringify(c.author.target))throw Error('Ideal recovery differs');recoveries.push(format);}
 rows.push({variant:c.variant,ideal:c.ideal,request:c.request,status:result.status,mapping:result.mapping,residuals:result.residuals,profileNotes:result.profileNotes,nativeText,recoveries});
}
await Bun.write('fixtures/validation/nullability-tablespec-projection.json',JSON.stringify({scope:'Authored availability metadata projection with qualified native profile acceptance and complete ideal recovery; row execution requires separate evidence',rows},null,2)+'\n');console.log(JSON.stringify({cases:rows.length,targets:rows.filter(r=>r.nativeText!==null).length,blocks:rows.filter(r=>r.nativeText===null).length,recoveries:rows.reduce((n,r)=>n+r.recoveries.length,0)}));
