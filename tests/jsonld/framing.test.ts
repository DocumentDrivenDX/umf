import {test,expect} from 'bun:test';
import {parseNativeJson} from '../../src/model/native-json';
import {createHash} from 'node:crypto';
import Ajv2020 from 'ajv/dist/2020';
import core from '../../spec/core/schema.json';
import schema from '../../spec/extensions/jsonld/framing-schema.json';
import {equalCompactJsonLdText} from '../../scripts/jsonld-compare';
import {importJsonLdDocument,exportJsonLdDocument,proposeJsonLdFraming,proposeJsonLdNodeEdit,readDocument,writeDocument} from '../../src';
const validate=new Ajv2020({strict:false,validateFormats:false}).addSchema(core).compile(schema);
test('US-026-AC10/11: complete pinned frame corpus, archives and native discrepancies',async()=>{
 const sources=await Bun.file('native/jsonld/framing-sources/manifest.json').json(),cases=(await Bun.file('fixtures/jsonld/framing/results.json').json()).cases,oracle=(await Bun.file('fixtures/jsonld/framing/oracle-results.json').json()).results;
 expect(sources.commit).toBe('3bf782ba9a40dd1b143435abe386d38df64f2b47');expect(sources.files).toHaveLength(271);for(const file of sources.files)expect(createHash('sha256').update(await Bun.file(file.path).bytes()).digest('hex')).toBe(file.sha256);
 expect(cases).toHaveLength(92);expect(oracle).toHaveLength(92);expect(cases.map((c:any)=>c.id)).toEqual(sources.cases.map((c:any)=>c['@id'].slice(1)));let candidates=0;
 for(const c of cases){const raw=await Bun.file(c.path).text();expect(createHash('sha256').update(raw).digest('hex')).toBe(sources.files.find((s:any)=>s.path===c.path).sha256);const d=importJsonLdDocument(raw,c.inputs),r=await proposeJsonLdFraming(d,c.options);expect(validate(r)).toBe(true);expect(r.source).toEqual(d);expect(r.frame).toEqual(parseNativeJson(c.options.frame));expect(r.status).toBe(c.positive&&!['t0010','tg005','tg008'].includes(c.id)?'candidate':'blocked');expect(r.resourcesUsed).toEqual(c.resourcesUsed);expect(r.diagnostics).toEqual(c.diagnostics);
 if(r.candidate){candidates++;expect(equalCompactJsonLdText(exportJsonLdDocument(r.candidate),await Bun.file(c.expectedPath).text())).toBe(true);}
 for(const format of ['json','yaml'] as const){expect(exportJsonLdDocument(readDocument(writeDocument(r.source,format),format))).toBe(raw);if(r.candidate)expect(exportJsonLdDocument(readDocument(writeDocument(r.candidate,format),format))).toBe(await Bun.file(c.exports.find((e:any)=>e.format===format).path).text());}}
 expect(candidates).toBe(86);expect(oracle.filter((o:any)=>(o.native==='accepted')!==(o.umf==='candidate')).map((o:any)=>o.id)).toEqual(['t0069','tg005','tg008']);expect(oracle.filter((o:any)=>o.exports?.some((e:any)=>!e.nativeEqual)).map((o:any)=>o.id)).toEqual([]);
},120000);
test('US-026-AC10/11: exact values, views, edits, invalid unmatched frames and opaque controls',async()=>{
 const cases=await Bun.file('native/jsonld/examples/framing-cases.json').json(),saved=(await Bun.file('fixtures/jsonld/framing/authored/results.json').json()).results,oracle=(await Bun.file('fixtures/jsonld/framing/authored/oracle-results.json').json()).results;expect(cases).toHaveLength(26);expect(saved).toHaveLength(26);expect(oracle).toHaveLength(26);
 for(const c of cases){const inputs={id:c.id,baseIRI:'https://example.org/source',...c.inputs},options={lossPolicy:'report',...c.options},d=importJsonLdDocument(c.source,inputs),r=await proposeJsonLdFraming(d,options),e=saved.find((s:any)=>s.id===c.id),n=oracle.find((s:any)=>s.id===c.id);expect(validate(r)).toBe(true);expect(r.source).toEqual(d);expect(r.frame).toEqual(parseNativeJson(c.options.frame));expect(r.complete).toBe(false);expect(r.status).toBe(c.blocked?'blocked':'candidate');expect(r.diagnostics).toEqual(e.diagnostics);expect(r.resourcesUsed).toEqual(e.resourcesUsed);
 for(const format of ['json','yaml'] as const)expect(exportJsonLdDocument(readDocument(writeDocument(r.source,format),format))).toBe(c.source);
 if(c.blocked){expect(r.candidate).toBeUndefined();expect(n.native).toBe(c.expectedNative??(c.id==='loss-reject'?'accepted':'rejected'));continue;}
 expect(equalCompactJsonLdText(exportJsonLdDocument(r.candidate!),c.expected)).toBe(true);expect(n.native).toBe(c.id==='opaque-pattern-control'?'rejected':'accepted');if(n.native==='accepted')expect(n.expectedEqual).toBe(c.id!=='default-graph');else expect(n.error).toContain('invalid @type in frame');expect(r.diagnostics.some(d=>d.code==='JSONLD_FRAMING')).toBe(true);
 for(const out of e.exports)expect(exportJsonLdDocument(readDocument(writeDocument(r.candidate!,out.format),out.format))).toBe(await Bun.file(out.path).text());
 if(c.edit){const edited=await proposeJsonLdFraming(proposeJsonLdNodeEdit(d,c.edit.pointer,c.edit.text).document,options);expect(equalCompactJsonLdText(exportJsonLdDocument(edited.candidate!),c.editedExpected)).toBe(true);expect(n.editedEqual).toBe(true);for(const out of e.edits)expect(exportJsonLdDocument(readDocument(writeDocument(edited.candidate!,out.format),out.format))).toBe(await Bun.file(out.path).text());}expect(exportJsonLdDocument(d)).toBe(c.source);
 }
});
test('US-026-AC10: framing option validation, unknown representation and context isolation',async()=>{
 const d=importJsonLdDocument('{"urn:p":"x"}',{id:'guard',baseIRI:'https://example.org/'});for(const options of [{lossPolicy:'report'},{frame:'{}'},{frame:'{}',lossPolicy:'report',explicit:null},{frame:'{}',lossPolicy:'report',embed:'@link'},{frame:'{}',lossPolicy:'report',frameDefault:1}])await expect(proposeJsonLdFraming(d,options as any)).rejects.toThrow();
 for(const embed of [true,false]){const r=await proposeJsonLdFraming(d,{frame:'{}',lossPolicy:'report',embed});expect(r.status).toBe('candidate');expect(r.framingOptions.embed).toBe(embed?'@once':'@never');}
 const unknown=structuredClone(d);(unknown.modules[0]!.elements[0]!.extensions['umf.jsonld'] as any).future={semantic:'kept'};const r=await proposeJsonLdFraming(unknown,{lossPolicy:'report',frame:'{}'});expect(r.status).toBe('blocked');expect(r.source).toEqual(unknown);expect(r.candidate).toBeUndefined();
 for(const term of ['first','second']){const input=importJsonLdDocument('{"urn:p":"x"}',{id:'isolation',baseIRI:'https://example.org/',contexts:[{url:'https://example.org/context',text:JSON.stringify({'@context':{[term]:'urn:p'}})}]}),r=await proposeJsonLdFraming(input,{lossPolicy:'reject',frame:'{"@context":"https://example.org/context"}'});expect(r.status).toBe('candidate');expect(r.resourcesUsed).toEqual(['https://example.org/context']);expect(exportJsonLdDocument(r.candidate!)).toContain('"'+term+'":"x"');}
});
