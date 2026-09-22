import * as u from '../../src';
import {cardinalityTableSpecProjectionCases} from './cardinality-tablespec-projection-cases';
const rows=cardinalityTableSpecProjectionCases().map(row=>{
 const result=u.projectCardinalityToTableSpec(row.author,row.request),nativeText=result.target?u.exportTableSpec(result.target):null;
 const recovered=nativeText===null?[]:(['json','yaml'] as const).map(format=>{const receipt=u.readJsonValue(u.writeJsonValue(u.copyJson(result),format),format) as unknown as u.CardinalityTableSpecProjection;return {format,source:u.recoverCardinalityFromTableSpec(receipt,nativeText)};});
 return {...row,result,nativeText,recovered};
});
await Bun.write('fixtures/validation/cardinality-tablespec-projection.json',JSON.stringify({rows},null,2)+'\n');console.log(JSON.stringify({cases:rows.length,projected:rows.filter(r=>r.nativeText!==null).length,recoveries:rows.reduce((n,r)=>n+r.recovered.length,0)}));
