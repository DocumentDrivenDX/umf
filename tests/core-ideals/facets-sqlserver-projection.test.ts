import {test,expect} from 'bun:test';
import * as u from '../../src';
import {projectFacetsToSqlServer as project,recoverFacetsFromSqlServer as recover} from '../../src/core-ideals/facets-sqlserver-projection';
import {facetsSqlServerProjectionCases,sqlserverFacetIdeal} from '../../scripts/core-ideals/facets-sqlserver-projection-cases';
const rows=facetsSqlServerProjectionCases();
const row=(name:string,encoding='checked',mode='report')=>rows.find(r=>r.name===name&&r.request.encoding===encoding&&r.request.mode===mode)!;
test('all authored cases block explicitly or recover the ideal through both receipt formats',()=>{
 let projected=0,blocked=0;
 for(const c of rows){const r=project(c.author,c.request);if(r.status==='blocked'){blocked++;expect(r.target).toBeUndefined();expect(r.nativeSql).toBeUndefined();expect(r.residuals.length).toBeGreaterThan(0);continue;}projected++;expect(r.target!.sql).toBe(r.nativeSql!);
  for(const format of ['json','yaml'] as const){const receipt=u.readJsonValue(u.writeJsonValue(u.copyJson(r),format),format) as unknown as typeof r;expect(recover(receipt,receipt.nativeSql!)).toEqual(c.author.target);}
 }
 expect(projected).toBeGreaterThan(100);expect(blocked).toBeGreaterThan(50);
},120000);
test('range, coefficient and byte checks honor declared facets; string and conversion losses remain explicit',()=>{
 for(const name of ['smallint-8-true','tinyint-8-false','decimal-5-2','bytes-varbinary-2','length-nvarchar-0']){const c=row(name,'checked','strict');expect(project(c.author,c.request).status,name).toBe('projected');}
 const small=row('smallint-8-true');expect(project(small.author,small.request).nativeSql).toContain('[value] >= -128 AND [value] <= 127');
 const decimal=row('decimal-5-2');expect(project(decimal.author,decimal.request).nativeSql).toContain('decimal(5,2) NULL CHECK');expect(project(decimal.author,{...decimal.request,mode:'strict',obligation:'exact-input'}).status).toBe('blocked');
 const unicode=row('length-nvarchar-2');const r=project(unicode.author,unicode.request);expect(r.nativeSql).toContain("LEN([value]+N'x')-1 <= 2");expect(r.residuals.some(r=>r.reason.includes('surrogates'))).toBe(true);expect(project(unicode.author,{...unicode.request,mode:'strict'}).status).toBe('blocked');
 const f=rows.find(r=>r.name==='facetless-real'&&r.request.obligation==='exact-input'&&r.request.mode==='report')!;expect(project(f.author,f.request).residuals.some(r=>r.reason.includes('1.0000000000000002'))).toBe(true);
});
test('unknown meaning, forged receipts, invalid identifiers and unsafe comments never disappear',()=>{
 const c=row('smallint-8-true'),r=project(c.author,c.request);expect(()=>recover(r,r.nativeSql+' ')).toThrow();const forged=u.copyJson(r) as unknown as typeof r;forged.mapping.facets.integerWidth!.bits=9;expect(()=>recover(forged,forged.nativeSql!)).toThrow();
 for(const namespace of ['', '#temp','bad\0','\ud800','x'.repeat(129)])expect(()=>project(c.author,{...c.request,namespace})).toThrow();
 const source=sqlserverFacetIdeal('integer');source.vocabularies.future={version:'1.0.0'};source.modules[0]!.elements[0]!.extensions.future={unknown:1};source.modules[0]!.elements[0]!.description='bad\0';const author=u.declareCoreFacets(source,{module:'m',element:'value'},{integerWidth:{bits:8,signed:true}});const report=project(author,c.request);expect(report.residuals.length).toBeGreaterThan(1);expect(recover(report,report.nativeSql!)).toEqual(author.target);expect(project(author,{...c.request,mode:'strict'}).status).toBe('blocked');
 let calls=0;expect(()=>project({get operation(){calls++;return 'declare-core-facets';}} as any,c.request)).toThrow();expect(calls).toBe(0);
});
