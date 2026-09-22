import {test,expect} from 'bun:test';
import {inspectPostgresqlCardinalityCatalog,resolvePostgresqlCardinalityType,correlatePostgresqlCardinalityCatalog} from '../../src/adapters/postgresql/cardinality-catalog';
import {importPostgresqlCatalogCapture} from '../../src/adapters/postgresql/catalog';
const evidence=await Bun.file('fixtures/validation/cardinality-postgresql-catalog-native.json').json();
const source=JSON.stringify(evidence.supplement);
const resolve=(relation:string,name='value')=>resolvePostgresqlCardinalityType(source,{schema:'cardinality',relation,name});
test('resolves observed arrays, domain wrappers and domain members without category guessing',()=>{
 expect(resolve('declared').standardArray).toBe(true);
 expect(resolve('declared').element!.identity).toEqual({schema:'pg_catalog',name:'int4'});
 expect(resolve('vectorish').native.category).toBe('A');expect(resolve('vectorish').standardArray).toBe(false);
 expect(resolve('domains','vector').domains).toHaveLength(1);expect(resolve('domains','vector').standardArray).toBe(true);
 expect(resolve('domains','items').element!.kind).toBe('d');
 expect(resolve('jsonb_object').standardArray).toBe(false);
});
test('rejects ambiguity, broken edges, impossible observations and domain cycles',()=>{
 const mutations=[
 (v:any)=>v.types.push(v.types[0]),
 (v:any)=>v.columns.push(v.columns[0]),
 (v:any)=>v.columns[2].ordinal=v.columns[1].ordinal,
 (v:any)=>v.types.splice(v.types.findIndex((t:any)=>t.identity.name==='int4'),1),
 (v:any)=>{const t=v.types.find((t:any)=>t.identity.name==='int2vector');t.standardArray=true;t.element=null;},
 (v:any)=>{const t=v.types.find((t:any)=>t.identity.name==='vector');t.base=t.identity;},
 (v:any)=>v.columns[0].declaredDimensions=9007199254740992,
 ];
 for(const mutate of mutations){const v=structuredClone(evidence.supplement);mutate(v);expect(()=>inspectPostgresqlCardinalityCatalog(JSON.stringify(v))).toThrow();}
 expect(()=>resolvePostgresqlCardinalityType(source,{schema:'cardinality',relation:'missing',name:'value'})).toThrow();
});
test('preserves exact unknown tokens and source text; unknown versions are unqualified',()=>{
 const text=source.slice(0,-1)+',"future":900719925474099312345678901234567890}';
 const r=inspectPostgresqlCardinalityCatalog(text);expect(r.nativeSource).toBe(text);
 expect(r.root.kind==='object'&&r.root.members.future).toEqual({kind:'number',value:'900719925474099312345678901234567890'});
 const v=structuredClone(evidence.supplement);v.serverVersion=180000;
 expect(inspectPostgresqlCardinalityCatalog(JSON.stringify(v)).qualifiedVersion).toBe(false);
 expect(()=>inspectPostgresqlCardinalityCatalog(source.slice(0,-1)+',"version":"1.0.0"}')).toThrow();
});

test('does not return rounded unknown metadata in interpreted views',()=>{
 const text=source.replace('"standardArray":true','"future":90071992547409931234567890,"standardArray":true');
 const r=inspectPostgresqlCardinalityCatalog(text);
 expect(r.types.some(t=>'future'in t)).toBe(false);
 expect(r.nativeSource).toBe(text);
 expect(JSON.stringify(r.root)).toContain('90071992547409931234567890');
});

test('correlates capture observations and refuses mismatches without asserting transaction provenance',()=>{
 const capture=()=>importPostgresqlCatalogCapture(evidence.captureSource,{id:'pair'});
 const r=correlatePostgresqlCardinalityCatalog(capture(),source);
 expect(r.matches).toHaveLength(26);expect(r.sameSnapshotVerified).toBe(false);expect(r.nativeSupplement).toBe(source);
 for(const mutate of [
  (v:any)=>v.serverVersion=170005,
  (v:any)=>v.columns.pop(),
  (v:any)=>v.columns[0].declaredDimensions=2,
  (v:any)=>v.columns[0].ordinal=9,
  (v:any)=>v.columns[0].name='other',
  (v:any)=>v.types.find((t:any)=>t.identity.name==='_int4').category='future',
 ]){const v=structuredClone(evidence.supplement);mutate(v);expect(()=>correlatePostgresqlCardinalityCatalog(capture(),JSON.stringify(v))).toThrow();}
 const v=JSON.parse(evidence.captureSource);v.state='modified';
 expect(()=>correlatePostgresqlCardinalityCatalog(importPostgresqlCatalogCapture(JSON.stringify(v),{id:'modified'}),source)).toThrow();
});
