import {test,expect} from 'bun:test';
import {createHash} from 'node:crypto';
import * as u from '../../src';
const proof=await Bun.file('fixtures/validation/facets-tablespec-profile-native.json').json();
const rows=proof.declarations as {case:string;sourceText:string;normalizedText?:string;runtimeAccepted:boolean;checkedSchemaAccepted:boolean;raw:{jsonSchemaText:string;sparkSchema:{fields:{type:string}[]};ingestTarget:string};normalized?:{jsonSchemaText:string}}[];
const named=(name:string)=>rows.find(r=>r.case===name)!;
test('TableSpec native facet evidence is pinned and separates generator and execution profiles',async()=>{
 expect(proof.nativeVersion).toBe('647e8e566ad78b864282ec65c0b0b2237aa63084');expect(proof.versions.spark).toBe('4.0.1');expect(proof.versions.greatExpectations).toBe('1.15.1');
 for(const [path,hash] of Object.entries(proof.sha256 as Record<string,string>))expect(createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex'),path).toBe(hash);
 expect(JSON.parse(named('length-one').raw.jsonSchemaText).properties.value.maxLength).toBeUndefined();
 expect(JSON.parse(named('max-only').raw.jsonSchemaText).properties.value.maxLength).toBe(2);
 expect(JSON.parse(named('max-only').normalized!.jsonSchemaText).properties.value.maxLength).toBeUndefined();
 expect(named('decimal-paired').raw.sparkSchema.fields[0]!.type).toBe('decimal(10,0)');expect(named('decimal-paired').raw.ingestTarget).toBe('DECIMAL(5,2)');
 expect(named('decimal-scale-exceeds').runtimeAccepted).toBe(true);expect(proof.nativeTypes.find((r:any)=>r.profile==='decimal-scale-exceeds').accepted).toBe(false);
 expect(named('length-string').runtimeAccepted).toBe(true);expect(named('length-string').checkedSchemaAccepted).toBe(false);
 const casts=proof.ingestCasts as {case:string;ansiEnabled:boolean;output:string|null;errorType:string|null}[];
 expect(casts.filter(r=>r.case==='round').map(r=>r.output)).toEqual(['1.24','1.24']);
 expect(casts.find(r=>r.case==='author-overflow'&&r.ansiEnabled)!.errorType).not.toBeNull();
 expect(casts.find(r=>r.case==='author-overflow'&&!r.ansiEnabled)!.errorType).toBeNull();expect(casts.find(r=>r.case==='author-overflow'&&!r.ansiEnabled)!.output).toBeNull();
 expect(proof.values.find((r:any)=>r.case==='float-narrowing').sparkValueText).toBe('1.0');
 expect(proof.gxLength.find((r:any)=>r.profile==='length-one'&&r.value==='😀').success).toBe(true);
 expect(proof.gxLength.find((r:any)=>r.profile==='length-one'&&r.value==='é').success).toBe(false);
});
test('all discovery inputs retain exact native text through both envelope serializations and explicit migrations',()=>{
 expect(rows).toHaveLength(44);
 for(const row of rows){
  const original=u.importTableSpec(row.sourceText,{id:'facet-discovery:'+row.case,format:'json'});
  let doc=u.upgradeFieldEnvelope(original).target;doc=u.upgradeNullabilityEnvelope(doc).target;doc=u.upgradeCardinalityEnvelope(doc).target;doc=u.upgradeFacetEnvelope(doc).target;
  expect(doc.umf).toBe('0.5.0');expect(doc.extensions).toEqual(original.extensions);expect(doc.modules[0]!.elements[0]!.facets).toBeUndefined();
  for(const format of ['json','yaml'] as const){const recovered=u.readDocument(u.writeDocument(doc,format),format);expect(u.exportTableSpec(recovered)).toBe(row.sourceText);}
 }
});
test('unsafe native integer metadata and unknown width stay native instead of becoming core assertions',()=>{
 for(const name of ['length-unsafe-exact','decimal-unsafe-precision']){
  const doc=u.importTableSpec(named(name).sourceText,{id:name,format:'json'}),column=u.getTableSpecColumn(doc,0);expect(column.kind).toBe('object');
  if(column.kind==='object')expect(column.members[name.startsWith('length')?'length':'precision']).toEqual({kind:'number',value:'9007199254740993'});
  expect(u.exportTableSpec(doc)).toContain('9007199254740993');
 }
 const row=named('unknown-width-INTEGER');expect(row.sourceText).toContain('integerWidth');expect(row.normalizedText).not.toContain('integerWidth');
 const native=u.importTableSpec(row.sourceText,{id:'unknown-width',format:'json'});expect(native.modules[0]!.elements[0]!.facets).toBeUndefined();expect(u.exportTableSpec(native)).toBe(row.sourceText);
});
