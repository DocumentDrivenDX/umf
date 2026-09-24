import {test,expect} from 'bun:test';
import {parseNativeJson,parseNativeYaml,renderTree} from '../../src/model/native-json';
import {parseNativeJson as compatibility} from '../../src/adapters/json-schema/tree';
import {createValidator} from '../../src/validation/schema';
import core from '../../spec/core/native-json.schema.json';
import jsonSchema from '../../spec/extensions/json-schema/schema.json';
import avro from '../../spec/extensions/avro/schema.json';
import openapi from '../../spec/extensions/openapi/schema.json';
test('CONTRACT-001: shared exact JSON tree is representation-identical across three extensions',()=>{
 expect(compatibility).toBe(parseNativeJson);
 for(const schema of [jsonSchema,avro,openapi])expect(schema.$defs).toEqual(core.$defs);
 const json='{"number":9007199254740993,"fraction":1.0000000000000001,"negativeZero":-0,"items":[null,true,"雪"]}';
 const tree=parseNativeJson(json);expect(createValidator().compile(core)(tree)).toBe(true);expect(renderTree(tree)).toBe(json);
 const yaml='number: 9007199254740993\nfraction: 1.0000000000000001\nnegativeZero: -0\nitems: [null, true, 雪]';
 expect(parseNativeYaml(yaml)).toEqual(tree);
});
test('US-024-AC4: explicit YAML 1.1 preserves underscored boundaries without changing the default profile',()=>{
 const text='max: 9_223_372_036_854_775_807\nmin: -9_223_372_036_854_775_808\nunsigned: 18_446_744_073_709_551_615\nflag: yes\nfraction: 1_000.000_001\n';
 expect(renderTree(parseNativeYaml(text,{version:'1.1'}))).toBe('{"max":9223372036854775807,"min":-9223372036854775808,"unsigned":18446744073709551615,"flag":true,"fraction":1000.000001}');
 expect(renderTree(parseNativeYaml(text))).toBe('{"max":"9_223_372_036_854_775_807","min":"-9_223_372_036_854_775_808","unsigned":"18_446_744_073_709_551_615","flag":"yes","fraction":"1_000.000_001"}');
 expect(renderTree(parseNativeYaml('quoted: "1_000"',{version:'1.1'}))).toBe('{"quoted":"1_000"}');
 expect(()=>parseNativeYaml('a: .inf',{version:'1.1'})).toThrow();
});
test('US-024-AC4: date-only string projection is explicit and does not admit general timestamps',()=>{
 expect(()=>parseNativeYaml('day: 2021-01-01',{version:'1.1'})).toThrow();
 expect(renderTree(parseNativeYaml('day: 2021-01-01',{version:'1.1',dateOnly:'string'}))).toBe('{"day":"2021-01-01"}');
 expect(()=>parseNativeYaml('time: 2021-01-01T00:00:00Z',{version:'1.1',dateOnly:'string'})).toThrow();
});
test('US-024-AC4: PyYAML boolean vocabulary leaves single-letter axis names unchanged',()=>{
 const text='axis: y\nother: n\nflag: yes\nnegative: no\n';
 expect(renderTree(parseNativeYaml(text,{version:'1.1',booleanLexicon:'pyyaml'}))).toBe('{"axis":"y","other":"n","flag":true,"negative":false}');
 expect(renderTree(parseNativeYaml(text,{version:'1.1'}))).toBe('{"axis":true,"other":false,"flag":true,"negative":false}');
});
