import {test,expect} from 'bun:test';
import {createHash} from 'node:crypto';
import {importOdcsDocument,exportOdcsDocument,inspectOdcsDocument,proposeOdcsDocumentNodeEdit,getOdcsDocumentNode,readDocument,writeDocument,ODCS_EXTENSION} from '../../src';
const base='fixtures/odcs/',sha=(v:string|Uint8Array)=>createHash('sha256').update(v).digest('hex');
test('US-023-AC1/3: all upstream contracts preserve original bytes and native candidate outcomes',async()=>{
 const cases=(await Bun.file(base+'results.json').json()).results,oracle=await Bun.file(base+'oracle-results.json').json();expect(cases).toHaveLength(42);expect(oracle.results).toHaveLength(84);expect(oracle.results.filter((r:any)=>r.nativeValid)).toHaveLength(78);
 for(const c of cases){expect(c.error).toBeUndefined();const raw=await Bun.file(c.path).text(),d=importOdcsDocument(raw,{id:c.id,format:'yaml'});expect(sha(raw)).toBe(c.sourceSha256);const candidate=proposeOdcsDocumentNodeEdit(d,c.editPath,JSON.stringify(c.value));
  for(const f of ['json','yaml'] as const){const r=oracle.results.find((r:any)=>r.id===c.id&&r.format===f),restored=readDocument(writeDocument(d,f),f);expect(exportOdcsDocument(restored)).toBe(raw);expect(sha(exportOdcsDocument(restored,'json'))).toBe(r.roundtripSha256);expect(sha(exportOdcsDocument(readDocument(writeDocument(candidate.document,f),f),'json'))).toBe(r.editedSha256);expect(!inspectOdcsDocument(d).diagnostics.some(x=>x.code==='ODCS_NATIVE_SCHEMA')).toBe(r.nativeValid);expect(!candidate.validation.diagnostics.some(x=>x.code==='ODCS_NATIVE_SCHEMA')).toBe(r.candidateNativeValid);}
  expect(exportOdcsDocument(d)).toBe(raw);
 }
 const p=await Bun.file('native/odcs/sources/manifest.json').json();for(const f of p.files)expect(sha(await Bun.file(f.path).bytes())).toBe(f.sha256);
},30000);
test('US-023-AC2: exact future values, invalid native shapes and representation boundaries remain explicit',()=>{
 const text='# Original comment\napiVersion: v99.0.0\nnumber: 9007199254740993\nnested: {unknown: null}\n';const d=importOdcsDocument(text,{id:'future',format:'yaml'});expect(exportOdcsDocument(d)).toBe(text);expect(exportOdcsDocument(d,'json')).toContain('9007199254740993');expect(inspectOdcsDocument(d).complete).toBe(false);expect(inspectOdcsDocument(d).diagnostics.some(x=>x.code==='ODCS_VERSION')).toBe(true);
 const node=getOdcsDocumentNode(d,'/nested');if(node.kind==='object')node.members={};expect(exportOdcsDocument(d)).toBe(text);
 const c=proposeOdcsDocumentNodeEdit(d,'/nested/unknown','{"future":true}');expect(exportOdcsDocument(c.document,'yaml')).toContain('9007199254740993');expect((c.document.modules[0]!.elements[0]!.extensions[ODCS_EXTENSION] as any).originalSource).toBe(text);expect(exportOdcsDocument(d)).toBe(text);
 expect(()=>proposeOdcsDocumentNodeEdit(d,'','[]')).toThrow();expect(()=>proposeOdcsDocumentNodeEdit(d,'/missing','1')).toThrow();expect(exportOdcsDocument(d)).toBe(text);
 (d.modules[0]!.elements[0]!.extensions[ODCS_EXTENSION] as any).futureEncoding=true;expect(()=>exportOdcsDocument(d)).toThrow();expect(readDocument(writeDocument(d,'yaml'),'yaml')).toEqual(d);
 const invalid=importOdcsDocument('{"apiVersion":"v3.2.0"}',{id:'invalid',format:'json'});expect(inspectOdcsDocument(invalid).diagnostics.some(x=>x.code==='ODCS_NATIVE_SCHEMA')).toBe(true);expect(()=>importOdcsDocument('[]',{id:'array',format:'json'})).toThrow();
});
