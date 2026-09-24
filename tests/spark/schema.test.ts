import {test,expect} from 'bun:test';
import {importSparkSchema,exportSparkSchema,inspectSpark,getSparkNode,proposeSparkNodeEdit,readDocument,writeDocument} from '../../src';
const cases=await Bun.file('fixtures/spark/schema-cases.json').json();
test('US-017-AC1: native schema cases preserve exact source through both UMF serializations',()=>{
 let passed=0;for(const c of cases){if(['array-default','map-default'].includes(c.id)){expect(()=>importSparkSchema(JSON.stringify(c.input),{id:c.id})).toThrow();continue;}
 const doc=importSparkSchema(JSON.stringify(c.input),{id:c.id});expect(inspectSpark(doc).complete).toBe(false);for(const format of ['json','yaml'] as const)expect(exportSparkSchema(readDocument(writeDocument(doc,format),format))).toBe(exportSparkSchema(doc));passed++;}expect(passed).toBe(47);
},20000);
test('US-017-AC2: metadata integers, unknown semantics and UDT declarations remain data',()=>{
 const text='{"type":"struct","fields":[{"name":"x","type":"long","metadata":{"exact":9223372036854775807,"future":9007199254740993.25},"unknown":true}]}';const doc=importSparkSchema(text,{id:'exact'});expect(exportSparkSchema(doc)).toContain('9223372036854775807');expect(exportSparkSchema(doc)).toContain('9007199254740993.25');expect(inspectSpark(doc).diagnostics.some(d=>d.code==='SPARK_UNKNOWN')).toBe(true);
 const udt=importSparkSchema('{"type":"udt","pyClass":"uninstalled.DoNotImport","serializedClass":"not-executed","sqlType":"integer"}',{id:'udt'});expect(inspectSpark(udt).diagnostics.some(d=>d.code==='SPARK_UDT_UNINTERPRETED')).toBe(true);expect(exportSparkSchema(udt)).toContain('not-executed');
 (doc.modules[0]!.elements[0]!.extensions['umf.spark'] as any).future={keep:true};expect(readDocument(writeDocument(doc,'yaml'),'yaml')).toEqual(doc);expect(()=>exportSparkSchema(doc)).toThrow('Unknown representation');
});
test('US-017-AC3: candidate edits validate shape, preserve unknown content and leave source untouched',()=>{
 const doc=importSparkSchema(JSON.stringify(cases.find((c:any)=>c.id==='collated-field').input),{id:'edit'}),before=exportSparkSchema(doc);const changed=proposeSparkNodeEdit(doc,'/fields/0/name','"renamed"');expect(getSparkNode(changed.document,'/fields/0/name')).toEqual({kind:'string',value:'renamed'});expect(exportSparkSchema(doc)).toBe(before);expect(changed.validation.complete).toBe(false);expect(exportSparkSchema(changed.document)).toContain('spark.UTF8_LCASE');expect(changed.validation.diagnostics.some(d=>d.code==='SPARK_METADATA_UNVERIFIED')).toBe(true);expect(()=>proposeSparkNodeEdit(doc,'/fields/0/nullable','"false"')).toThrow();
});
