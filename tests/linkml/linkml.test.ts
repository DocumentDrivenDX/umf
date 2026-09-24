import {test,expect} from 'bun:test';
import {createHash} from 'node:crypto';
import {importLinkmlDocument,exportLinkmlDocument,inspectLinkmlDocument,proposeLinkmlDocumentNodeEdit,getLinkmlDocumentNode,readDocument,writeDocument,LINKML_EXTENSION} from '../../src';
const base='fixtures/linkml/',sha=(v:string|Uint8Array)=>createHash('sha256').update(v).digest('hex');
test('US-024-AC1/3: all upstream contracts preserve original bytes and native candidate outcomes',async()=>{
 const cases=(await Bun.file(base+'results.json').json()).results,oracle=await Bun.file(base+'oracle-results.json').json();expect(cases).toHaveLength(11);expect(oracle.results).toHaveLength(22);expect(oracle.outcomes.filter((r:any)=>r.native==='accepted')).toHaveLength(10);expect(oracle.outcomes.filter((r:any)=>r.normalizedSchemaErrors.length)).toHaveLength(1);
 for(const c of cases){expect(c.error).toBeUndefined();const raw=await Bun.file(c.path).text(),d=importLinkmlDocument(raw,{id:c.id,format:'yaml'});expect(sha(raw)).toBe(c.sourceSha256);const candidate=proposeLinkmlDocumentNodeEdit(d,c.editPath,JSON.stringify(c.value));
  for(const f of ['json','yaml'] as const){const r=oracle.results.find((r:any)=>r.id===c.id&&r.format===f),restored=readDocument(writeDocument(d,f),f);expect(exportLinkmlDocument(restored)).toBe(raw);expect(sha(exportLinkmlDocument(restored,'json'))).toBe(r.roundtripSha256);expect(sha(exportLinkmlDocument(readDocument(writeDocument(candidate.document,f),f),'json'))).toBe(r.editedSha256);expect(!inspectLinkmlDocument(d).diagnostics.some(x=>x.code==='LINKML_NATIVE_SCHEMA')).toBe(r.sourceSchemaValid);expect(!candidate.validation.diagnostics.some(x=>x.code==='LINKML_NATIVE_SCHEMA')).toBe(r.candidateSchemaValid);}
  expect(exportLinkmlDocument(d)).toBe(raw);
 }
 const p=await Bun.file('native/linkml/sources/manifest.json').json();for(const f of p.files)expect(sha(await Bun.file(f.path).bytes())).toBe(f.sha256);
},30000);
test('US-024-AC2: schema version is distinct from metamodel version and unknown content stays exact',()=>{
 const text='id: https://example.invalid/future\nname: future\nversion: 99.0.0\nunknown: 9007199254740993\n';const d=importLinkmlDocument(text,{id:'future',format:'yaml'});expect(exportLinkmlDocument(d)).toBe(text);expect(exportLinkmlDocument(d,'json')).toContain('9007199254740993');expect(inspectLinkmlDocument(d).diagnostics.some(x=>x.code==='LINKML_VERSION')).toBe(false);expect(inspectLinkmlDocument(d).diagnostics.some(x=>x.code==='LINKML_NATIVE_SCHEMA')).toBe(false);expect(inspectLinkmlDocument(d).complete).toBe(false);
 const future=importLinkmlDocument(text,{id:'future-meta',format:'yaml',metamodelVersion:'99.0.0'});expect(inspectLinkmlDocument(future).diagnostics.some(x=>x.code==='LINKML_VERSION')).toBe(true);expect(exportLinkmlDocument(future)).toBe(text);
 const c=proposeLinkmlDocumentNodeEdit(d,'/name','"renamed"');expect(exportLinkmlDocument(c.document,'yaml')).toContain('9007199254740993');expect((c.document.modules[0]!.elements[0]!.extensions[LINKML_EXTENSION] as any).originalSource).toBe(text);expect(exportLinkmlDocument(d)).toBe(text);
 expect(()=>proposeLinkmlDocumentNodeEdit(d,'','[]')).toThrow();expect(exportLinkmlDocument(d)).toBe(text);
 (d.modules[0]!.elements[0]!.extensions[LINKML_EXTENSION] as any).futureEncoding=true;expect(()=>exportLinkmlDocument(d)).toThrow();expect(readDocument(writeDocument(d,'yaml'),'yaml')).toEqual(d);
});
