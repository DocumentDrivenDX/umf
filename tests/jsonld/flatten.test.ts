import {test,expect} from 'bun:test';
import {createHash} from 'node:crypto';
import Ajv2020 from 'ajv/dist/2020';
import core from '../../spec/core/schema.json';
import schema from '../../spec/extensions/jsonld/flatten-schema.json';
import {equalJsonLdText} from '../../scripts/jsonld-compare';
import {importJsonLdDocument,exportJsonLdDocument,proposeJsonLdFlatten,proposeJsonLdNodeEdit,readDocument,writeDocument} from '../../src';
const validate=new Ajv2020({strict:false,validateFormats:false}).addSchema(core).compile(schema);
test('US-026-AC8: full pinned flatten corpus, archives, report schema and qualified oracle',async()=>{
 const manifest=await Bun.file('native/jsonld/sources/flatten-manifest.jsonld').json(),sources=await Bun.file('native/jsonld/sources/manifest.json').json(),cases=(await Bun.file('fixtures/jsonld/flatten/results.json').json()).cases,oracle=(await Bun.file('fixtures/jsonld/flatten/oracle-results.json').json()).results;
 expect(cases).toHaveLength(58);expect(cases.map((c:any)=>c.id)).toEqual(manifest.sequence.map((c:any)=>c['@id'].slice(1)));let candidates=0;
 for(const c of cases){const raw=await Bun.file(c.path).text();expect(createHash('sha256').update(raw).digest('hex')).toBe(sources.files.find((s:any)=>s.path===c.path).sha256);const d=importJsonLdDocument(raw,c.inputs),r=await proposeJsonLdFlatten(d,c.flattenOptions);expect(validate(r)).toBe(true);expect(r.source).toEqual(d);expect(r.status).toBe(c.positive?'candidate':'blocked');expect(r.resourcesUsed).toEqual(c.resourcesUsed);expect(r.diagnostics).toEqual(c.diagnostics);
 if(r.candidate){candidates++;expect(equalJsonLdText(exportJsonLdDocument(r.candidate),await Bun.file(c.expectedPath).text())).toBe(true);const native=oracle.find((o:any)=>o.id===c.id);if(c.id==='t0026')expect(native.native).toBe('rejected');else{expect(native.native).toBe('accepted');expect(native.exports.every((e:any)=>e.nativeEqual)).toBe(!['t0014','t0038'].includes(c.id));expect(native.exports.every((e:any)=>e.officialEqual)).toBe(true);}}
 for(const format of ['json','yaml'] as const){expect(exportJsonLdDocument(readDocument(writeDocument(r.source,format),format))).toBe(raw);if(r.candidate)expect(exportJsonLdDocument(readDocument(writeDocument(r.candidate,format),format))).toBe(await Bun.file(c.exports.find((e:any)=>e.format===format).path).text());}}
 expect(candidates).toBe(57);
},120000);
test('US-026-AC8: precision, lists, graph merging, remote compaction, duplicates and copied edits',async()=>{
 const cases=await Bun.file('native/jsonld/examples/flatten-cases.json').json(),saved=(await Bun.file('fixtures/jsonld/flatten/authored/results.json').json()).results,oracle=(await Bun.file('fixtures/jsonld/flatten/authored/oracle-results.json').json()).results;expect(cases).toHaveLength(14);expect(saved).toHaveLength(14);expect(oracle).toHaveLength(14);
 for(const c of cases){const inputs={id:c.id,baseIRI:'https://example.org/source',...c.inputs},options={lossPolicy:'report',...c.options},d=importJsonLdDocument(c.source,inputs),r=await proposeJsonLdFlatten(d,options),e=saved.find((s:any)=>s.id===c.id),n=oracle.find((s:any)=>s.id===c.id);expect(validate(r)).toBe(true);expect(r.source).toEqual(d);expect(r.status).toBe(c.blocked?'blocked':'candidate');expect(r.diagnostics).toEqual(e.diagnostics);expect(r.resourcesUsed).toEqual(e.resourcesUsed);
 for(const format of ['json','yaml'] as const)expect(exportJsonLdDocument(readDocument(writeDocument(r.source,format),format))).toBe(c.source);
 if(c.blocked){expect(r.candidate).toBeUndefined();expect(n.native).toBe(c.id==='loss-reject'?'accepted':'rejected');continue;}
 expect(equalJsonLdText(exportJsonLdDocument(r.candidate!),c.expected)).toBe(true);expect(n.native).toBe('accepted');expect(n.expectedEqual).toBe(!['signed-zero','direction-distinction'].includes(c.id));
 for(const out of e.exports)expect(exportJsonLdDocument(readDocument(writeDocument(r.candidate!,out.format),out.format))).toBe(await Bun.file(out.path).text());
 if(c.edit){const edited=await proposeJsonLdFlatten(proposeJsonLdNodeEdit(d,c.edit.pointer,c.edit.text).document,options);expect(equalJsonLdText(exportJsonLdDocument(edited.candidate!),c.editedExpected)).toBe(true);expect(n.editedEqual).toBe(true);for(const out of e.edits)expect(exportJsonLdDocument(readDocument(writeDocument(edited.candidate!,out.format),out.format))).toBe(await Bun.file(out.path).text());}expect(exportJsonLdDocument(d)).toBe(c.source);
 }
});
test('US-026-AC8: explicit options, null context, unknown preservation and isolated contexts',async()=>{
 const d=importJsonLdDocument('{"urn:p":"x"}',{id:'guard',baseIRI:'https://example.org/'});await expect(proposeJsonLdFlatten(d,{} as any)).rejects.toThrow('Explicit');await expect(proposeJsonLdFlatten(d,{lossPolicy:'report',compactArrays:1} as any)).rejects.toThrow();await expect(proposeJsonLdFlatten(d,{lossPolicy:'report',context:'{'})).rejects.toThrow();
 const a=await proposeJsonLdFlatten(d,{lossPolicy:'report'}),b=await proposeJsonLdFlatten(d,{lossPolicy:'report',context:'null'});expect(exportJsonLdDocument(a.candidate!)).toBe(exportJsonLdDocument(b.candidate!));expect(validate(b)).toBe(true);
 const unknown=structuredClone(d);(unknown.modules[0]!.elements[0]!.extensions['umf.jsonld'] as any).future={semantic:'kept'};const r=await proposeJsonLdFlatten(unknown,{lossPolicy:'report'});expect(r.status).toBe('blocked');expect(r.source).toEqual(unknown);expect(r.candidate).toBeUndefined();
 for(const term of ['first','second']){const input=importJsonLdDocument('{"urn:p":"x"}',{id:'isolation',baseIRI:'https://example.org/',contexts:[{url:'https://example.org/context',text:JSON.stringify({'@context':{[term]:'urn:p'}})}]}),r=await proposeJsonLdFlatten(input,{lossPolicy:'reject',context:'"https://example.org/context"'});expect(r.status).toBe('candidate');expect(r.resourcesUsed).toEqual(['https://example.org/context']);expect(exportJsonLdDocument(r.candidate!)).toContain('"'+term+'":"x"');}
});
