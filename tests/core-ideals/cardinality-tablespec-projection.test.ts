import {test,expect} from 'bun:test';
import * as u from '../../src';
import {cardinalityTableSpecProjectionCases} from '../../scripts/core-ideals/cardinality-tablespec-projection-cases';
test('authored shapes and item obligations project or explicitly residualize, with both retained recovery formats',()=>{
 const rows=cardinalityTableSpecProjectionCases();expect(rows).toHaveLength(78);
 for(const row of rows){
  const before=u.copyJson(row.author),result=u.projectCardinalityToTableSpec(row.author,row.request);
  expect(result.status).toBe(row.expectedStatus);expect(u.copyJson(row.author)).toEqual(before);
  if(result.status==='blocked'){expect(result.target).toBeUndefined();expect(result.residuals.length).toBeGreaterThan(0);continue;}
  const text=u.exportTableSpec(result.target!);expect(u.exportTableSpec(u.importTableSpec(text,{id:'again',format:'json'}))).toBe(text);
  for(const format of ['json','yaml'] as const){const receipt=u.readJsonValue(u.writeJsonValue(u.copyJson(result),format),format) as unknown as u.CardinalityTableSpecProjection;expect(u.recoverCardinalityFromTableSpec(receipt,text)).toEqual(row.author.target);}
  if(row.author.provenance.cardinality==='array')expect(result.residuals.some(r=>r.reason.includes('dimension')||r.reason.includes('fixed length'))).toBe(true);
  if(row.author.provenance.cardinality==='map'){expect(result.mapping.encoding).toBe('carrier-only');expect(result.mapping.outcome).toBe('not-expressible');}
 }
},60000);
test('invalid native carriers, dimensions, names, getters and forged receipts cannot publish meaning',()=>{
 const row=cardinalityTableSpecProjectionCases()[0]!,r=u.projectCardinalityToTableSpec(row.author,row.request),text=u.exportTableSpec(r.target!);
 for(const patch of [{nativeType:'MAP'},{dimension:3},{columnName:'bad-name'},{tableName:'x'.repeat(129)},{nativeType:'EMBEDDING',dimension:null},{nativeType:'EMBEDDING',dimension:0}])expect(()=>u.projectCardinalityToTableSpec(row.author,{...row.request,...patch} as u.CardinalityTableSpecRequest)).toThrow();
 expect(()=>u.recoverCardinalityFromTableSpec(r,text+' ')).toThrow('Native target changed');
 const forged=u.copyJson(r) as unknown as u.CardinalityTableSpecProjection;forged.mapping.cardinality='array';expect(()=>u.recoverCardinalityFromTableSpec(forged,text)).toThrow();
 const stale=u.copyJson(row.author) as unknown as u.CoreCardinalityDeclaration;stale.target.id='changed';expect(()=>u.projectCardinalityToTableSpec(stale,row.request)).toThrow();
 let getters=0;const request={...row.request};Object.defineProperty(request,'nativeType',{enumerable:true,get(){getters++;return 'TEXT';}});expect(()=>u.projectCardinalityToTableSpec(row.author,request)).toThrow();expect(getters).toBe(0);
});
