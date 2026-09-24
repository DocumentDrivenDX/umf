import {createValidator} from '../../src/validation/schema';
import {typespecCompilerReportSchema,typespecSyntaxLocationsSchema} from '../../src';
import {test,expect} from 'bun:test';
import {importTypeSpecSources,exportTypeSpecSources,compileTypeSpecDocument,proposeTypeSpecSourceEdit,getTypeSpecSyntax,inspectTypeSpec,writeDocument,readDocument} from '../../src';
async function fixture(){return {entrypoint:'main.tsp',files:{'main.tsp':await Bun.file('fixtures/typespec/project/main.tsp').text(),'common.tsp':await Bun.file('fixtures/typespec/project/common.tsp').text()}};}
test('US-013-AC1: source bundles retain exact files through JSON/YAML and compile',async()=>{
 const source=await fixture();const doc=importTypeSpecSources(source,{id:'typespec'});
 expect(inspectTypeSpec(doc).valid).toBe(true);expect(inspectTypeSpec(doc).complete).toBe(false);
 const compiled=await compileTypeSpecDocument(doc);expect(createValidator().compile(typespecCompilerReportSchema)(compiled)).toBe(true);expect(compiled.diagnostics).toEqual([]);expect(compiled.valid).toBe(true);
 for(const format of ['json','yaml'] as const){const round=readDocument(writeDocument(doc,format),format);expect(exportTypeSpecSources(round)).toEqual(source);expect((await compileTypeSpecDocument(round)).valid).toBe(true);}
 const nodes=getTypeSpecSyntax(doc,'main.tsp');expect(createValidator().compile(typespecSyntaxLocationsSchema)(nodes)).toBe(true);expect(nodes.some(n=>n.kind==='ModelStatement')).toBe(true);expect(nodes.some(n=>n.kind==='InterfaceStatement')).toBe(true);
 const exported=exportTypeSpecSources(doc);exported.files['main.tsp']='';expect(exportTypeSpecSources(doc)).toEqual(source);
 await Bun.write('fixtures/typespec/roundtrip-sources.json',JSON.stringify(exportTypeSpecSources(readDocument(writeDocument(doc,'yaml'),'yaml')),null,2)+'\n');
});
test('US-013-AC2: candidate source edits get fresh native semantic diagnostics',async()=>{
 const source=await fixture();const doc=importTypeSpecSources(source,{id:'typespec'});
 const edited=proposeTypeSpecSourceEdit(doc,'main.tsp',source.files['main.tsp'].replace('total: int32 = 42','total: string = 42'));
 expect(edited.validation.valid).toBe(true);expect((await compileTypeSpecDocument(edited.document)).diagnostics.some(d=>d.code==='unassignable'&&d.severity==='error')).toBe(true);
 expect(exportTypeSpecSources(doc)).toEqual(source);
 await Bun.write('fixtures/typespec/invalid-edited-sources.json',JSON.stringify(exportTypeSpecSources(edited.document),null,2)+'\n');
 const missing=importTypeSpecSources({entrypoint:'main.tsp',files:{'main.tsp':'import "./missing.tsp"; model M {}'}},{id:'missing'});
 expect((await compileTypeSpecDocument(missing)).diagnostics.some(d=>d.code==='import-not-found')).toBe(true);
 expect(()=>importTypeSpecSources({entrypoint:'../main.tsp',files:{'../main.tsp':'model M {}'}},{id:'bad'})).toThrow();
 expect(()=>importTypeSpecSources({entrypoint:'main.tsp',files:{'main.tsp':'model {'}},{id:'bad'})).toThrow();
});
test('US-013-AC3: unknown representation remains in UMF and unsupported imports are explicit',async()=>{
 const doc=importTypeSpecSources(await fixture(),{id:'unknown'});
 (doc.modules[0]!.elements[0]!.extensions['umf.typespec'] as any).future={meaning:'retain'};
 expect(readDocument(writeDocument(doc,'json'),'json')).toEqual(doc);
 expect(inspectTypeSpec(doc).diagnostics.some(d=>d.code==='TYPESPEC_REPRESENTATION')).toBe(true);
 expect(()=>exportTypeSpecSources(doc)).toThrow('discard unknown');
 const js=importTypeSpecSources({entrypoint:'main.tsp',files:{'main.tsp':'import "./custom.js"; model M {}'}},{id:'js'});
 expect((await compileTypeSpecDocument(js)).valid).toBe(false);
});
