import {expect,test} from 'bun:test';
import {inspectPostgresqlKeyCatalog} from '../../src/adapters/postgresql/key-catalog';
import proof from '../../fixtures/validation/key-postgresql-discovery-native.json';
const query=await Bun.file('native/postgresql/keys/query.sql').text();
const capture=()=>({profile:'umf-postgresql-key-observations-17-v1',serverVersion:170004,encoding:'UTF8',query,indexes:structuredClone(proof.indexes)});
test('all native observations retain enforcement, scope, null and comparator refinements',()=>{
 const text=' \n'+JSON.stringify(capture(),null,2)+'\n',r=inspectPostgresqlKeyCatalog(text);expect(r.nativeSource).toBe(text);expect(r.indexes).toHaveLength(17);expect(r.provenance).toBe('unverified');
 const partial=r.indexes.find(i=>i.table==='partial')!;expect(partial.predicate).toBe('active');expect(partial.unique).toBe(true);
 expect(r.indexes.find(i=>i.table==='deferred')!.immediate).toBe(false);expect(r.indexes.find(i=>i.table==='nulls_equal')!.nullsNotDistinct).toBe(true);expect(r.indexes.find(i=>i.table==='nullable')!.components[0]!.notNull).toBe(false);
 expect(r.indexes.find(i=>i.table==='parent')!.children).toEqual(['umf_key_probe.child']);expect(r.indexes.find(i=>i.table==='folded_text')!.components[0]!.collation!.deterministic).toBe(false);
 expect(r.indexes.find(i=>i.table==='compound')!.components.map(c=>c.name)).toEqual(['tenant','id']);
});
test('unknown numbers and content stay exact in source and tagged tree, not rounded into interpreted view',()=>{
 const raw=JSON.stringify(capture()).replace('"profile"','"future":{"big":9007199254740993,"zero":-0,"decimal":1.2300},"profile"');
 const r=inspectPostgresqlKeyCatalog(raw);expect(r.nativeSource).toBe(raw);expect(r.root.kind).toBe('object');if(r.root.kind==='object')expect(r.root.members.future).toEqual({kind:'object',members:{big:{kind:'number',value:'9007199254740993'},zero:{kind:'number',value:'-0'},decimal:{kind:'number',value:'1.2300'}}});
});
test('rejects unsafe declared integers, missing fields, invalid positions and mismatched constraints',()=>{
 const base=capture();for(const change of [(r:any)=>r.indexes[0].keyCount=9007199254740992,(r:any)=>r.indexes[0].components[0].position=2,(r:any)=>delete r.indexes[0].ready,(r:any)=>r.indexes[0].attributeCount=10,(r:any)=>r.indexes.push(r.indexes[0]),(r:any)=>r.serverVersion=180000,(r:any)=>r.indexes[0].components[0].attribute=0]){const x=structuredClone(base);change(x);expect(()=>inspectPostgresqlKeyCatalog(JSON.stringify(x))).toThrow();}
 const x=capture(),primary=x.indexes.find(i=>i.primary)!;primary.unique=false;expect(()=>inspectPostgresqlKeyCatalog(JSON.stringify(x))).toThrow();
});
