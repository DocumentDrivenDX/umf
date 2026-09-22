import {test,expect} from 'bun:test';
import * as u from '../../src';
import {classifySqlServerFacets as classify,recoverSqlServerFacetSource as recover,sqlserverFacetsPackage,SQLSERVER_FACETS_EXTENSION} from '../../src/core-ideals/facets-sqlserver';
import {sqlserverFacetCase as sample,sqlserverFacetExamples} from '../../scripts/core-ideals/facets-sqlserver-cases';
function run(table:string,column='value',options:any={}){const c=sample(table,column,options);return classify(c.document,c.request);}
test('width, decimal coefficient and byte bounds classify under explicit non-null scopes',()=>{
 for(const [table,column,bits,signed] of [['integers','tiny',8,false],['integers','wide',64,true],['signed8','value',8,true],['unsigned16','value',16,false]] as const){const r=run(table,column,{mode:'strict'});expect(r.status).toBe('classified');expect(r.mapping.facets.integerWidth).toEqual({bits,signed});}
 for(const [table,precision,scale] of [['decimal52',5,2],['decimal3838',38,38],['decimal_checked',5,2]] as const){const r=run(table,'value',{mode:'strict'});expect(r.status).toBe('classified');expect(r.mapping.facets).toEqual({precision,scale});}
 expect(run('length_zero','value',{mode:'strict'}).mapping.facets).toEqual({length:{max:0,unit:'unicode-scalar'}});
 expect(run('bytes_bound','value',{mode:'strict'}).mapping.facets).toEqual({length:{max:2,unit:'byte'}});
 const fixed=run('binary2');expect(fixed.mapping.facets.length).toEqual({max:2,unit:'byte'});expect(fixed.status).toBe('classified');expect(fixed.residuals.some(r=>r.reason.includes('padding'))).toBe(true);expect(run('binary2','value',{mode:'strict'}).status).toBe('blocked');
},30000);
test('native counterexamples remain explicit and strict/report results differ',()=>{
 for(const table of ['untrusted','replica_value']){expect(run(table,'value',{mode:'strict'}).status).toBe('blocked');const r=run(table,'value',{mode:'strict',profile:'ordinary-checked-write'});expect(r.status).toBe('classified');expect(r.mapping.facets.integerWidth).toEqual({bits:8,signed:false});}
 for(const table of ['disabled','custom','length_len','length_sentinel','alias_value','nvarchar1']){expect(run(table,'value',{mode:'strict'}).status).toBe('blocked');expect(run(table).residuals.length).toBeGreaterThan(0);}
 const float=run('floats','single_value',{obligation:'exact-input'});expect(float.outcome).toBe('approximated');expect(float.residuals.some(r=>r.reason.includes('1.0000000000000002'))).toBe(true);
 expect(run('decimal_checked','value',{obligation:'exact-input',mode:'strict'}).status).toBe('blocked');
 expect(run('signed8','value',{profile:'unresolved',mode:'strict'}).status).toBe('blocked');
},30000);
test('JSON and YAML receipts recover original native text for every discovery column',()=>{
 for(const e of sqlserverFacetExamples){const c=sample(e.table,e.column),r=classify(c.document,c.request);expect(r.status).toBe('classified');expect(u.exportSqlServerCatalog(r.target!)).toBe(u.exportSqlServerCatalog(c.document));
  expect(r.target!.modules.find(m=>m.id==='sqlserver.columns')).toEqual(c.document.modules.find(m=>m.id==='sqlserver.columns'));
  for(const format of ['json','yaml'] as const){const receipt=u.readJsonValue(u.writeJsonValue(u.copyJson(r),format),format) as unknown as typeof r;expect(recover(receipt,receipt.target!)).toBe(c.request.nativeSource);}
 }
},120000);
test('authored facets need fresh receipts and conflict without overwriting',()=>{
 const c=sample('signed8'),author=u.declareCoreFacets(c.document,c.request.identity,{integerWidth:{bits:8,signed:true}});
 expect(classify(author.target,{...c.request,mode:'strict',author}).status).toBe('classified');expect(classify(author.target,c.request).status).toBe('blocked');
 const different=u.declareCoreFacets(c.document,c.request.identity,{integerWidth:{bits:16,signed:true}});expect(classify(different.target,{...c.request,author:different}).status).toBe('blocked');
 const r=classify(c.document,c.request),edited=u.copyJson(r.target) as unknown as u.Document;edited.id='edited';expect(()=>recover(r,edited)).toThrow();
 const forged=u.copyJson(r) as unknown as typeof r;forged.mapping.facets.integerWidth!.bits=9;expect(()=>recover(forged,forged.target!)).toThrow();
 const bad=u.copyJson(c.document) as unknown as u.Document;bad.modules.at(-1)!.elements[0]!.cardinality='unspecified';expect(classify(bad,c.request).status).toBe('blocked');
 expect(classify(c.document,{...c.request,identity:{module:'sqlserver.columns',element:c.request.column}}).status).toBe('blocked');
},30000);
test('unknown exact tokens survive; malformed requests, getters and changed archives refuse',()=>{
 const c=sample('signed8'),text=c.request.nativeSource.trim().slice(0,-1)+',"future":900719925474099312345678901234567890}';
 const native=u.importSqlServerCatalog(text,{id:c.document.id});c.document.extensions=native.extensions!;
 const r=classify(c.document,{...c.request,nativeSource:text});expect(r.residuals.some(r=>r.path==='/future')).toBe(true);expect(recover(r,r.target!)).toBe(text);expect(classify(c.document,{...c.request,nativeSource:text,mode:'strict'}).status).toBe('blocked');
 expect(()=>classify(c.document,c.request)).toThrow();expect(()=>classify(c.document,{...c.request,nativeSource:text,profile:'invented'} as any)).toThrow();
 let calls=0;expect(()=>classify({get umf(){calls++;return '0.5.0';}} as any,c.request)).toThrow();expect(calls).toBe(0);
},30000);
test('extension schema validates real outputs and rejects forged profile',()=>{
 const r=run('signed8'),registry=new u.Registry().register(sqlserverFacetsPackage);expect(u.validateDocument(r.target!,registry).valid).toBe(true);
 const target=u.copyJson(r.target) as unknown as u.Document;(target.modules.at(-1)!.elements[0]!.extensions[SQLSERVER_FACETS_EXTENSION] as any).profile='invented';expect(u.validateDocument(target,registry).valid).toBe(false);
});
test('computed columns, unresolved table associations and noncanonical ranges retain residuals',()=>{
 function edit(table:string,change:(t:any)=>void){const c=sample(table),root=JSON.parse(c.request.nativeSource);change(root.tables[0]);const nativeSource=JSON.stringify(root),native=u.importSqlServerCatalog(nativeSource,{id:c.document.id});c.document.extensions=native.extensions!;return classify(c.document,{...c.request,nativeSource,mode:'strict'});}
 expect(edit('signed8',t=>{t.columns[0].is_computed=true;}).status).toBe('blocked');
 expect(edit('signed8',t=>{t.checks[0].parent_column_id=0;}).status).toBe('blocked');
 const range=edit('signed8',t=>{t.checks[0].definition='[value]>=0 AND [value]<=99';});expect(range.status).toBe('blocked');expect(range.mapping.facets).toEqual({});
 const impossible=edit('signed8',t=>{t.checks[0].definition='[value]>=1 AND [value]<=0';});expect(impossible.status).toBe('blocked');expect(impossible.mapping.facets).toEqual({});
});
