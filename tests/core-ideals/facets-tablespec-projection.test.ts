import {test,expect} from 'bun:test';
import * as u from '../../src';
import {facetProjectionSource,facetsTableSpecProjectionCases} from '../../scripts/core-ideals/facets-tablespec-projection-cases';
import {tableSpecFacetSource} from '../../scripts/core-ideals/facets-tablespec-cases';
const identity={module:'m',element:'value'};
const request:u.FacetsTableSpecRequest={id:'native',tableName:'Facets',columnName:'value',nativeType:'VARCHAR',profile:'gx-suite-spark',input:'raw',obligation:'value-domain',mode:'strict'};
test('authored facet matrix projects or explicitly residualizes with exact retained ideal recovery',()=>{
 const rows=facetsTableSpecProjectionCases();expect(rows).toHaveLength(540);
 for(const row of rows){
  const before=u.copyJson(row.author),r=u.projectFacetsToTableSpec(row.author,row.request);expect(u.copyJson(row.author)).toEqual(before);
  expect(r.status).toBe(row.request.mode==='strict'&&r.residuals.length?'blocked':'projected');
  if(r.status==='blocked'){expect(r.target).toBeUndefined();continue;}
  const text=u.exportTableSpec(r.target!);expect(u.exportTableSpec(u.importTableSpec(text,{id:'again',format:'json'}))).toBe(text);
  for(const format of ['json','yaml'] as const){const receipt=u.readJsonValue(u.writeJsonValue(u.copyJson(r),format),format) as unknown as u.FacetsTableSpecProjection;expect(u.recoverFacetsFromTableSpec(receipt,text)).toEqual(row.author.target);}
  const native=u.classifyTableSpecFacets(tableSpecFacetSource(text),{column:0,mode:'report',profile:row.request.profile,input:row.request.input,obligation:row.request.obligation});
  for(const key of ['length','precision','scale','integerWidth'] as const)if(r.mapping.facets[key]!==undefined)expect(native.mapping.facets[key]).toEqual(r.mapping.facets[key]);
  if(row.name.startsWith('facetless'))expect(r.mapping.facets).toEqual({});
 }
},300000);
test('positive projections are required, including zero length and narrow signed/unsigned widths',()=>{
 const author=u.declareCoreFacets(facetProjectionSource('string'),identity,{length:{max:0,unit:'unicode-scalar'}});
 const r=u.projectFacetsToTableSpec(author,request);expect(r.status).toBe('projected');expect(r.residuals).toHaveLength(0);
 const native=JSON.parse(u.exportTableSpec(r.target!));expect(native.columns[0].length).toBeUndefined();expect(native.expectations.expectations[0].kwargs.max_value).toBe(0);
 expect(u.projectFacetsToTableSpec(author,{...request,profile:'gx-spark'}).status).toBe('blocked');
 for(const width of [{bits:8,signed:true},{bits:8,signed:false},{bits:32,signed:true}]){
  const a=u.declareCoreFacets(facetProjectionSource('integer'),identity,{integerWidth:width});expect(u.projectFacetsToTableSpec(a,{...request,nativeType:'INTEGER'}).status).toBe('projected');
 }
 const decimal=u.declareCoreFacets(facetProjectionSource('decimal'),identity,{precision:5,scale:2});
 expect(u.projectFacetsToTableSpec(decimal,{...request,nativeType:'DECIMAL',profile:'ingest-cast'}).status).toBe('projected');
 expect(u.projectFacetsToTableSpec(decimal,{...request,nativeType:'DECIMAL'}).status).toBe('blocked');
 expect(u.projectFacetsToTableSpec(decimal,{...request,nativeType:'DECIMAL',profile:'ingest-cast',obligation:'exact-input'}).status).toBe('blocked');
});
test('unknown source and facet refinements survive receipts; Field-kind receipts cannot establish facet authorship',()=>{
 const source=facetProjectionSource('string');source.extensions={'future.document':{opaque:[1,null]}};source.vocabularies['future.document']={version:'1.0.0'};
 source.modules[0]!.elements[0]!.facets={length:{max:2,unit:'unicode-scalar',futureUnit:'x'},future:{x:7}};
 const author=u.declareCoreFacets(source,identity,{length:{max:2,unit:'unicode-scalar'}});
 expect(u.projectFacetsToTableSpec(author,request).status).toBe('blocked');
 const report=u.projectFacetsToTableSpec(author,{...request,mode:'report'});expect(report.residuals.some(r=>r.path==='/extensions')).toBe(true);expect(report.residuals.some(r=>r.path.endsWith('/facets'))).toBe(true);
 expect(u.recoverFacetsFromTableSpec(report,u.exportTableSpec(report.target!))).toEqual(author.target);
 const kind=u.declareCoreElementKind(source,identity,'field'),unverified=u.projectFacetsToTableSpec(kind,{...request,mode:'report'});expect(unverified.mapping.facets).toEqual({});expect(unverified.residuals.some(r=>r.reason.includes('does not establish authorship'))).toBe(true);
});
test('forged receipts, stale native text, accessors and invalid native requests refuse',()=>{
 const author=u.declareCoreFacets(facetProjectionSource('string'),identity,{length:{max:2,unit:'unicode-scalar'}}),r=u.projectFacetsToTableSpec(author,request),text=u.exportTableSpec(r.target!);
 for(const patch of [{nativeType:'BINARY'},{columnName:'bad-name'},{profile:'future'},{input:'implicit'},{mode:'maybe'}])expect(()=>u.projectFacetsToTableSpec(author,{...request,...patch} as never)).toThrow();
 expect(()=>u.recoverFacetsFromTableSpec(r,text+' ')).toThrow();
 const forged=structuredClone(r);forged.mapping.facets.length!.max=1;expect(()=>u.recoverFacetsFromTableSpec(forged,text)).toThrow();
 const stale=structuredClone(author);stale.target.id='changed';expect(()=>u.projectFacetsToTableSpec(stale,request)).toThrow();
 let calls=0;expect(()=>u.projectFacetsToTableSpec(author,{...request,get profile(){calls++;return 'gx-suite-spark' as const;}})).toThrow();expect(calls).toBe(0);
});
test('unsupported widths and carriers cannot pass strict mode; float exactness has a permanent counterexample',()=>{
 for(const width of [{bits:32,signed:false},{bits:64,signed:true},{bits:Number.MAX_SAFE_INTEGER,signed:true}]){
  const author=u.declareCoreFacets(facetProjectionSource('integer'),identity,{integerWidth:width});
  const strict=u.projectFacetsToTableSpec(author,{...request,nativeType:'INTEGER'});expect(strict.status).toBe('blocked');expect(strict.mapping.facets).toEqual({});
  const report=u.projectFacetsToTableSpec(author,{...request,nativeType:'INTEGER',mode:'report'});expect(report.mapping.outcome).toBe('not-expressible');expect(u.recoverFacetsFromTableSpec(report,u.exportTableSpec(report.target!))).toEqual(author.target);
 }
 const float=u.declareCoreElementKind(facetProjectionSource('float'),identity,'field');
 const narrowed=u.projectFacetsToTableSpec(float,{...request,nativeType:'FLOAT',profile:'pyspark-schema',obligation:'exact-input',mode:'report'});
 expect(narrowed.mapping.outcome).toBe('approximated');expect(narrowed.residuals.some(r=>r.reason.includes('1.0000000000000002'))).toBe(true);
 expect(u.projectFacetsToTableSpec(float,{...request,nativeType:'FLOAT',profile:'pyspark-schema',obligation:'exact-input'}).status).toBe('blocked');
 const container=facetProjectionSource('string');container.modules[0]!.elements[0]!.cardinality='array';delete container.modules[0]!.elements[0]!.scalarType;
 const array=u.declareCoreElementKind(container,identity,'field');
 expect(u.projectFacetsToTableSpec(array,request).status).toBe('blocked');
 const fallback=u.projectFacetsToTableSpec(array,{...request,mode:'report'});expect(fallback.residuals.some(r=>r.reason.includes('container or record-valued'))).toBe(true);
});
