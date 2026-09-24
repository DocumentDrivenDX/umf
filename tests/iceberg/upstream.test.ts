import {test,expect} from 'bun:test';
import {importIcebergSchema,exportIcebergSchema,proposeIcebergNodeEdit,readDocument,writeDocument,getIcebergNode} from '../../src';
const base='fixtures/iceberg/upstream/',m=await Bun.file(base+'manifest.json').json(),results=(await Bun.file(base+'results.json').json()).results;
test('US-020-AC4: pinned table/view resources retain exact standalone schema fragments',async()=>{
 expect(m.schemas).toHaveLength(21);expect(m.distinctSchemaCount).toBe(7);for(const f of m.files)expect(new Bun.CryptoHasher('sha256').update(new Uint8Array(await Bun.file(base+f.path).arrayBuffer())).digest('hex')).toBe(f.sha256);
 for(const c of results){const text=await Bun.file(base+'extracted/'+c.id+'.json').text();if(c.status==='rejected'){expect(()=>importIcebergSchema(text,{id:c.id})).toThrow();continue;}const d=importIcebergSchema(text,{id:c.id});for(const f of ['json','yaml'] as const)expect(exportIcebergSchema(readDocument(writeDocument(d,f),f))).toBe(text);if(c.edit){const candidate=proposeIcebergNodeEdit(d,'/fields/0/name',JSON.stringify(c.edit.to));expect(exportIcebergSchema(candidate.document)).toBe(await Bun.file(base+'edited/'+c.id+'.json').text());expect(getIcebergNode(candidate.document,'/fields/0/id')).toEqual(getIcebergNode(d,'/fields/0/id'));expect(exportIcebergSchema(d)).toBe(text);}}
});
test('US-020-AC4: Java and Python parser differences are recorded without default insertion',async()=>{
 const java=(await Bun.file(base+'java-oracle-results.json').json()).results,python=(await Bun.file(base+'oracle-results.json').json()).results;expect(java.filter((c:any)=>c.nativeAccepted)).toHaveLength(20);expect(python.every((c:any)=>c.nativeAccepted)).toBe(true);expect(java.find((c:any)=>!c.nativeAccepted).id).toBe('schema-3');expect(JSON.parse(await Bun.file(base+'extracted/schema-3.json').text())).not.toHaveProperty('type');expect(java.filter((c:any)=>c.editVerified)).toHaveLength(20);
});
