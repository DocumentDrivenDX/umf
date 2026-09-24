import {test,expect} from 'bun:test';
import {importSparkSchema,exportSparkSchema,inspectSpark} from '../../src';
const source=(metadata:string)=>'{"type":"struct","fields":[{"name":"x","type":"string","nullable":true,"metadata":'+metadata+'}]}';
test('US-017-AC2: exact metadata warns about JVM numeric and array interpretation without normalizing',()=>{
 const cases:[string,string[]][]=[['{"x":9223372036854775807}',[]],['{"x":-9223372036854775808}',[]],['{"x":9223372036854775808}',['INT64_OVERFLOW']],['{"x":-9223372036854775809}',['INT64_OVERFLOW']],['{"x":9007199254740993.25}',['DOUBLE']],['{"x":1e400}',['NONFINITE']],['{"x":[1,2.5]}',['ARRAY_MIXED','DOUBLE']],['{"x":[null]}',['ARRAY_UNSUPPORTED']],['{"x":[[1]]}',['ARRAY_UNSUPPORTED']],['{"x":[]}',['EMPTY_ARRAY']],['{"x":null}',[]]];
 for(const [metadata,codes] of cases){const text=source(metadata),doc=importSparkSchema(text,{id:'metadata'}),result=inspectSpark(doc);expect(result.valid).toBe(true);expect(result.complete).toBe(false);expect(exportSparkSchema(doc)).toBe(text);expect(result.diagnostics.filter(d=>d.code.startsWith('SPARK_METADATA_')&&d.code!=='SPARK_METADATA_UNVERIFIED').map(d=>d.code)).toEqual(codes.map(c=>'SPARK_METADATA_'+c));}
});
test('US-017-AC2: nested metadata paths are escaped and missing nullable is runtime-qualified',()=>{
 const doc=importSparkSchema('{"type":"struct","fields":[{"name":"x","type":"string","metadata":{"a/b~":{"n":9223372036854775808}}}]}',{id:'nested'});const ds=inspectSpark(doc).diagnostics;
 expect(ds.find(d=>d.code==='SPARK_METADATA_INT64_OVERFLOW')?.path).toBe('/fields/0/metadata/a~1b~0/n');expect(ds.some(d=>d.code==='SPARK_FIELD_METADATA_WITHOUT_NULLABLE')).toBe(true);
});
