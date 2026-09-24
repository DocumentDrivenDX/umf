import {test,expect} from 'bun:test';
import * as u from '../../src';
import {classifyParquetFacets as classify,recoverParquetFacetSource as recover,parquetFacetsPackage,PARQUET_FACETS_EXTENSION,type ParquetFacetRequest} from '../../src';
async function sample(id='int8-min-plain',family:u.ScalarType='integer',options:Partial<ParquetFacetRequest>={}){
 const bytes=new Uint8Array(await Bun.file(`fixtures/parquet/facets/${id}.parquet`).arrayBuffer());
 const native=u.importParquetSchema(bytes,{id:'parquet-facets'});
 const document=u.upgradeFacetEnvelope(u.upgradeCardinalityEnvelope(u.upgradeNullabilityEnvelope(u.upgradeFieldEnvelope(native).target).target).target).target;
 document.modules.push({id:'logical',namespace:'',elements:[{id:'value',kind:'field',cardinality:'one',scalarType:family,extensions:{}}]});
 const request:ParquetFacetRequest={location:{index:1,scope:'present-non-null-leaf'},identity:{module:'logical',element:'value'},mode:'report',profile:'declared-schema',obligation:'value-domain',...options};
 return {document,request,bytes};
}
test('classifies declaration widths while retaining explicit input-conversion limits',async()=>{
 for(const bits of [8,16,32,64])for(const prefix of ['int','uint']){
  const c=await sample(prefix+bits+'-min-plain','integer',{mode:'strict'}),r=classify(c.document,c.request);
  expect(r.status).toBe('classified');expect(r.mapping.facets.integerWidth).toEqual({bits,signed:prefix==='int'});
  const strict=classify(c.document,{...c.request,obligation:'exact-input'});expect(strict.status).toBe('blocked');expect(strict.target).toBeUndefined();
  const report=classify(c.document,{...c.request,mode:'report',obligation:'exact-input'});expect(report.outcome).toBe('approximated');expect(report.residuals.some(r=>r.reason.includes('1.5'))).toBe(true);
 }
 const f=await sample('float32-narrow-plain','float',{obligation:'exact-input'});
 expect(classify(f.document,f.request).residuals.some(r=>r.reason.includes('1.0000000000000002'))).toBe(true);
},30000);
test('unknown embedded metadata remains residual with exact native byte recovery',async()=>{
 const c=await sample('int8-min-embedded'),r=classify(c.document,c.request);
 expect(r.status).toBe('classified');expect(r.outcome).toBe('unknown');expect(r.residuals.some(r=>r.path==='/key_value_metadata/2')).toBe(true);
 expect(classify(c.document,{...c.request,mode:'strict'}).status).toBe('blocked');
 for(const format of ['json','yaml'] as const){
  const receipt=u.readJsonValue(u.writeJsonValue(u.copyJson(r),format),format) as unknown as typeof r;
  expect(recover(receipt,receipt.target!)).toEqual(c.bytes);
 }
 const forged=u.copyJson(r) as unknown as typeof r;forged.mapping.facets.integerWidth!.bits=32;expect(()=>recover(forged,forged.target!)).toThrow();
 const changed=u.copyJson(r.target) as unknown as u.Document;changed.id='changed';expect(()=>recover(r,changed)).toThrow();
},30000);
test('fixed lengths and author provenance do not invent or overwrite assertions',async()=>{
 const c=await sample('fixed2-6162-plain','binary');const r=classify(c.document,c.request);
 expect(r.mapping.facets.length).toEqual({max:2,unit:'byte'});expect(r.outcome).toBe('not-expressible');expect(classify(c.document,{...c.request,mode:'strict'}).status).toBe('blocked');
 const i=await sample(),author=u.declareCoreFacets(i.document,i.request.identity,{integerWidth:{bits:8,signed:true}});
 expect(classify(author.target,{...i.request,author,mode:'strict'}).status).toBe('classified');
 expect(classify(author.target,i.request).status).toBe('blocked');
 const wrong=u.declareCoreFacets(i.document,i.request.identity,{integerWidth:{bits:16,signed:true}});expect(classify(wrong.target,{...i.request,author:wrong}).status).toBe('blocked');
 const s=await sample('string-max1-0-plain','string'),bound=u.declareCoreFacets(s.document,s.request.identity,{length:{max:1,unit:'unicode-scalar'}});
 const boundResult=classify(bound.target,{...s.request,author:bound});expect(boundResult.residuals.some(r=>r.path===boundResult.mapping.idealPath+'/length')).toBe(true);
 expect(boundResult.target!.modules.at(-1)!.elements[0]!.facets).toEqual(bound.target.modules.at(-1)!.elements[0]!.facets);
},30000);
test('closed schemas, source identity and profile refusals remain explicit',async()=>{
 const c=await sample(),r=classify(c.document,c.request);
 expect(u.validateDocument(r.target!,new u.Registry().register(parquetFacetsPackage)).valid).toBe(true);
 const invalid=u.copyJson(r.target) as unknown as u.Document;(invalid.modules.at(-1)!.elements[0]!.extensions[PARQUET_FACETS_EXTENSION] as any).profile='invented';
 expect(u.validateDocument(invalid,new u.Registry().register(parquetFacetsPackage)).valid).toBe(false);
 expect(()=>classify(c.document,{...c.request,profile:'invented'} as never)).toThrow();
 expect(classify(c.document,{...c.request,profile:'unresolved',mode:'strict'}).status).toBe('blocked');
 expect(classify(c.document,{...c.request,profile:'pyarrow-safe-array-input',mode:'strict'}).status).toBe('blocked');
 c.document.modules.at(-1)!.elements[0]!.cardinality='array';delete c.document.modules.at(-1)!.elements[0]!.scalarType;expect(classify(c.document,c.request).status).toBe('blocked');
 let calls=0;expect(()=>classify({get umf(){calls++;return '0.5.0';}} as never,c.request)).toThrow();expect(calls).toBe(0);
});
test('decimal declarations and explicit array member selection preserve context',async()=>{
 const c=await sample('decimal-3-2-59-plain','decimal',{mode:'strict'}),decimal=classify(c.document,c.request);
 expect(decimal.status).toBe('classified');expect(decimal.mapping.facets).toEqual({precision:3,scale:2});
 const array=await sample('../cardinality/array-duplicates-0');
 expect(classify(array.document,{...array.request,mode:'strict'}).status).toBe('blocked');
 expect(classify(array.document,{...array.request,location:{index:2,scope:'present-non-null-leaf'},mode:'strict'}).status).toBe('blocked');
 const item=classify(array.document,{...array.request,location:{index:3,scope:'present-non-null-leaf'},mode:'strict'});
 expect(item.status).toBe('classified');expect(item.mapping.facets.integerWidth).toEqual({bits:64,signed:true});
 expect(recover(item,item.target!)).toEqual(array.bytes);
 expect(()=>classify(array.document,{...array.request,location:{index:999,scope:'present-non-null-leaf'}})).toThrow();
},30000);
