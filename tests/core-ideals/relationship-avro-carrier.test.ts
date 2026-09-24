import {test,expect} from 'bun:test';
import {createHash} from 'node:crypto';
import {buildAvroRelationshipCarrier,type AvroRelationshipCarrier} from '../../src/core-ideals/relationship-avro-carrier';
import {importAvroSchema} from '../../src/adapters/avro';
import {classifyAvroRelationships,recoverAvroRelationshipSource} from '../../src/core-ideals/relationship-avro';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
const corpus=await Bun.file('fixtures/avro/relationship-carrier-cases.json').json();
for(const c of corpus.cases)test('reference carrier retained recovery: '+c.id,()=>{
 expect(buildAvroRelationshipCarrier(c.request)).toBe(c.schemaText);
 const nativeSource={schema:c.schemaText,dependencies:[]},source=importAvroSchema(c.schemaText,{id:c.id}),receipt=classifyAvroRelationships(source,{nativeSource,profile:'schema-structure',mode:'report'});
 expect(receipt.target!.modules).toEqual(source.modules);
 for(const format of ['json','yaml'] as const){const r=readJsonValue(writeJsonValue(receipt,format),format) as unknown as typeof receipt;expect(recoverAvroRelationshipSource(r,r.target!)).toEqual(nativeSource);}
});
test('invalid explicit native choices never emit a partial schema or execute accessors',()=>{
 const base=corpus.cases[0].request as AvroRelationshipCarrier;
 for(const patch of [{recordName:'bad-name'},{recordName:'int'},{keyRecordName:'Order'},{namespace:'a..b'},{fieldName:'end\n'},{shape:'many'},{components:[]},{components:[{name:'id',type:'null'}]},{components:[{name:'id',type:'long'},{name:'id',type:'string'}]},{components:[{name:'id',type:'long',future:true}]},{future:true}])expect(()=>buildAvroRelationshipCarrier({...base,...patch} as any)).toThrow();
 let reads=0;expect(()=>buildAvroRelationshipCarrier({...base,get fieldName(){reads++;return 'bad';}})).toThrow();expect(reads).toBe(0);
});
// @covers US-045-AC3 US-045-AC7: native key values do not enforce target identity or participation.
test('both pinned codecs independently accept carriers and expose unenforced references and narrowing',async()=>{
 const proof=await Bun.file('fixtures/validation/relationship-avro-carrier-native.json').json();expect(proof.versions).toEqual({apache:'1.12.0',fastavro:'1.12.2'});expect(proof.cases).toHaveLength(24);
 expect(proof.cases.filter((r:any)=>!r.write.ok)).toHaveLength(4);
 let reads=0;
 for(const r of proof.cases){const c=corpus.cases.find((c:any)=>c.id===r.case);expect(r.parse.ok).toBe(true);expect(r.write.ok).toBe(c.expectedWrite);
  for(const result of Object.values(r.reads??{}) as any[]){expect(result.values).toEqual(c.expectedValues);expect(result.bytesConsumed).toBe(r.write.hex.length/2);reads++;}}
 expect(reads).toBe(40);
 for(const [p,h] of Object.entries(proof.sha256))expect(createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')).toBe(h as string);
});
