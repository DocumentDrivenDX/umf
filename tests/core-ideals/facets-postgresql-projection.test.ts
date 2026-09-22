import {test,expect} from 'bun:test';
import * as u from '../../src';
import {backend} from '../../native/postgresql/runtime';
import {postgresqlFacetIdeal,facetsPostgresqlProjectionCases} from '../../scripts/core-ideals/facets-postgresql-projection-cases';
const rows=facetsPostgresqlProjectionCases();
const selected=(name:string,encoding:u.FacetsPostgresqlRequest['encoding']='checked',mode:u.FacetsPostgresqlRequest['mode']='strict')=>rows.find(r=>r.name===name&&r.request.encoding===encoding&&r.request.mode===mode)!;
const project=(row:typeof rows[number])=>u.projectFacetsToPostgresql(row.author,row.request,backend);
test('authored facet matrix preserves every ideal and reports unsupported native representations',async()=>{
 expect(rows).toHaveLength(232);let projected=0,blocked=0;
 for(const row of rows){const before=u.copyJson(row.author),r=await project(row);expect(u.copyJson(row.author)).toEqual(before);
  if(r.status==='blocked'){blocked++;expect(r.target).toBeUndefined();expect(r.nativeSql).toBeUndefined();expect(r.residuals.length).toBeGreaterThan(0);continue;}
  projected++;if(row.request.mode==='strict'){expect(r.residuals).toEqual([]);if(row.author.operation==='declare-core-facets')expect(r.mapping.facets).toEqual(row.author.request);}
  if(row.author.operation==='declare-core-facets')for(const key of Object.keys(row.author.request))if(!Object.hasOwn(r.mapping.facets,key))expect(r.residuals.some(r=>r.path.includes('/facets'))).toBe(true);
  for(const format of ['json','yaml'] as const){const receipt=u.readJsonValue(u.writeJsonValue(u.copyJson(r),format),format) as unknown as u.FacetsPostgresqlProjection;expect(u.copyJson(await u.recoverFacetsFromPostgresql(receipt,receipt.nativeSql!,backend))).toEqual(u.copyJson(r.source));}
 }
 expect(projected).toBeGreaterThan(0);expect(blocked).toBeGreaterThan(0);
},120000);
test('finite decimal checks, exact width bounds, length units and input losses are explicit',async()=>{
 const decimal=await project(selected('decimal-5-2'));expect(decimal.mapping.facets).toEqual({precision:5,scale:2});expect(decimal.nativeSql).toContain('trunc("value", 2)');expect(decimal.nativeSql).toContain("'-999.99'::pg_catalog.numeric");
 const modifier=await project(selected('decimal-5-2','type-modifier'));expect(modifier.nativeSql).toContain('numeric(5,2)');expect(modifier.nativeSql).not.toContain('trunc(');
 const exactInput=await u.projectFacetsToPostgresql(modifier.author,{...modifier.request,obligation:'exact-input'},backend);expect(exactInput.status).toBe('blocked');expect(exactInput.residuals.some(r=>r.reason.includes('round'))).toBe(true);
 expect((await project(selected('smallint-8-false'))).nativeSql).toContain('"value" OPERATOR(pg_catalog.>=) 0 AND "value" OPERATOR(pg_catalog.<=) 255');
 expect((await project(selected('numeric-integer-128','checked','report'))).nativeSql).toContain('340282366920938463463374607431768211455');
 expect((await project(selected('numeric-integer-128'))).status).toBe('blocked');
 expect((await project(selected('length-text-0'))).status).toBe('projected');
 expect((await project(selected('length-text-2'))).status).toBe('blocked');
 expect((await project(selected('bytes-2'))).nativeSql).toContain('octet_length("value") OPERATOR(pg_catalog.<=) 2');
 expect((await project(selected('decimal-1001-0'))).status).toBe('blocked');
 expect((await project(selected('bytes-10485761'))).status).toBe('blocked');
});
test('unknown meaning, unsafe identifiers and changed receipts cannot be silently normalized',async()=>{
 const original=postgresqlFacetIdeal('integer');original.vocabularies.future={version:'1.0.0'};original.modules[0]!.elements[0]!.extensions.future={unknown:true};
 const author=u.declareCoreFacets(original,{module:'m',element:'value'},{integerWidth:{bits:8,signed:true}}),request=selected('smallint-8-true').request;
 expect((await u.projectFacetsToPostgresql(author,request,backend)).status).toBe('blocked');
 const r=await u.projectFacetsToPostgresql(author,{...request,mode:'report'},backend);expect(u.copyJson(await u.recoverFacetsFromPostgresql(r,r.nativeSql!,backend))).toEqual(u.copyJson(author.target));
 await expect(u.recoverFacetsFromPostgresql(r,r.nativeSql+' ',backend)).rejects.toThrow();
 const forged=u.copyJson(r) as unknown as u.FacetsPostgresqlProjection;forged.mapping.facets.integerWidth!.bits=9;await expect(u.recoverFacetsFromPostgresql(forged,forged.nativeSql!,backend)).rejects.toThrow();
 await expect(u.projectFacetsToPostgresql(author,{...request,columnName:'bad\0name'},backend)).rejects.toThrow();
 const escaped=await u.projectFacetsToPostgresql(author,{...request,columnName:'quote";name',mode:'report'},backend);expect(escaped.nativeSql).toContain('"quote"";name"');
});

test('unrepresentable comments produce retained report losses instead of losing metadata',async()=>{
 const source=postgresqlFacetIdeal('integer');source.modules[0]!.elements[0]!.description='a\0b';
 const author=u.declareCoreFacets(source,{module:'m',element:'value'},{integerWidth:{bits:8,signed:true}}),request=selected('smallint-8-true').request;
 expect((await u.projectFacetsToPostgresql(author,request,backend)).status).toBe('blocked');
 const result=await u.projectFacetsToPostgresql(author,{...request,mode:'report'},backend);expect(result.status).toBe('projected');expect(result.nativeSql).not.toContain('COMMENT');expect(result.residuals.some(r=>r.path.endsWith('/description'))).toBe(true);expect(u.copyJson(await u.recoverFacetsFromPostgresql(result,result.nativeSql!,backend))).toEqual(u.copyJson(author.target));
});
