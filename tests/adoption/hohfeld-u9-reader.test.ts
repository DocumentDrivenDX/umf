import {expect, test} from 'bun:test';
import {readDddDocument,inspectDdd} from '../../src/index';

const path='tests/adoption/hohfeld-u9-document.json';

test('the public U9 source is a complete bounded DDD entity in core 0.10',async()=>{
 const bytes=await Bun.file(path).arrayBuffer(),raw=new TextDecoder().decode(bytes);
 const doc=readDddDocument(raw,'json'),checked=inspectDdd(doc);
 expect(checked.valid).toBe(true);
 expect(checked.complete).toBe(true);
 expect(doc.umf).toBe('0.10.0');
 expect(doc.modules).toHaveLength(1);
 const [entity]=doc.modules[0]!.elements.filter(e=>e.kind==='record');
 expect(entity?.id).toBe('Thing');
 const ddd=entity?.extensions['umf.ddd'] as {kind:string;fields:Record<string,{type:{kind:string;name:string};cardinality:string}>;identity:{fields:string[]}};
 expect(ddd.kind).toBe('entity');
 expect(ddd.identity.fields).toEqual(['id']);
 expect(ddd.fields).toEqual({id:{type:{kind:'scalar',name:'string'},cardinality:'one'},note:{type:{kind:'scalar',name:'string'},cardinality:'optional'}});
 expect(new TextDecoder().decode(bytes)).toBe(raw);
});

test('U9 controls keep their changed bytes distinct from the accepted original',async()=>{
 const original=await Bun.file(path).text(),digestInput=original;
 const wrongVersion=original.replace('"umf": "0.10.0"','"umf": "0.7.0"');
 const unknownVocabulary=original.replace('"umf.ddd": { "version": "0.1.0" }','"umf.ddd": { "version": "0.1.0" },\n    "u9.future": { "version": "9.0.0" }');
 const unsupported=JSON.parse(original) as {modules:Array<{elements:Array<Record<string,any>>}>};
 const note=unsupported.modules[0]!.elements.find(e=>e.id==='Thing.note')!;
 note.scalarType='float';
 (unsupported.modules[0]!.elements.find(e=>e.id==='Thing')!.extensions['umf.ddd'] as any).fields.note.type.name='float';
 const unsupportedScalar=JSON.stringify(unsupported);
 expect(wrongVersion).not.toBe(digestInput);
 expect(unknownVocabulary).not.toBe(digestInput);
 expect(unsupportedScalar).not.toBe(digestInput);
 expect(digestInput).toBe(await Bun.file(path).text());
 expect(inspectDdd(JSON.parse(wrongVersion)).valid).toBe(false);
 const unknown=inspectDdd(JSON.parse(unknownVocabulary));
 expect(unknown.valid).toBe(true);
 expect(unknown.complete).toBe(false);
 expect(inspectDdd(JSON.parse(unsupportedScalar)).valid).toBe(false);
});
