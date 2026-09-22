import {test,expect} from 'bun:test';
import * as u from '../../src';
import {backend} from '../../native/postgresql/runtime';
import {postgresqlFacetSource,postgresqlFacetRequest} from '../../scripts/core-ideals/facets-postgresql-cases';
const source=postgresqlFacetSource();
const classify=(name:string,options:Partial<u.PostgresqlFacetRequest>={})=>u.classifyPostgresqlFacets(source,postgresqlFacetRequest(source,name,options),backend);
test('native carriers and qualified predicates classify width, decimal and length separately from input conversion',async()=>{
 for(const [name,bits,signed] of [['int16',16,true],['int32',32,true],['int64',64,true],['signed8',8,true],['unsigned8',8,false]] as const){const r=await classify(name,{mode:'strict'});expect(r.status).toBe('classified');expect(r.mapping.facets.integerWidth).toEqual({bits,signed});}
 for(const name of ['decimal_exact','decimal_finite']){const r=await classify(name,{mode:'strict'});expect(r.status).toBe('classified');expect(r.mapping.facets).toEqual({precision:5,scale:2});}
 for(const name of ['decimal_pair','decimal_negative_scale','decimal_over_scale']){const r=await classify(name,{mode:'strict'});expect(r.status).toBe('blocked');expect(r.mapping.facets).toEqual({});}
 expect((await classify('binary_bound',{mode:'strict'})).mapping.facets).toEqual({length:{max:2,unit:'byte'}});
 expect((await classify('text_zero',{mode:'strict'})).status).toBe('classified');
 const text=await classify('text_bound');expect(text.mapping.facets).toEqual({length:{max:2,unit:'unicode-scalar'}});expect(text.residuals.some(r=>r.reason.includes('NUL'))).toBe(true);
 expect((await classify('text_bound',{mode:'strict'})).status).toBe('blocked');
 const unvalidated=await classify('unvalidated');expect(unvalidated.mapping.facets).toEqual({});expect(unvalidated.residuals.some(r=>r.path==='/supplement/constraints')).toBe(true);expect((await classify('unvalidated',{profile:'new-value',mode:'strict'})).mapping.facets).toEqual({precision:5,scale:2});
 const narrowed=await classify('float32',{obligation:'exact-input'});expect(narrowed.outcome).toBe('approximated');expect(narrowed.residuals[0]!.reason).toContain('1.0000000000000002');
 expect((await classify('decimal_finite',{obligation:'exact-input',mode:'strict'})).status).toBe('blocked');
 expect((await classify('decimal_exact',{obligation:'exact-input'})).residuals.some(r=>r.reason.includes('arbitrary SQL'))).toBe(true);
},120000);
test('both receipt serializations recover exact native source and supplement; edits invalidate recovery',async()=>{
 for(const name of ['signed8','decimal_exact','decimal_pair','text_bound','binary_bound','domain_value','array_value','length_check','unvalidated']){
  const request=postgresqlFacetRequest(source,name),r=await u.classifyPostgresqlFacets(source,request,backend);expect(r.status).toBe('classified');
  const field=r.target!.modules.find(m=>m.id==='postgresql.columns')!.elements.find(e=>e.id===request.column)!;expect((field.extensions[u.POSTGRESQL_FACETS_EXTENSION] as Record<string,u.Json>).nativeSupplement).toBe(request.supplement);
  for(const format of ['json','yaml'] as const){const receipt=u.readJsonValue(u.writeJsonValue(u.copyJson(r),format),format) as unknown as u.PostgresqlFacetClassification;expect(await u.recoverPostgresqlFacetSource(receipt,receipt.target!,backend)).toEqual({nativeSource:request.nativeSource,supplement:request.supplement});}
 }
 const r=await classify('signed8'),changed=u.copyJson(r.target) as unknown as u.Document;changed.id='changed';await expect(u.recoverPostgresqlFacetSource(r,changed,backend)).rejects.toThrow();
 const forged=u.copyJson(r) as unknown as u.PostgresqlFacetClassification;forged.mapping.facets.integerWidth!.bits=9;await expect(u.recoverPostgresqlFacetSource(forged,forged.target!,backend)).rejects.toThrow();
},120000);
test('authorship, profile uncertainty, shape conflicts and unknown metadata remain explicit',async()=>{
 const request=postgresqlFacetRequest(source,'signed8'),identity={module:'postgresql.columns',element:request.column};
 const author=u.declareCoreFacets(source,identity,{integerWidth:{bits:8,signed:true}});
 expect((await u.classifyPostgresqlFacets(author.target,{...request,mode:'strict',author},backend)).status).toBe('classified');
 expect((await u.classifyPostgresqlFacets(author.target,request,backend)).status).toBe('blocked');
 const conflicting=u.declareCoreFacets(source,identity,{integerWidth:{bits:16,signed:true}});expect((await u.classifyPostgresqlFacets(conflicting.target,{...request,author:conflicting},backend)).status).toBe('blocked');
 const unknown=request.supplement.slice(0,-1)+',"future":900719925474099312345678901234567890}';
 const r=await u.classifyPostgresqlFacets(source,{...request,supplement:unknown},backend);expect(r.residuals.some(r=>r.path==='/supplement/future')).toBe(true);expect((await u.recoverPostgresqlFacetSource(r,r.target!,backend)).supplement).toBe(unknown);
 expect((await u.classifyPostgresqlFacets(source,{...request,supplement:unknown,mode:'strict'},backend)).status).toBe('blocked');
 expect((await classify('signed8',{profile:'unresolved',mode:'strict'})).status).toBe('blocked');
 expect((await classify('signed8',{datumFormat:'unresolved',mode:'strict'})).status).toBe('blocked');
 const bad=u.copyJson(source) as unknown as u.Document;bad.modules.find(m=>m.id===identity.module)!.elements.find(e=>e.id===identity.element)!.kind='record';await expect(u.classifyPostgresqlFacets(bad,request,backend)).rejects.toThrow();
},120000);
test('published package validates emitted bindings and rejects a forged profile',async()=>{
 const r=await classify('signed8'),registry=new u.Registry().register(u.postgresqlFacetsPackage);
 expect(u.validateDocument(r.target!,registry).valid).toBe(true);
 const modified=u.copyJson(r.target!) as unknown as u.Document;
 const field=modified.modules.find(m=>m.id==='postgresql.columns')!.elements.find(e=>e.id===r.request.column)!;
 (field.extensions[u.POSTGRESQL_FACETS_EXTENSION] as Record<string,u.Json>).profile='invented';
 expect(u.validateDocument(modified,registry).valid).toBe(false);
});
