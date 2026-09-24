import {test,expect} from 'bun:test';
import {createHash} from 'node:crypto';
import Ajv2020 from 'ajv/dist/2020';
import core from '../../spec/core/schema.json';
import schema from '../../spec/extensions/jsonld/compaction-schema.json';
import {equalCompactJsonLdText,equalJsonLdText} from '../../scripts/jsonld-compare';
import {importJsonLdDocument,exportJsonLdDocument,proposeJsonLdCompaction,proposeJsonLdExpansion,proposeJsonLdNodeEdit,readDocument,writeDocument} from '../../src';
const validate=new Ajv2020({strict:false,validateFormats:false}).addSchema(core).compile(schema);
test('US-026-AC9: every pinned compact case, source preservation and explicit corpus discrepancies',async()=>{
 const manifest=await Bun.file('native/jsonld/sources/compact-manifest.jsonld').json(),sources=await Bun.file('native/jsonld/sources/manifest.json').json(),cases=(await Bun.file('fixtures/jsonld/compaction/results.json').json()).cases,oracle=(await Bun.file('fixtures/jsonld/compaction/oracle-results.json').json()).results;
 expect(cases).toHaveLength(246);expect(oracle).toHaveLength(246);expect(cases.map((c:any)=>c.id)).toEqual(manifest.sequence.map((c:any)=>c['@id'].slice(1)));let candidates=0;
 for(const c of cases){const raw=await Bun.file(c.path).text();expect(createHash('sha256').update(raw).digest('hex')).toBe(sources.files.find((s:any)=>s.path===c.path).sha256);const d=importJsonLdDocument(raw,c.inputs),r=await proposeJsonLdCompaction(d,c.compactOptions);expect(validate(r)).toBe(true);expect(r.source).toEqual(d);expect(r.status).toBe(c.positive?'candidate':'blocked');expect(r.resourcesUsed).toEqual(c.resourcesUsed);expect(r.diagnostics).toEqual(c.diagnostics);
 if(r.candidate){candidates++;expect(equalCompactJsonLdText(exportJsonLdDocument(r.candidate),await Bun.file(c.expectedPath).text())).toBe(c.id!=='tp001');}
 for(const format of ['json','yaml'] as const){expect(exportJsonLdDocument(readDocument(writeDocument(r.source,format),format))).toBe(raw);if(r.candidate)expect(exportJsonLdDocument(readDocument(writeDocument(r.candidate,format),format))).toBe(await Bun.file(c.exports.find((e:any)=>e.format===format).path).text());}}
 expect(candidates).toBe(229);
 expect(oracle.filter((o:any)=>o.exports?.some((e:any)=>!e.nativeEqual)).map((o:any)=>o.id)).toEqual(['t0038','t0111','t0113','tc028','tp001']);
 expect(oracle.filter((o:any)=>(o.native==='accepted')!==(o.umf==='candidate')).map((o:any)=>o.id)).toEqual(['t0112','tm023']);
},120000);
test('US-026-AC9: compact exact values, list/JSON ordering, target context, options and copied edits',async()=>{
 const cases=await Bun.file('native/jsonld/examples/compaction-cases.json').json(),saved=(await Bun.file('fixtures/jsonld/compaction/authored/results.json').json()).results,oracle=(await Bun.file('fixtures/jsonld/compaction/authored/oracle-results.json').json()).results;expect(cases).toHaveLength(12);expect(saved).toHaveLength(12);expect(oracle).toHaveLength(12);
 for(const c of cases){const inputs={id:c.id,baseIRI:'https://example.org/source',...c.inputs},options={lossPolicy:'report',...c.options},d=importJsonLdDocument(c.source,inputs),r=await proposeJsonLdCompaction(d,options),e=saved.find((s:any)=>s.id===c.id),n=oracle.find((s:any)=>s.id===c.id);expect(validate(r)).toBe(true);expect(r.source).toEqual(d);expect(r.status).toBe(c.blocked?'blocked':'candidate');expect(r.diagnostics).toEqual(e.diagnostics);expect(r.resourcesUsed).toEqual(e.resourcesUsed);
 for(const format of ['json','yaml'] as const)expect(exportJsonLdDocument(readDocument(writeDocument(r.source,format),format))).toBe(c.source);
 if(c.blocked){expect(r.candidate).toBeUndefined();expect(n.native).toBe(c.id==='loss-reject'?'accepted':'rejected');continue;}
 expect(equalCompactJsonLdText(exportJsonLdDocument(r.candidate!),c.expected)).toBe(true);const before=await proposeJsonLdExpansion(d,{lossPolicy:'report'}),after=await proposeJsonLdExpansion(r.candidate!,{lossPolicy:'report'});expect(before.status).toBe('candidate');expect(after.status).toBe('candidate');expect(equalJsonLdText(exportJsonLdDocument(before.candidate!),exportJsonLdDocument(after.candidate!))).toBe(true);expect(n.native).toBe('accepted');expect(n.expectedEqual).toBe(!['absolute-id','empty-custom-index'].includes(c.id));
 for(const out of e.exports)expect(exportJsonLdDocument(readDocument(writeDocument(r.candidate!,out.format),out.format))).toBe(await Bun.file(out.path).text());
 if(c.edit){const edited=await proposeJsonLdCompaction(proposeJsonLdNodeEdit(d,c.edit.pointer,c.edit.text).document,options);expect(equalCompactJsonLdText(exportJsonLdDocument(edited.candidate!),c.editedExpected)).toBe(true);expect(n.editedEqual).toBe(true);for(const out of e.edits)expect(exportJsonLdDocument(readDocument(writeDocument(edited.candidate!,out.format),out.format))).toBe(await Bun.file(out.path).text());}expect(exportJsonLdDocument(d)).toBe(c.source);
 }
 expect(equalCompactJsonLdText('{"aliasedList":[1,2]}','{"aliasedList":[2,1]}')).toBe(false);expect(equalCompactJsonLdText('{"@context":[{"p":"urn:first"},{"p":"urn:second"}]}','{"@context":[{"p":"urn:second"},{"p":"urn:first"}]}')).toBe(false);
});
test('US-026-AC9: required context, explicit policies, unknown content and isolated target contexts',async()=>{
 const d=importJsonLdDocument('{"urn:p":"x"}',{id:'guard',baseIRI:'https://example.org/'});for(const options of [{lossPolicy:'report'},{context:'{}'},{context:'{}',lossPolicy:'report',compactArrays:1},{context:'{}',lossPolicy:'report',compactToRelative:'true'}])await expect(proposeJsonLdCompaction(d,options as any)).rejects.toThrow();
 const unknown=structuredClone(d);(unknown.modules[0]!.elements[0]!.extensions['umf.jsonld'] as any).future={semantic:'kept'};const r=await proposeJsonLdCompaction(unknown,{lossPolicy:'report',context:'{}'});expect(r.status).toBe('blocked');expect(r.source).toEqual(unknown);expect(r.candidate).toBeUndefined();
 for(const term of ['first','second']){const input=importJsonLdDocument('{"urn:p":"x"}',{id:'isolation',baseIRI:'https://example.org/',contexts:[{url:'https://example.org/context',text:JSON.stringify({'@context':{[term]:'urn:p'}})}]}),r=await proposeJsonLdCompaction(input,{lossPolicy:'reject',context:'"https://example.org/context"'});expect(r.status).toBe('candidate');expect(r.resourcesUsed).toEqual(['https://example.org/context']);expect(exportJsonLdDocument(r.candidate!)).toContain('"'+term+'":"x"');}
});
