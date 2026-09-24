import {test,expect} from 'bun:test';
import {backend} from '../../native/postgresql/runtime';
import {correlatePostgresqlKeyCatalog} from '../../src/adapters/postgresql/key-correlation';
import {importPostgresqlCatalogCapture} from '../../src/adapters/postgresql/catalog';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
import type {Document} from '../../src/model/types';
import proof from '../../fixtures/validation/key-postgresql-discovery-native.json';
const capture=await Bun.file('fixtures/validation/key-postgresql-catalog-capture.json').text(),query=await Bun.file('native/postgresql/keys/query.sql').text();
const supplement=()=>({profile:'umf-postgresql-key-observations-17-v1',serverVersion:170004,encoding:'UTF8',query,indexes:structuredClone(proof.indexes)});
const source=()=>importPostgresqlCatalogCapture(capture,{id:'native-key-catalog'});
test('all pinned indexes correlate with retained catalog without claiming authentication or ideal equality',async()=>{
 const doc=source(),before=JSON.stringify(doc),text=' \n'+JSON.stringify(supplement(),null,2)+'\n',r=await correlatePostgresqlKeyCatalog(doc,text,backend);
 expect(r.matches).toHaveLength(17);expect(r.nativeSupplement).toBe(text);expect(r.authenticated).toBe(false);expect(r.sameSnapshotVerified).toBe(false);expect(r.idealEqualityVerified).toBe(false);expect(JSON.stringify(doc)).toBe(before);
 expect(r.matches.find(m=>m.identity.table==='expression')!.componentPaths).toEqual([null]);expect(r.matches.find(m=>m.identity.table==='included')!.componentPaths).toHaveLength(2);
 for(const format of ['json','yaml'] as const){const d=readJsonValue(writeJsonValue(doc,format),format) as unknown as Document;expect(await correlatePostgresqlKeyCatalog(d,text,backend)).toEqual(r);}
});
const changes:[string,(s:any)=>void][]=[
 ['missing index',s=>s.indexes.pop()],['extra index',s=>{const i=structuredClone(s.indexes[0]);i.index='invented';s.indexes.push(i);}],
 ['wrong readiness',s=>s.indexes[0].ready=false],['wrong validity',s=>s.indexes[0].valid=false],
 ['omitted partial predicate',s=>s.indexes.find((i:any)=>i.table==='partial').predicate=null],
 ['changed partial predicate',s=>s.indexes.find((i:any)=>i.table==='partial').predicate='NOT active'],
 ['wrong unique flag',s=>s.indexes.find((i:any)=>i.table==='partial').unique=false],
 ['wrong null treatment',s=>s.indexes.find((i:any)=>i.table==='nulls_equal').nullsNotDistinct=false],
 ['wrong column nullability',s=>s.indexes[0].components[0].notNull=false],
 ['wrong column type',s=>s.indexes[0].components[0].type='text'],
 ['wrong compound order',s=>{const a=s.indexes.find((i:any)=>i.table==='compound').components;a.reverse();a.forEach((c:any,j:number)=>c.position=j+1);}],
 ['omitted inherited child',s=>s.indexes.find((i:any)=>i.table==='parent').children=[]],
 ['wrong expression',s=>s.indexes.find((i:any)=>i.table==='expression').expressions='upper(value)'],
 ['included column treated as key',s=>s.indexes.find((i:any)=>i.table==='included').keyCount=2],
 ['wrong constraint timing',s=>s.indexes.find((i:any)=>i.table==='deferred').immediate=true],
 ['wrong captured collation determinism',s=>s.indexes.find((i:any)=>i.table==='folded_text').components[0].collation.deterministic=true],
 ['wrong default collation identity',s=>s.indexes.find((i:any)=>i.table==='exact_text').components[0].collation.name='default'],
 ['omitted constraint',s=>s.indexes.find((i:any)=>i.table==='binary').constraint=null],
];
for(const [name,change] of changes)test('correlation refuses '+name,async()=>{const s=supplement();change(s);await expect(correlatePostgresqlKeyCatalog(source(),JSON.stringify(s),backend)).rejects.toThrow();});
test('unknown supplement metadata and numeric tokens survive correlation unchanged',async()=>{
 const text=JSON.stringify(supplement()).replace('"profile"','"future":{"n":9007199254740993,"negativeZero":-0,"decimal":1.2300},"profile"'),r=await correlatePostgresqlKeyCatalog(source(),text,backend);expect(r.nativeSupplement).toBe(text);expect(r.matches).toHaveLength(17);
});
