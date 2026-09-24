import {test,expect} from 'bun:test';
import {dirname,basename} from 'node:path';
import corpus from '../../fixtures/typespec/corpus-results.json';
import libraryManifest from '../../spec/extensions/typespec/libraries-manifest.json';
import {importTypeSpecSources,compileTypeSpecDocument,exportTypeSpecSources,readDocument,writeDocument} from '../../src';
const libraries=Object.fromEntries(libraryManifest.map(p=>[p.package,p.version]));
test('US-013-AC11: all registered official libraries compile the upstream corpus with explicit remaining failures',async()=>{
 const rows=[];
 for(const row of corpus.programs){
  if(row.status==='syntax-rejected'){rows.push({entry:row.entry,status:row.status});continue;}
  const files:Record<string,string>={};for(const name of row.sourceFiles)files[name]=await Bun.file('fixtures/typespec/upstream/'+dirname(row.entry)+'/'+name).text();
  const input={entrypoint:basename(row.entry),files,libraries};const doc=importTypeSpecSources(input,{id:row.entry});const before=await compileTypeSpecDocument(doc);
  const round=readDocument(writeDocument(doc,'yaml'),'yaml');expect(exportTypeSpecSources(round)).toEqual(input);expect(await compileTypeSpecDocument(round)).toEqual(before);
  rows.push({entry:row.entry,status:before.valid?'compiled':'compiler-errors',diagnostics:before.diagnostics,sourceFiles:row.sourceFiles});
 }
 await Bun.write('fixtures/typespec/all-library-corpus-results.json',JSON.stringify({compiler:'@typespec/compiler@1.16.0',libraries,programs:rows},null,2)+'\n');
 expect(rows.filter(r=>r.status==='compiled').length).toBe(29);
},30000);
