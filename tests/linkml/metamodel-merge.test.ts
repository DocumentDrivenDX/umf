import {test,expect} from 'bun:test';
import {createHash} from 'node:crypto';
import {importLinkmlDocument,inspectLinkmlDocument,exportLinkmlDocument,proposeLinkmlImportMerge,readDocument,writeDocument} from '../../src';
const base='fixtures/linkml/metamodel-merge/',sha=(s:string)=>createHash('sha256').update(s).digest('hex');
test('US-024-AC10: every pinned metamodel entry merges under both policies with complete native comparison',async()=>{
 const fixture=await Bun.file(base+'results.json').json(),oracle=await Bun.file(base+'oracle-results.json').json(),manifest=await Bun.file('native/linkml/sources/manifest.json').json(),sources=[];
 expect(fixture.sources.map((s:any)=>s.path)).toEqual(manifest.files.filter((f:any)=>f.upstreamPath.startsWith('linkml_model/model/schema/')&&f.path.endsWith('.yaml')).map((f:any)=>f.path));expect(fixture.sources).toHaveLength(10);expect(oracle.results).toHaveLength(20);
 for(const s of fixture.sources){const raw=await Bun.file(s.path).text();expect(sha(raw)).toBe(manifest.files.find((f:any)=>f.path===s.path).sha256);sources.push({key:s.key,document:importLinkmlDocument(raw,{id:s.path,format:'yaml'})});}
 let formats=0;
 for(const c of fixture.cases){const context={entry:c.entry,schemas:sources,bindings:fixture.bindings},r=proposeLinkmlImportMerge(context,{mode:c.mode}),native=oracle.results.find((n:any)=>n.entry===c.entry&&n.mode===c.mode);expect(r.context).toEqual(context);expect(r.status).toBe('candidate');expect(r.closure).toEqual(native.closure);expect(r.selections).toEqual(c.selections);expect(native.rawSchemaErrors).toBe(17);expect(native.normalizedSchemaErrors).toBe(0);expect(inspectLinkmlDocument(r.candidate!).diagnostics.some(d=>d.code==='LINKML_NATIVE_SCHEMA')).toBe(true);
  for(const format of ['json','yaml'] as const){const output=exportLinkmlDocument(readDocument(writeDocument(r.candidate!,format),format));expect(output).toBe(await Bun.file(c.outputPath).text());expect(sha(output)).toBe(native.outputSha256);formats++;}
  expect(r.selections.length).toBe(Object.values(native.definitions).reduce((n:any,v:any)=>n+v,0) as number);
 }
 expect(formats).toBe(40);
},60000);
