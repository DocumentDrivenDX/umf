import {test,expect} from 'bun:test';
import {sqlserverCardinalityProjectionCases} from '../../scripts/core-ideals/cardinality-sqlserver-projection-cases';
import {projectCardinalityToSqlServer,recoverCardinalityFromSqlServer} from '../../src/core-ideals/cardinality-sqlserver-projection';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
import {copyJson} from '../../src/model/json';
test('scalar/JSON carriers retain nested/cyclic items, availability and unknown metadata through both formats',()=>{
 for(const c of sqlserverCardinalityProjectionCases()){
  const r=projectCardinalityToSqlServer(c.author,c.request),exact=!c.request.requireExactValues&&c.request.storage==='scalar'&&['one','unspecified'].includes(c.author.provenance.cardinality);
  expect(r.status).toBe(c.request.mode==='strict'&&!exact?'blocked':'projected');expect(r.mapping.basis).toContain('Explicit author declaration');
  if(r.status==='blocked'){expect(r.nativeSql).toBeUndefined();expect(r.target).toBeUndefined();continue;}
  expect(r.nativeSql).toContain(' NULL');
  if(c.request.storage!=='scalar')expect(r.nativeSql).toContain('ISJSON([value],'+(c.request.storage==='json-array'?'ARRAY':'OBJECT')+')=1');
  for(const format of ['json','yaml'] as const){const saved=readJsonValue(writeJsonValue(copyJson(r),format),format) as unknown as typeof r;expect(recoverCardinalityFromSqlServer(saved,r.nativeSql!)).toEqual(c.author.target);}
 }
},120000);
test('unsafe types, malformed identifiers, exact-value demands and changed receipts refuse',()=>{
 const c=sqlserverCardinalityProjectionCases()[0]!;
 const r=projectCardinalityToSqlServer(c.author,{...c.request,mode:'report'});
 expect(()=>recoverCardinalityFromSqlServer(r,r.nativeSql+' ')).toThrow();
 const forged=structuredClone(r);forged.mapping.basis='forged' as any;expect(()=>recoverCardinalityFromSqlServer(forged,r.nativeSql!)).toThrow();
 for(const name of ['#temp','x'.repeat(129),'\0',String.fromCharCode(0xd800)])expect(()=>projectCardinalityToSqlServer(c.author,{...c.request,tableName:name})).toThrow();
 expect(()=>projectCardinalityToSqlServer(c.author,{...c.request,nativeType:'int); DROP TABLE x' as any})).toThrow();
 const exact=projectCardinalityToSqlServer(c.author,{...c.request,nativeType:'real',mode:'strict',requireExactValues:true});
 expect(exact.status).toBe('blocked');expect(exact.residuals.some(r=>r.reason.includes('1.0000000000000002'))).toBe(true);
 expect(()=>projectCardinalityToSqlServer(c.author,{...c.request,storage:'json-array',nativeType:'int'})).toThrow();
});
