import {test,expect} from 'bun:test';
import {relationshipParquetCases} from '../../scripts/core-ideals/relationship-parquet-cases';
import {projectRelationshipToParquet,recoverRelationshipParquetIdeal,recoverRelationshipParquetNative,verifyRelationshipParquetProjection} from '../../src/core-ideals/relationship-parquet-projection';
import {classifyParquetRelationships,recoverParquetRelationshipSource} from '../../src/core-ideals/relationship-parquet';
import {importParquetSchema} from '../../src/adapters/parquet/field-metadata';
import {exportParquetCapture} from '../../src/adapters/parquet';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
// @covers US-045-AC4 @covers US-045-AC6 @covers US-045-AC7 @covers US-045-AC8
for(const c of relationshipParquetCases())test('Parquet relationship '+c.name,()=>{
 const r=projectRelationshipToParquet(c.source,c.author,c.request);expect(r.status).toBe(c.expected);
 if(r.status==='blocked'){expect(r.target).toBeUndefined();expect(r.nativeArchive).toBeUndefined();return;}
 const bytes=exportParquetCapture(r.target!),fresh=importParquetSchema(bytes,{id:'fresh'}),classified=classifyParquetRelationships(fresh,{mode:'report',profile:'file-schema'});
 expect(classified.status).toBe('classified');expect(classified.observations.every(o=>o.authorIntent==='unknown'&&o.enforcement==='not-expressible')).toBe(true);
 for(const format of ['json','yaml'] as const){const saved=readJsonValue(writeJsonValue(r,format),format) as unknown as typeof r;expect(recoverRelationshipParquetIdeal(saved,classified.target!)).toEqual(c.source);expect(recoverRelationshipParquetNative(saved,fresh)).toEqual(r.nativeArchive!);expect(recoverParquetRelationshipSource(classified,classified.target!)).toEqual(bytes);}
 const fake=structuredClone(r);fake.residuals.pop();expect(()=>verifyRelationshipParquetProjection(fake,r.target!)).toThrow();
 const changed=structuredClone(r.target!);(changed.modules[0]!.elements[0]!.extensions['umf.parquet'] as any).bytes+='00';expect(()=>verifyRelationshipParquetProjection(r,changed)).toThrow();
 expect(classifyParquetRelationships(fresh,{mode:'strict',profile:'file-schema'}).status).toBe('blocked');
});
test('input accessors refuse without invocation',()=>{const c=relationshipParquetCases()[0]!;let reads=0;expect(()=>projectRelationshipToParquet(c.source,c.author,{...c.request,get shape(){reads++;return 'one' as const;}})).toThrow();expect(reads).toBe(0);});
// @covers US-045-AC3 @covers US-045-AC7
test('native bytes with embedded Arrow schema, physical field IDs and unknown extensions remain exact',async()=>{
 const bytes=new Uint8Array(await Bun.file('fixtures/parquet/arrow-nested/map-key-counterexample.parquet').arrayBuffer());
 const source=importParquetSchema(bytes,{id:'arrow-metadata'});source.umf='0.7.0';source.vocabularies['umf.parquet.relationships']={version:'1.0.0',future:{opaque:1}} as any;source.vocabularies.future={version:'1.0.0'};source.extensions={future:{opaque:['9007199254740993',{x:1}]}};
 const r=classifyParquetRelationships(source,{mode:'report',profile:'file-schema'});expect(r.status).toBe('classified');expect(r.target!.vocabularies['umf.parquet.relationships']).toEqual(source.vocabularies['umf.parquet.relationships']);expect(r.target!.modules).toEqual(source.modules);expect(r.target!.extensions!.future).toEqual(source.extensions.future);
 for(const format of ['json','yaml'] as const){const saved=readJsonValue(writeJsonValue(r,format),format) as unknown as typeof r;expect(recoverParquetRelationshipSource(saved,saved.target!)).toEqual(bytes);}
 const {Registry}=await import('../../src/registry/registry');const {parquetRelationshipsPackage}=await import('../../src/core-ideals/relationship-parquet');const registry=new Registry().register(parquetRelationshipsPackage);expect(registry.get('umf.parquet.relationships','1.0.0')!.structure(r.target!.extensions!['umf.parquet.relationships'])).toBe(true);
 const fake=structuredClone(r);fake.observations.pop();expect(()=>recoverParquetRelationshipSource(fake,r.target!)).toThrow();expect(classifyParquetRelationships(r.target!,r.request).status).toBe('blocked');
});
