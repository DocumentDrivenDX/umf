import {test,expect} from 'bun:test';
import * as u from '../../src';
import {tableSpecFacetSource} from '../../scripts/core-ideals/facets-tablespec-cases';
import evidence from '../../fixtures/validation/facets-tablespec-suite-native.json';
const request={column:0,mode:'strict',profile:'gx-suite-spark',input:'raw',obligation:'value-domain'} as const;
const classify=(native:unknown,options:Partial<u.TableSpecFacetRequest>={})=>u.classifyTableSpecFacets(tableSpecFacetSource(JSON.stringify(native)),{...request,...options});
test('explicit native suites recover zero length, widths and decimal ranges independently of baseline rules',()=>{
 expect(evidence.cases).toHaveLength(10);expect(evidence.valueChecks).toBe(61);
 for(const row of evidence.cases){
  for(const input of ['raw','model-normalized'] as const){
   const native=input==='raw'?row.source:row.normalized;
   const r=classify(native,{input});expect(r.status).toBe('classified');expect(r.residuals).toHaveLength(0);
   const rule=row.source.expectations.expectations[0]!,type=row.source.columns[0]!.data_type;
   if(type==='VARCHAR')expect(r.mapping.facets).toEqual({length:{max:rule.kwargs.max_value,unit:'unicode-scalar'}});
   if(type==='INTEGER'){
    const width=r.mapping.facets.integerWidth!;expect(width).toBeDefined();
    expect(width.signed?-(2**(width.bits-1)):0).toBe(rule.kwargs.min_value);
    expect(2**(width.bits-(width.signed?1:0))-1).toBe(rule.kwargs.max_value);
   }
   if(type==='DECIMAL'){expect(r.mapping.facets.scale).toBe(0);expect(10**r.mapping.facets.precision!-1).toBe(rule.kwargs.max_value);}
   for(const format of ['json','yaml'] as const){
    const receipt=u.readJsonValue(u.writeJsonValue(u.copyJson(r),format),format) as unknown as u.TableSpecFacetClassification;
    expect(u.recoverTableSpecFacetSource(receipt,receipt.target!)).toBe(JSON.stringify(native));
   }
  }
 }
 const zero=evidence.cases[0]!.source;
 expect(classify(zero).mapping.facets.length?.max).toBe(0);
 expect(classify(zero,{profile:'gx-spark'}).mapping.facets.length).toBeUndefined();
});
test('conditional, tolerant and unknown suite rules retain residuals and block strict interpretation',()=>{
 const mutations=[
  (r:any)=>r.kwargs.mostly=0.5,(r:any)=>r.kwargs.row_condition='value != null',
  (r:any)=>r.meta.blocking=false,(r:any)=>r.meta.stage='unknown',
  (r:any)=>r.meta.severity='warning',(r:any)=>r.kwargs.max_value='2',
  (r:any)=>r.future={unknown:true},(r:any)=>r.kwargs.column='other',
 ];
 for(const mutate of mutations){
  const native=structuredClone(evidence.cases[1]!.source);mutate(native.expectations.expectations[0]);
  const strict=classify(native);expect(strict.status).toBe('blocked');expect(strict.target).toBeUndefined();
  const report=classify(native,{mode:'report'});expect(report.mapping.facets.length).toBeUndefined();expect(report.residuals.length).toBeGreaterThan(0);
  expect(u.recoverTableSpecFacetSource(report,report.target!)).toBe(JSON.stringify(native));
 }
 const duplicate=structuredClone(evidence.cases[1]!.source);duplicate.expectations.expectations.push(duplicate.expectations.expectations[0]!);
 expect(classify(duplicate).status).toBe('blocked');
});
test('suite output domains do not assert exact conversion or nullability',()=>{
 for(const row of evidence.cases){
  const r=classify(row.source,{obligation:'exact-input'});expect(r.status).toBe('blocked');
  const report=classify(row.source,{obligation:'exact-input',mode:'report'});expect(report.residuals.some(v=>v.reason.includes('before suite validation')||v.reason.includes('exact conversion'))).toBe(true);
  expect(report.target!.modules[0]!.elements[0]!.nullability).toBeUndefined();
 }
 const native=structuredClone(evidence.cases[0]!.source);native.columns[0]!.data_type='FLOAT';native.expectations.expectations=[];
 const r=classify(native,{obligation:'exact-input',mode:'report'});expect(r.outcome).toBe('approximated');expect(r.residuals.some(v=>v.reason.includes('1.0000000000000002'))).toBe(true);
});
