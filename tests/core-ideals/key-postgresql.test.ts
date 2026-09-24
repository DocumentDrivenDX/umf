import {test,expect} from 'bun:test';
import {backend} from '../../native/postgresql/runtime';
import {importPostgresqlCatalogCapture} from '../../src/adapters/postgresql/catalog';
import {classifyPostgresqlKeys,verifyPostgresqlKeyClassification,recoverPostgresqlKeySource,postgresqlKeysPackage} from '../../src/core-ideals/key-postgresql';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
import {validateDocument} from '../../src/validation/document';
import {Registry} from '../../src/registry/registry';
import proof from '../../fixtures/validation/key-postgresql-discovery-native.json';
const nativeSource=await Bun.file('fixtures/validation/key-postgresql-catalog-capture.json').text(),query=await Bun.file('native/postgresql/keys/query.sql').text();
const supplement=JSON.stringify({profile:'umf-postgresql-key-observations-17-v1',serverVersion:170004,encoding:'UTF8',query,indexes:proof.indexes});
const request={nativeSource,supplement,mode:'report',profile:'captured-stored-values'} as const;
const source=()=>importPostgresqlCatalogCapture(nativeSource,{id:'key-native'});
test('native enforcement and equality remain separate from authored identity',async()=>{
 const doc=source(),before=JSON.stringify(doc),r=await classifyPostgresqlKeys(doc,request,backend);
 expect(r.status).toBe('classified');expect(r.observations).toHaveLength(17);expect(JSON.stringify(doc)).toBe(before);expect(r.target!.modules).toEqual(doc.modules);expect(r.target!.umf).toBe(doc.umf);
 expect(validateDocument(r.target!,new Registry().register(postgresqlKeysPackage)).valid).toBe(true);
 const row=(table:string)=>r.observations.find(o=>o.identity.table===table)!;
 expect(r.observations.every(o=>o.authorIntent==='unknown')).toBe(true);
 for(const name of ['enforced','compound','binary','boolean','exact_text','included'])expect(row(name).enforcement).toBe('immediate-unique-nonnull');
 for(const name of ['partial','parent'])expect(row(name).enforcement).toBe('conditional');
 expect(row('deferred').enforcement).toBe('deferred');expect(row('nullable').enforcement).toBe('nullable');expect(row('nulls_equal').enforcement).toBe('nullable');expect(row('expression').enforcement).toBe('unknown');
 expect(row('padded').equality).toBe('incompatible');expect(row('folded_text').equality).toBe('unknown');expect(row('rounded').equality).toBe('unknown');expect(row('exact_decimal').equality).toBe('unknown');
 for(const name of ['enforced','compound','binary','boolean','exact_text'])expect(row(name).equality).toBe('exact-on-representable-values');
 expect(row('included').fields).toHaveLength(1);expect(row('expression').fields).toHaveLength(0);expect(row('compound').fields).toHaveLength(2);
 expect(r.residuals.filter(l=>l.reason.includes('authored stable'))).toHaveLength(17);
});
test('strict blocks atomically; report receipts recover both native archives in JSON and YAML',async()=>{
 const strict=await classifyPostgresqlKeys(source(),{...request,mode:'strict'},backend);expect(strict.status).toBe('blocked');expect(strict.target).toBeUndefined();
 const r=await classifyPostgresqlKeys(source(),request,backend);
 for(const format of ['json','yaml'] as const){const stored=readJsonValue(writeJsonValue(r,format),format) as unknown as typeof r;expect(await recoverPostgresqlKeySource(stored,stored.target!,backend)).toEqual({nativeSource,supplement});}
});
test('unknown native content and exact numeric tokens remain attached without interpretation',async()=>{
 const future=supplement.replace('"profile"','"future/~":{"n":9007199254740993,"zero":-0,"fraction":1.2300},"profile"'),r=await classifyPostgresqlKeys(source(),{...request,supplement:future},backend);
 expect(r.residuals.some(l=>l.path==='/supplement/future~1~0')).toBe(true);expect((await recoverPostgresqlKeySource(r,r.target!,backend)).supplement).toBe(future);
});
test('forged conclusions, stale targets and duplicate classification cannot claim recovery',async()=>{
 const r=await classifyPostgresqlKeys(source(),request,backend),fake=structuredClone(r);fake.observations.find(o=>o.identity.table==='partial')!.enforcement='immediate-unique-nonnull';await expect(verifyPostgresqlKeyClassification(fake,r.target!,backend)).rejects.toThrow();
 const stale=structuredClone(r.target!);stale.id='different';await expect(verifyPostgresqlKeyClassification(r,stale,backend)).rejects.toThrow();
 const twice=await classifyPostgresqlKeys(r.target!,request,backend);expect(twice.status).toBe('blocked');expect(twice.target).toBeUndefined();
});
test('different archives, mismatched observations and unsupported requests refuse',async()=>{
 await expect(classifyPostgresqlKeys(source(),{...request,nativeSource:nativeSource.replace('"serverVersion": 170004','"serverVersion": 170005')},backend)).rejects.toThrow();
 const parsed=JSON.parse(supplement);parsed.indexes.find((i:any)=>i.table==='partial').predicate=null;await expect(classifyPostgresqlKeys(source(),{...request,supplement:JSON.stringify(parsed)},backend)).rejects.toThrow();
 await expect(classifyPostgresqlKeys(source(),{...request,profile:'writer-input'} as never,backend)).rejects.toThrow();
 let reads=0;await expect(classifyPostgresqlKeys(source(),{...request,get mode(){reads++;return 'report' as const;}},backend)).rejects.toThrow();expect(reads).toBe(0);
});
