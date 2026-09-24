import {test,expect} from 'bun:test';
import {createHash} from 'node:crypto';
import {dirname,basename} from 'node:path';
import manifest from '../../fixtures/typespec/upstream/manifest.json';
import {importTypeSpecSources,exportTypeSpecSources,compileTypeSpecDocument,writeDocument,readDocument,getTypeSpecSemanticGraph} from '../../src';
test('US-013-AC7: every pinned upstream sample is accounted for without hiding compiler limits',async()=>{
 const all=new Map<string,string>();
 for(const file of manifest.files){const bytes=await Bun.file('fixtures/typespec/upstream/'+file.path).arrayBuffer();expect(createHash('sha256').update(new Uint8Array(bytes)).digest('hex')).toBe(file.sha256);all.set(file.path,new TextDecoder('utf-8',{ignoreBOM:true}).decode(bytes));}
 const roots=[...all.keys()].filter(p=>basename(p)==='main.tsp'||basename(p)==='petstore.tsp').sort();
 const rows=[];
 for(const entry of roots){
  const folder=dirname(entry)+'/';const files=Object.fromEntries([...all].filter(([p])=>p.startsWith(folder)&&p.endsWith('.tsp')).map(([p,text])=>[p.slice(folder.length),text]));
  const contextFiles=[...all.keys()].filter(p=>p.startsWith(folder)&&!p.endsWith('.tsp'));
  let doc;try{doc=importTypeSpecSources({entrypoint:basename(entry),files},{id:entry});}catch(error){rows.push({entry,sourceFiles:Object.keys(files),contextFiles,status:'syntax-rejected',error:String(error)});continue;}
  const original=await compileTypeSpecDocument(doc);
  for(const format of ['json','yaml'] as const){const restored=readDocument(writeDocument(doc,format),format);expect(exportTypeSpecSources(restored)).toEqual({entrypoint:basename(entry),files});expect(await compileTypeSpecDocument(restored)).toEqual(original);}
  rows.push({entry,sourceFiles:Object.keys(files),contextFiles,status:original.valid?'compiled':'compiler-errors',diagnostics:original.diagnostics});
 }
 const report={commit:manifest.commit,compiler:'@typespec/compiler@1.16.0',fileCount:manifest.files.length,sourceFileCount:[...all.keys()].filter(p=>p.endsWith('.tsp')).length,programs:rows,scope:'All upstream samples/specs archived; only supplied .tsp source bundles compiled. Context/config/JS files retained as corpus evidence, not interpreted or executed by this adapter'};
 await Bun.write('fixtures/typespec/corpus-results.json',JSON.stringify(report,null,2)+'\n');
 expect(rows.length).toBe(roots.length);expect(rows.some(r=>r.status==='compiled')).toBe(true);
});
test('US-013-AC8: upstream string templates expose compiled values after source round trip',async()=>{
 const text=await Bun.file('fixtures/typespec/upstream/string-template/main.tsp').text();const doc=importTypeSpecSources({entrypoint:'main.tsp',files:{'main.tsp':text}},{id:'string-template'});
 const graph=await getTypeSpecSemanticGraph(doc,{roots:['Person','Cat']});expect(graph.status).toBe('available');expect(graph.nodes.some(n=>n.attributes.stringValue==='Simple 123 end')).toBe(true);
 expect(await getTypeSpecSemanticGraph(readDocument(writeDocument(doc,'yaml'),'yaml'),{roots:['Person','Cat']})).toEqual(graph);
});
