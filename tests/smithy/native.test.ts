import {test,expect} from 'bun:test';
import {importSmithyJson,exportSmithyJson,inspectSmithy,getSmithyNode,proposeSmithyNodeEdit,writeDocument,readDocument,smithySchema,smithyPackage} from '../../src';
const path='/shapes/sales#Order/members/id/target';
test('US-014-AC1: exact native metadata and recursive service shapes survive JSON/YAML',async()=>{
 const text=await Bun.file('fixtures/smithy/domain.json').text();const doc=importSmithyJson(text,{id:'sales'});
 expect(smithyPackage.schema).toEqual(smithySchema);expect(inspectSmithy(doc).valid).toBe(true);expect(inspectSmithy(doc).complete).toBe(false);
 expect(getSmithyNode(doc,'/metadata/exact')).toEqual({kind:'number',value:'9007199254740993'});
 expect(getSmithyNode(doc,'/metadata/decimal')).toEqual({kind:'number',value:'1.2300'});
 for(const format of ['json','yaml'] as const)expect(exportSmithyJson(readDocument(writeDocument(doc,format),format))).toBe(exportSmithyJson(doc));
 const edited=proposeSmithyNodeEdit(doc,path,'"smithy.api#Integer"').document;expect(getSmithyNode(edited,path)).toEqual({kind:'string',value:'smithy.api#Integer'});expect(getSmithyNode(doc,path)).toEqual({kind:'string',value:'sales#OrderId'});
 expect(()=>proposeSmithyNodeEdit(doc,path,'42')).toThrow();
});
test('US-014-AC2: unknown native meaning survives; unknown representation blocks export',()=>{
 const doc=importSmithyJson('{"smithy":"2.0","future":true,"shapes":{"a.b#X":{"type":"futureShape","traits":{"a.b#unknown":{"n":9007199254740993}}}}}',{id:'unknown'});
 expect(exportSmithyJson(doc)).toContain('9007199254740993');expect(inspectSmithy(doc).diagnostics.some(d=>d.code==='SMITHY_SHAPE_TYPE')).toBe(true);
 const value=doc.modules[0]!.elements[0]!.extensions!['umf.smithy'] as any;value.future={meaning:1};
 const restored=readDocument(writeDocument(doc,'yaml'),'yaml');expect(restored).toEqual(doc);expect(()=>exportSmithyJson(restored)).toThrow('Unknown representation');
 expect(()=>importSmithyJson('{"smithy":"2.0","shapes":{"a#L":{"type":"list"}}}',{id:'invalid'})).toThrow();
});
test('US-014-AC3: every pinned upstream valid-loader JSON fixture round-trips',async()=>{
 const manifest=await Bun.file('fixtures/smithy/upstream/manifest.json').json();let count=0;
 for(const row of manifest.files.filter((x:any)=>x.file.endsWith('.json'))){
  const text=await Bun.file('fixtures/smithy/upstream/'+row.file).text();
  expect(new Bun.CryptoHasher('sha256').update(text).digest('hex')).toBe(row.sha256);
  const doc=importSmithyJson(text,{id:row.file});expect(exportSmithyJson(readDocument(writeDocument(doc,'yaml'),'yaml'))).toBe(exportSmithyJson(doc));count++;
 }
 expect(count).toBe(63);
});
