import {test,expect} from 'bun:test';
import {importSmithySources,exportSmithySources,exportSmithyJson,proposeSmithySourceEdit,inspectSmithy,readDocument,writeDocument} from '../../src';
test('US-014-AC7: IDL/JSON source bundles preserve exact text and candidate edits',async()=>{
 const files={'main.smithy':await Bun.file('fixtures/smithy/idl/main.smithy').text(),'common.smithy':await Bun.file('fixtures/smithy/idl/common.smithy').text(),'extra.json':'{"smithy":"2.0","metadata":{"other":1.2300}}'};
 const doc=importSmithySources({files},{id:'sources'});
 for(const format of ['json','yaml'] as const)expect(exportSmithySources(readDocument(writeDocument(doc,format),format))).toEqual({files});
 expect(inspectSmithy(doc).complete).toBe(false);expect(inspectSmithy(doc).diagnostics.some(x=>x.code==='SMITHY_SOURCE_UNVALIDATED')).toBe(true);
 const edited=proposeSmithySourceEdit(doc,'common.smithy',files['common.smithy'].replace('string OrderId','integer OrderId'));
 expect(exportSmithySources(edited.document).files['common.smithy']).toContain('integer OrderId');expect(exportSmithySources(doc).files).toEqual(files);
 expect(()=>exportSmithyJson(doc)).toThrow('JSON AST profile');
 // The source archive must not certify syntax merely because text is serializable.
 expect(inspectSmithy(proposeSmithySourceEdit(doc,'main.smithy','invalid ???').document).complete).toBe(false);
});
test('US-014-AC8: source path constraints and unknown representation remain explicit',()=>{
 for(const name of ['../x.smithy','/x.smithy','x/../y.json','x.ts'])expect(()=>importSmithySources({files:{[name]:'text'}},{id:'bad'})).toThrow();
 expect(()=>importSmithySources({files:{}},{id:'empty'})).toThrow();
 const doc=importSmithySources({files:{'main.smithy':'text'}},{id:'unknown'});(doc.modules[0]!.elements[0]!.extensions!['umf.smithy'] as any).future={retain:true};
 expect(readDocument(writeDocument(doc,'yaml'),'yaml')).toEqual(doc);expect(()=>exportSmithySources(doc)).toThrow('unknown content');
});
test('US-014-AC9: all pinned valid-loader IDL fixtures survive exact source round trips',async()=>{
 const manifest=await Bun.file('fixtures/smithy/idl-upstream/manifest.json').json();const entries=manifest.files.filter((x:any)=>x.file.endsWith('.smithy'));
 for(const row of entries){const text=await Bun.file('fixtures/smithy/idl-upstream/'+row.file).text();expect(new Bun.CryptoHasher('sha256').update(text).digest('hex')).toBe(row.sha256);const doc=importSmithySources({files:{[row.file]:text}},{id:row.file});expect(exportSmithySources(readDocument(writeDocument(doc,'yaml'),'yaml')).files[row.file]).toBe(text);}
 expect(entries.length).toBeGreaterThan(60);
});
const invalidRoot='fixtures/smithy/invalid-upstream/';
const invalidManifest: {files: {file: string; sha256: string}[]} = await Bun.file(invalidRoot+'manifest.json').json();
const invalidModels=invalidManifest.files.filter(row=>/\.(smithy|json)$/.test(row.file));
test('US-014-AC13: pinned invalid-loader inventory and every fixture hash remain intact',async()=>{
 expect(invalidModels.length).toBe(182);
 for(const row of invalidManifest.files){
  const text=await Bun.file(invalidRoot+row.file).text();
  expect(new Bun.CryptoHasher('sha256').update(text).digest('hex')).toBe(row.sha256);
 }
});
// Each source gets its own deadline and failure name; corpus size is not a runtime budget.
test.each(invalidModels)('US-014-AC13: $file retains exact source without claiming validity',async row=>{
 const text=await Bun.file(invalidRoot+row.file).text();
 const doc=importSmithySources({files:{[row.file]:text}},{id:row.file});
 const restored=readDocument(writeDocument(doc,'yaml'),'yaml');
 expect(exportSmithySources(restored).files[row.file]).toBe(text);
 expect(inspectSmithy(restored).complete).toBe(false);
});
