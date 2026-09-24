import {test,expect} from 'bun:test';
import {dirname,basename} from 'node:path';
import corpus from '../../fixtures/typespec/corpus-results.json';
import {importTypeSpecSources,exportTypeSpecSources,compileTypeSpecDocument,readDocument,writeDocument,inspectTypeSpec} from '../../src';
const libraries={'@typespec/http':'1.16.0','@typespec/rest':'0.86.0','@typespec/openapi':'1.16.0','@typespec/streams':'0.86.0'};
test('US-013-AC9: exact library selections survive round trip and reject unavailable versions',async()=>{
 const input={entrypoint:'main.tsp',libraries,files:{'main.tsp':'import "@typespec/http"; using TypeSpec.Http; @service namespace Demo; @route("/x") @get op read(): string;'}};
 const doc=importTypeSpecSources(input,{id:'libraries'});const report=await compileTypeSpecDocument(doc);expect(report.valid).toBe(true);expect(report.libraries).toEqual(libraries);
 for(const format of ['json','yaml'] as const){const round=readDocument(writeDocument(doc,format),format);expect(exportTypeSpecSources(round)).toEqual(input);expect(await compileTypeSpecDocument(round)).toEqual(report);}
 const unavailable=importTypeSpecSources({...input,libraries:{'@typespec/http':'0.0.0'}},{id:'missing'});expect(inspectTypeSpec(unavailable).diagnostics.some(d=>d.code==='TYPESPEC_LIBRARY_UNAVAILABLE')).toBe(true);expect(exportTypeSpecSources(unavailable).libraries).toEqual({'@typespec/http':'0.0.0'});await expect(compileTypeSpecDocument(unavailable)).rejects.toThrow('No registered library');
 expect((await compileTypeSpecDocument(importTypeSpecSources({...input,libraries:{}},{id:'disabled'}))).valid).toBe(false);
});
test('US-013-AC10: library-enabled upstream corpus outcomes remain explicit',async()=>{
 const rows=[];
 for(const row of corpus.programs){
  if(row.status==='syntax-rejected'){rows.push({entry:row.entry,status:row.status});continue;}
  const files:Record<string,string>={};for(const file of row.sourceFiles)files[file]=await Bun.file('fixtures/typespec/upstream/'+dirname(row.entry)+'/'+file).text();
  const input={entrypoint:basename(row.entry),files,libraries};const doc=importTypeSpecSources(input,{id:row.entry});const before=await compileTypeSpecDocument(doc);
  const after=readDocument(writeDocument(doc,'yaml'),'yaml');expect(exportTypeSpecSources(after)).toEqual(input);expect(await compileTypeSpecDocument(after)).toEqual(before);
  rows.push({entry:row.entry,status:before.valid?'compiled':'compiler-errors',diagnostics:before.diagnostics,previousStatus:row.status,sourceFiles:row.sourceFiles});
 }
 expect(rows.filter(r=>r.status==='compiled').length).toBeGreaterThan(2);
 await Bun.write('fixtures/typespec/library-corpus-results.json',JSON.stringify({compiler:'@typespec/compiler@1.16.0',libraries,programs:rows},null,2)+'\n');
});
