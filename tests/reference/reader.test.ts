// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {latestProfile,propertyPresence,shape,schemaNode,unknownKeyPolicy,schemaRules,identity,conditionText} from '../../docs/helix/05-deploy/reference/model';
import {parseNativeJson,validateDocument,readDocument} from '../../src/index';
const root=parseNativeJson(await Bun.file('spec/core/schema.json').text());
// @covers US-089-AC12 @covers US-089-AC13
test('latest uses numeric core versions and preserves conditional, open and recursive meaning',async()=>{
 expect(latestProfile([{version:'0.9.0'},{version:'0.10.0'}]).version).toBe('0.10.0');
 const node=schemaNode(root,'/$defs/element');
 expect(propertyPresence(node,'scalarType','record')).toContain('Not allowed');
 expect(propertyPresence(node,'itemType','record')).toContain('Not allowed');
 expect(propertyPresence(node,'keys','field')).toContain('Not allowed');
 expect(propertyPresence(node,'itemType','field')).toContain('Conditional');
 expect(schemaRules(node).some(r=>r.text.includes('itemType')&&r.text.includes('array'))).toBe(true);
 const current=parseNativeJson(await Bun.file('spec/core/schema.json').text()),element=schemaNode(current,'/$defs/element');
 const recordRules=schemaRules(element,'record').map(r=>r.text).join('\n'),fieldRules=schemaRules(element,'field').map(r=>r.text).join('\n');
 expect(recordRules).not.toContain('facets.');expect(recordRules).not.toContain('`scalarType` = string');
 expect(fieldRules).toContain('`facets.length.unit` = unicode-scalar');expect(fieldRules).toContain('`facets.length.unit` = byte');
 expect(conditionText({properties:{facets:{properties:{length:{properties:{unit:{const:'unicode-scalar'}}}}}}})).toContain('facets.length.unit');
 expect(shape(root,schemaNode(root,'/$defs/scalarType'))).toContain('string');
 expect(shape(root,schemaNode(root,'/$defs/scalarType'))).toContain('uuid');
 expect(unknownKeyPolicy(node)).toContain('allowed');
 expect(()=>schemaNode(root,'bad')).toThrow();
});
// @covers US-089-AC13 @covers US-089-AC14
 test('reader census, exact API kind, examples and member documentation are emitted',async()=>{
 const reader=await Bun.file('docs/helix/05-deploy/microsite/dist/reference/reader.json').json();
 expect(reader.latest.version).toBe('0.10.0');expect(reader.concepts.some((c:any)=>c.key==='record')).toBe(true);
 for(const example of reader.examples)expect(validateDocument(example).valid).toBe(true);
 const constant=reader.api.find((a:any)=>a.id===identity('api','.','AVRO_KEYS_EXTENSION'));
 expect(constant.kind).toBe('Constant');
 const doc=await Bun.file('docs/helix/05-deploy/microsite/dist/reference/'+constant.href).json();
 expect(doc.value).toBe('"umf.avro.keys"');expect(doc.purpose).toContain('identifier');expect(doc.example).toContain('AVRO_KEYS_EXTENSION');
 const fn=reader.api.find((a:any)=>a.title==='readDocument');const f=await Bun.file('docs/helix/05-deploy/microsite/dist/reference/'+fn.href).json();
 expect(f.parameters.some((p:any)=>p.name==='text')).toBe(true);expect(f.returns.length).toBeGreaterThan(0);
 const registry=reader.api.find((a:any)=>a.title==='Registry');const cls=await Bun.file('docs/helix/05-deploy/microsite/dist/reference/'+registry.href).json();expect(cls.members.some((p:any)=>p.name.startsWith('#'))).toBe(false);expect(cls.members.some((p:any)=>p.name==='register')).toBe(true);
 const i=reader.api.find((a:any)=>a.title==='AvroKeyRequest');const type=await Bun.file('docs/helix/05-deploy/microsite/dist/reference/'+i.href).json();expect(type.members.some((p:any)=>p.name==='nativeSource')).toBe(true);
});
// @covers US-089-AC13 @covers US-089-AC14
 test('complete schema examples reject invalid item/container shapes and usage snippets execute',async()=>{
 const reader=await Bun.file('docs/helix/05-deploy/microsite/dist/reference/reader.json').json();
 const bad=structuredClone(reader.examples[0]);bad.modules[0].elements[2].itemType='string';expect(validateDocument(bad).valid).toBe(false);
 const conflict=structuredClone(reader.examples[0]);conflict.modules[0].elements[2].scalarType='string';expect(validateDocument(conflict).valid).toBe(false);
 const {readDocument,AVRO_KEYS_EXTENSION}=await import('../../src/index');
 const document=readDocument('{"umf":"0.10.0","id":"example","vocabularies":{},"modules":[]}');
 expect(document.umf).toBe('0.10.0');expect(document.extensions?.[AVRO_KEYS_EXTENSION]).toBeUndefined();expect(document.vocabularies[AVRO_KEYS_EXTENSION]).toBeUndefined();
});

// @covers US-089-AC16
test('the generated YAML example preserves all JSON example values',async()=>{
 const base='docs/helix/05-deploy/microsite/dist/reference/';
 const reader=await Bun.file(base+'reader.json').json(),yaml=await Bun.file(base+'example.yaml').text();
 expect(yaml.trimStart().startsWith('umf:')).toBe(true);
 expect(readDocument(yaml,'yaml')).toEqual(reader.examples[0]);
});

// @covers US-089-AC16
 test('workbench formatting retains edited values and refuses silent loss',async()=>{
 const {execute}=await import('../../docs/helix/05-deploy/reference/runtime');
 const request={protocol:1 as const,requestId:'format',operationId:'format-source',coreProfile:'0.10.0',registryProfile:'empty',inputs:{source:'id: edited\nunknown:\n  keep: true\n',format:'yaml',outputFormat:'json'}};
 const result=await execute(request);expect(result.state).toBe('completed');expect(JSON.parse(result.outputs[0]!.text)).toEqual({id:'edited',unknown:{keep:true}});
 for(const source of ['{broken','id: one\nid: two','unsafe: 9007199254740993']){const refusal=await execute({...request,inputs:{...request.inputs,source}});expect(refusal.state).toBe('refused');expect(refusal.outputs).toHaveLength(0);expect(refusal.retainedSources.find(s=>s.name==='source')!.text).toBe(source);}
 const catalog=await Bun.file('docs/helix/05-deploy/reference/examples/catalog.json').json();
 for(const example of catalog){const source=await Bun.file(example.inputPaths.source).text(),d=JSON.parse(source);if(d.umf){expect(d.umf).toBe('0.10.0');expect(validateDocument(d).valid).toBe(true);}}
 });
