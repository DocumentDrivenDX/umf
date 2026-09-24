// @covers US-002-AC1 US-002-AC2 US-002-AC3 US-002-AC4
import {test,expect} from 'bun:test';
import Ajv2020 from 'ajv/dist/2020';
import {importJsonSchema,exportJsonSchema,exportJsonSchemaBundle,exportJsonSchemaResources,inspectJsonSchema,getJsonSchemaNode,editJsonSchemaNode,walkJsonSchema,readDocument,writeDocument,JSON_SCHEMA_EXTENSION,parseNativeJson} from '../../src';
const options={id:'native-test',baseUri:'https://example.test/order'};
import order from "../../fixtures/json-schema/order.schema.json";
test('US-002-AC1: full native schema survives editable UMF tree and YAML serialization',()=>{
 const doc=importJsonSchema(JSON.stringify(order),options);
 expect(inspectJsonSchema(doc).complete).toBe(true);
 expect(JSON.parse(exportJsonSchema(readDocument(writeDocument(doc))))).toEqual(order);
 const original=JSON.stringify(doc);
 const node=getJsonSchemaNode(doc,'/properties/amount/minimum');
 expect(node).toEqual({kind:'number',value:'0'});
 if(node.kind==='number')node.value='99';
 expect(JSON.stringify(doc)).toBe(original);
 const edited=editJsonSchemaNode(doc,'/properties/amount/minimum','10');
 const native=JSON.parse(exportJsonSchema(edited));expect(native.properties.amount.minimum).toBe(10);
 expect(JSON.parse(exportJsonSchema(doc))).toEqual(order);
 const ajv=new Ajv2020({strict:false});
 expect(ajv.compile(native)({id:'A',amount:5,lines:[]})).toBe(false);
});
test('US-002-AC1: exact numbers and unknown native metadata survive without false semantic validation',()=>{
 const source='{"minimum":9007199254740993,"maximum":1e400,"multipleOf":0.10000000000000000001,"default":-0,"x-unknown":{"kind":"number","value":"not encoding"}}';
 const doc=importJsonSchema(source,options);
 const restored=readDocument(writeDocument(doc,'yaml'),'yaml');
 expect(exportJsonSchema(restored).trim()).toBe(source);
 const codes=inspectJsonSchema(restored).diagnostics.map(d=>d.code);
 expect(codes).toContain('JSON_SCHEMA_NUMERIC'); expect(codes).toContain('JSON_SCHEMA_KEYWORD');
 expect(()=>editJsonSchemaNode(restored,'/minimum','1')).toThrow('validated');
});
test('US-002-AC2: supplied retrieval URI and reference bundle remain separate and usable',()=>{
 const root='{"$ref":"types/amount.json"}';
 const resources={'https://example.test/types/amount.json':'{"type":"number","minimum":1}'};
 const doc=importJsonSchema(root,{...options,resources});
 expect(inspectJsonSchema(doc).complete).toBe(true);
 expect(JSON.parse(exportJsonSchema(doc))).toEqual(JSON.parse(root));
 expect(JSON.parse(exportJsonSchemaResources(doc)['https://example.test/types/amount.json']!)).toEqual({type:'number',minimum:1});
 const missing=importJsonSchema(root,options);
 expect(inspectJsonSchema(missing).complete).toBe(false);
 expect(inspectJsonSchema(missing).diagnostics.map(d=>d.code)).toContain('JSON_SCHEMA_COMPILE');
 expect(()=>editJsonSchemaNode(missing,'/$ref','"other"')).toThrow();
});
test('US-002-AC3: only actual applicator locations are exposed as schemas',()=>{
 const doc=importJsonSchema('{"properties":{"a/b~c":{"type":"string"}},"default":{"properties":{"notASchema":3}},"enum":[{"type":"fiction"}]}',options);
 expect(walkJsonSchema(doc).map(p=>p.pointer)).toEqual(['','/properties/a~1b~0c']);
 expect(getJsonSchemaNode(doc,'/properties/a~1b~0c/type')).toEqual({kind:'string',value:'string'});
 for(const path of ['properties','/~2','/absent'])expect(()=>getJsonSchemaNode(doc,path)).toThrow();
});
test('US-002-AC4: dialect uncertainty, invalid schemas and duplicate keys are distinct',()=>{
 const unknown=importJsonSchema('{"$schema":"https://example.test/custom","type":"alien"}',options);
 expect(inspectJsonSchema(unknown).complete).toBe(false);
 expect(exportJsonSchema(unknown)).toContain('alien');
 expect(()=>importJsonSchema('{"type":"alien"}',options)).toThrow();
 expect(()=>importJsonSchema('{"type":"alien","x-unknown":true}',options)).toThrow();
 expect(()=>importJsonSchema('{"type":"string","type":"number"}',options)).toThrow();
 expect(()=>importJsonSchema('[]',options)).toThrow();
 expect(()=>importJsonSchema('{}',{...options,baseUri:'relative'})).toThrow();
 expect(()=>importJsonSchema('{}',{...options,resources:{[options.baseUri]:'{}'}})).toThrow();
});
test('US-002-AC4: unknown representation content cannot silently disappear into native output',()=>{
 const doc=importJsonSchema('{}',options);
 const payload=doc.modules[0]!.elements[0]!.extensions[JSON_SCHEMA_EXTENSION] as any;
 payload.root.future='keep';
 expect(readDocument(writeDocument(doc))).toEqual(doc);
 expect(()=>exportJsonSchema(doc)).toThrow('Unknown representation field');
});
test('US-002-AC4: invalid edits and number injection cannot corrupt source',()=>{
 const doc=importJsonSchema(JSON.stringify(order),options);
 expect(()=>editJsonSchemaNode(doc,'/properties/amount/minimum','"not number"')).toThrow();
 expect(JSON.parse(exportJsonSchema(doc))).toEqual(order);
 const tree=doc.modules[0]!.elements[0]!.extensions[JSON_SCHEMA_EXTENSION] as any;
 tree.root.members.properties.members.amount.members.minimum.value='1},"injected":true';
 expect(()=>exportJsonSchema(doc)).toThrow();
 expect(parseNativeJson('1e-5000')).toEqual({kind:'number',value:'1e-5000'});
});

test('full export bundle retains unrelated UMF semantics and reports target-only limits',()=>{
 const doc=importJsonSchema('{}',options);
 doc.vocabularies['future.policy']={version:'1.0.0'};
 doc.extensions={'future.policy':{owner:'sales'}};
 const bundle=exportJsonSchemaBundle(doc);
 expect(bundle.source).toEqual(doc);
 expect(bundle.diagnostics.map(d=>d.code)).toContain('SOURCE_ARTIFACT_REQUIRED');
 expect(bundle.diagnostics.map(d=>d.code)).toContain('UNKNOWN_EXTENSION');
});
