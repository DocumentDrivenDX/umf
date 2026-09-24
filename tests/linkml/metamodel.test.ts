import {test,expect} from 'bun:test';
import {createHash} from 'node:crypto';
import {importLinkmlDocument,exportLinkmlDocument,inspectLinkmlDocument,getLinkmlDocumentNode,proposeLinkmlDocumentNodeEdit,readDocument,writeDocument} from '../../src';
const base='fixtures/linkml/metamodel/',sha=(s:string)=>createHash('sha256').update(s).digest('hex');
test('US-024-AC4: every pinned metamodel source and metadata candidate retains native outcomes',async()=>{
 const cases=(await Bun.file(base+'results.json').json()).results,oracle=await Bun.file(base+'oracle-results.json').json(),upstream=await Bun.file('native/linkml/sources/manifest.json').json();
 expect(cases.map((c:any)=>c.path)).toEqual(upstream.files.filter((f:any)=>f.upstreamPath.startsWith('linkml_model/model/schema/')&&f.upstreamPath.endsWith('.yaml')).map((f:any)=>f.path));expect(cases).toHaveLength(10);expect(oracle.results).toHaveLength(20);expect(oracle.outcomes.every((x:any)=>x.native==='accepted'&&x.normalizedSchemaErrors.length===0)).toBe(true);expect(oracle.results.filter((r:any)=>!r.sourceSchemaValid)).toHaveLength(2);
 for(const c of cases){const raw=await Bun.file(c.path).text(),d=importLinkmlDocument(raw,{id:c.id,format:'yaml'}),candidate=proposeLinkmlDocumentNodeEdit(d,c.editPath,JSON.stringify(c.value));expect(sha(raw)).toBe(c.sourceSha256);
  for(const f of ['json','yaml'] as const){const r=oracle.results.find((r:any)=>r.id===c.id&&r.format===f),restored=readDocument(writeDocument(d,f),f);expect(exportLinkmlDocument(restored)).toBe(raw);expect(sha(exportLinkmlDocument(restored,'json'))).toBe(r.roundtripSha256);expect(sha(exportLinkmlDocument(readDocument(writeDocument(candidate.document,f),f),'json'))).toBe(r.editedSha256);expect(!inspectLinkmlDocument(d).diagnostics.some(x=>x.code==='LINKML_NATIVE_SCHEMA')).toBe(r.sourceSchemaValid);expect(!candidate.validation.diagnostics.some(x=>x.code==='LINKML_NATIVE_SCHEMA')).toBe(r.candidateSchemaValid);}
  expect(exportLinkmlDocument(d)).toBe(raw);
 }
},30000);
test('US-024-AC4: native singleton normalization never overwrites compact source',async()=>{
 const oracle=await Bun.file(base+'oracle-results.json').json(),types=oracle.outcomes.find((x:any)=>x.path.endsWith('/types.yaml')),raw=await Bun.file(types.path).text(),d=importLinkmlDocument(raw,{id:'types',format:'yaml'});
 expect(types.singletonNotes.normalized).toEqual([types.singletonNotes.source]);expect(getLinkmlDocumentNode(d,'/types/decimal/notes')).toEqual({kind:'string',value:types.singletonNotes.source});expect(exportLinkmlDocument(d)).toBe(raw);expect(inspectLinkmlDocument(d).complete).toBe(false);
});
test('US-024-AC4: extended integer type boundaries stay numeric and exact',async()=>{
 const raw=await Bun.file('native/linkml/sources/linkml_model/model/schema/extended_types.yaml').text(),d=importLinkmlDocument(raw,{id:'integer-types',format:'yaml'});
 expect(getLinkmlDocumentNode(d,'/types/int64/minimum_value')).toEqual({kind:'number',value:'-9223372036854775808'});
 expect(getLinkmlDocumentNode(d,'/types/int64/maximum_value')).toEqual({kind:'number',value:'9223372036854775807'});
 expect(getLinkmlDocumentNode(d,'/types/uint64/maximum_value')).toEqual({kind:'number',value:'18446744073709551615'});
 expect(exportLinkmlDocument(d)).toBe(raw);
});
