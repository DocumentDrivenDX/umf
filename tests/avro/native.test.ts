import {test,expect} from 'bun:test';
import {importAvroSchema,exportAvroSchema,inspectAvro,getAvroNode,editAvroNode,exportAvroBundle,readDocument,writeDocument} from '../../src';
const original=await Bun.file('fixtures/avro/order.avsc').text();
const simple='{"type":"record","name":"R","fields":[{"name":"id","type":"int","default":1}]}';
test('US-007-AC1: native Avro structure, metadata and logical types survive core serializations',async()=>{
 const doc=importAvroSchema(original,{id:'avro-order'});
 expect(inspectAvro(doc).valid).toBe(true);expect(inspectAvro(doc).complete).toBe(false);
 expect(inspectAvro(doc).diagnostics.map(d=>d.code)).toContain('AVRO_METADATA');
 expect(inspectAvro(doc).diagnostics.map(d=>d.code)).toContain('AVRO_LOGICAL_TYPE');
 for(const format of ['json','yaml'] as const){const back=readDocument(writeDocument(doc,format),format);expect(JSON.parse(exportAvroSchema(back))).toEqual(JSON.parse(original));}
 const bundle=exportAvroBundle(doc);expect(bundle.source).toEqual(doc);
 expect(bundle.diagnostics.map(d=>d.code)).toContain('SOURCE_ARTIFACT_REQUIRED');
 await Bun.write('fixtures/avro/round-trip.avsc',bundle.schema);
});
test('US-007-AC2: precise long defaults and newer union defaults remain explicit incomplete profiles',()=>{
 const huge=simple.replace('"int"','"long"').replace('"default":1','"default":9223372036854775807');
 const doc=importAvroSchema(huge,{id:'exact'});
 expect(exportAvroSchema(doc)).toContain('9223372036854775807');
 expect(inspectAvro(doc).diagnostics.map(d=>d.code)).toContain('AVRO_NUMERIC');
 expect(()=>editAvroNode(doc,'/fields/0/default','2')).toThrow();
 const later=simple.replace('"int"','["null","int"]');
 const union=importAvroSchema(later,{id:'union-default'});
 expect(JSON.parse(exportAvroSchema(union))).toEqual(JSON.parse(later));
 expect(inspectAvro(union).complete).toBe(false);
});
test('US-007-AC3: edits are atomic, copies isolated, and unknown representation fields never discarded',()=>{
 const doc=importAvroSchema(simple,{id:'edit'});expect(inspectAvro(doc).complete).toBe(true);
 const edited=editAvroNode(doc,'/fields/0/default','2');
 expect(getAvroNode(doc,'/fields/0/default')).toEqual({kind:'number',value:'1'});
 expect(getAvroNode(edited,'/fields/0/default')).toEqual({kind:'number',value:'2'});
 const node=getAvroNode(doc,'') as any;node.members.name.value='Changed';expect(exportAvroSchema(doc)).toContain('"R"');
 expect(()=>editAvroNode(doc,'/fields/0/type','"missing"')).toThrow();
 expect(()=>editAvroNode(doc,'/absent','0')).toThrow();
 const future=structuredClone(doc);(future.modules[0]!.elements[0]!.extensions['umf.avro'] as any).root.future=true;
 expect(inspectAvro(future).complete).toBe(false);expect(()=>exportAvroSchema(future)).toThrow('Unknown representation');
 expect(()=>importAvroSchema('42',{id:'bad'})).toThrow();
});
