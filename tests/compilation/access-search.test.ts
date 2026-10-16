import {expect,test} from 'bun:test';
import {generateAccessPackage} from '../../src/compilation/index';
import {profile,request} from './access-fixtures';
import model from '../../fixtures/access/search/model.json';
function candidate(change?:(value:typeof model)=>void){const doc=structuredClone(model);change?.(doc);const req=request();req.sources=[{id:'logical',format:'json',text:JSON.stringify(doc)}];req.records=[{module:'search',element:'Doc'}];req.package='search_docs';return {req,result:generateAccessPackage(req,profile())};}
test('source-bound keyword/vector namespaces retain exact authored data and vector carrier',()=>{
 const {req,result}=candidate();expect(result.outcome).toBe('candidate');
 expect(result).toEqual(generateAccessPackage(req,profile()));
 const fields=result.files.find(f=>f.path==='search_docs/fields.py')!.text;
 expect(fields).toContain('text: KeywordIndex[Doc]');expect(fields).toContain('semantic: VectorIndex[Doc]');expect(fields).toContain('documentSha256');
 expect(result.files.find(f=>f.path==='search_docs/models.py')!.text).toContain('validate_vector(value, dimensions=3)');
 expect(result.symbols.filter(s=>s.role==='search').map(s=>s.symbol)).toEqual(['Doc.s.text','Doc.s.semantic']);
 expect(JSON.parse(result.files.find(f=>f.path==='search_docs/_umf/sources.json')!.text)).toEqual(req.sources);
 expect(result.dispositions.filter(d=>d.pointer.includes('/search/')).every(d=>d.checks.includes('informational'))).toBe(true);
});
test('unknown selected search meaning refuses in strict and report modes',()=>{
 const {req}=candidate(d=>{Object.assign(d.modules[0]!.extensions['umf.access'].search[0]!,{futureRanking:'opaque'});});
 for(const mode of ['strict','report'] as const){const result=generateAccessPackage({...req,mode},profile());expect(result.outcome).toBe('refused');expect(result.files).toEqual([]);expect(result.diagnostics.some(d=>d.code==='SEARCH_DECLARATION')).toBe(true);}
});
test('vector dimensions, source family, duplicate identity and native binding meaning are not guessed',()=>{
 for(const mutate of [
  (d:typeof model)=>{d.modules[0]!.extensions['umf.access'].search[1]!.vector!.dimensions=4;},
  (d:typeof model)=>{d.modules[0]!.extensions['umf.access'].search[0]!.keyword!.source=[{module:'search',element:'embedding'}];},
  (d:typeof model)=>{d.modules[0]!.extensions['umf.access'].search[1]!.id='text';},
  (d:typeof model)=>{Object.assign(d.modules[0]!.extensions['umf.access'].searchBindings[0]!,{extraSemantics:true});},
 ]){const {result}=candidate(mutate);expect(result.outcome).toBe('refused');expect(result.diagnostics.some(d=>d.code==='SEARCH_DECLARATION')).toBe(true);}
});
test('ordinary float fields cannot inherit an indexed nested float carrier',()=>{
 const {result}=candidate(d=>{d.modules[0]!.extensions['umf.access'].search=d.modules[0]!.extensions['umf.access'].search.filter(s=>s.kind!=='vector');});
 expect(result.outcome).toBe('refused');expect(result.diagnostics.some(d=>d.code==='LOSS')).toBe(true);
});
