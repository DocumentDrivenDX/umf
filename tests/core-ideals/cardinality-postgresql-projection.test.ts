import {test,expect} from 'bun:test';
import {declareCoreCardinality,type Document} from '../../src';
import {projectCardinalityToPostgresql,recoverCardinalityFromPostgresql,type CardinalityPostgresqlRequest} from '../../src/core-ideals/cardinality-postgresql-projection';
import {backend} from '../../native/postgresql/runtime';
const base={id:'projection',namespace:'public',tableName:'values',columnName:'value',nativeType:'integer',storage:'scalar',requireExactValues:false,mode:'report'} as const;
function author(shape:'one'|'array'|'map'|'unspecified'){
 const source:Document={umf:'0.4.0',id:'ideal',vocabularies:{},modules:[{id:'m',namespace:'',elements:[{id:'f',kind:'field',extensions:{}}]}]};
 return declareCoreCardinality(source,{module:'m',element:'f'},{cardinality:shape});
}
test('explicit carriers block losses in strict mode and retain ideal recovery in report mode',async()=>{
 for(const shape of ['one','array','map','unspecified'] as const)for(const storage of ['scalar','array','jsonb-object'] as const)for(const mode of ['strict','report'] as const){
  const request:CardinalityPostgresqlRequest={...base,storage,mode,nativeType:storage==='jsonb-object'?'jsonb':'integer'};
  const a=author(shape),r=await projectCardinalityToPostgresql(a,request,backend);
  const exact=storage==='scalar'&&['one','unspecified'].includes(shape);
  expect(r.mapping.basis).toContain('Explicit author declaration');
  expect(r.status).toBe(mode==='strict'&&!exact?'blocked':'projected');
  if(r.status==='blocked'){expect(r.nativeSql).toBeUndefined();continue;}
  expect(await recoverCardinalityFromPostgresql(r,r.nativeSql!,backend)).toEqual(a.target);
  if(storage==='array')expect(r.nativeSql).toContain('array_lower("value",1)=1');
  if(storage==='jsonb-object')expect(r.nativeSql).toContain("jsonb_typeof(\"value\")='object'");
 }
},120000);
test('exact-value requests, tampering, SQL injection and forged receipts are refused',async()=>{
 const a=author('one');
 const exact=await projectCardinalityToPostgresql(a,{...base,nativeType:'real',requireExactValues:true,mode:'strict'},backend);
 expect(exact.status).toBe('blocked');expect(exact.residuals.some(r=>r.reason.includes('1.0000000000000002'))).toBe(true);
 const r=await projectCardinalityToPostgresql(a,base,backend);
 await expect(recoverCardinalityFromPostgresql(r,r.nativeSql+' ',backend)).rejects.toThrow();
 const forged=structuredClone(r);forged.mapping.cardinality='map';await expect(recoverCardinalityFromPostgresql(forged,r.nativeSql!,backend)).rejects.toThrow();
 await expect(projectCardinalityToPostgresql(a,{...base,nativeType:'integer); DROP TABLE x' as any},backend)).rejects.toThrow();
});
test('nested and cyclic items retain independent availability and unknown extensions',async()=>{
 const {postgresqlCardinalityProjectionCases}=await import('../../scripts/core-ideals/cardinality-postgresql-projection-cases');
 for(const c of postgresqlCardinalityProjectionCases().slice(24)){
  const r=await projectCardinalityToPostgresql(c.author,c.request,backend);
  expect(r.residuals.some(x=>x.path.endsWith('/itemType'))).toBe(true);
  expect(r.residuals.some(x=>x.path.endsWith('/nullability'))).toBe(true);
  expect(r.residuals.some(x=>x.path==='/vocabularies')).toBe(true);
  expect(r.status).toBe(c.request.mode==='strict'?'blocked':'projected');
  if(r.status==='projected')expect(await recoverCardinalityFromPostgresql(r,r.nativeSql!,backend)).toEqual(c.author.target);
 }
},120000);
