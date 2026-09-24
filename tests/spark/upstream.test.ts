import {test,expect} from 'bun:test';
import {importSparkSchema,exportSparkSchema,readDocument,writeDocument} from '../../src';
import {parseNativeJson,renderTree} from '../../src/model/native-json';
test('US-017-AC4: pinned upstream schema examples preserve native JSON and rejection boundaries',async()=>{
 const cases=parseNativeJson(await Bun.file('fixtures/spark/upstream-cases.json').text());expect(cases.kind).toBe('array');if(cases.kind!=='array')throw Error('Expected cases');expect(cases.items.length).toBe(42);
 for(const item of cases.items){if(item.kind!=='object'||item.members.id?.kind!=='string')throw Error('Invalid case');const id=item.members.id.value,text=renderTree(item.members.input!);
  if(id==='41-schema_json'){expect(()=>importSparkSchema(text,{id})).toThrow();continue;}
  const doc=importSparkSchema(text,{id});for(const format of ['json','yaml'] as const)expect(exportSparkSchema(readDocument(writeDocument(doc,format),format))).toBe(text);
 }
});
