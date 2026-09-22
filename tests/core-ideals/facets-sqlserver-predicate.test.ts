import {test,expect} from 'bun:test';
import {inspectSqlServerFacetPredicate as inspect} from '../../src/adapters/sqlserver/facet-predicate';
import {predicateCases,unsupportedPredicates} from '../../scripts/core-ideals/facets-sqlserver-predicate-cases';

test('bounded expressions retain exact literals and delimit identifiers',()=>{
 for(const row of predicateCases){const r=inspect(row.text,row.column);expect(r.native).toBe(row.text);expect(r.state,row.text).toBe('candidate');expect(r.candidates).toEqual(row.expected);expect(r.requires).toBe('catalog-type-association-enforcement-and-collation-evidence');}
});
test('unsupported syntax and resource limits refuse the entire expression',()=>{
 for(const text of unsupportedPredicates){const r=inspect(text,'value');expect(r.native).toBe(text);expect(r.state,text.slice(0,100)).toBe('unsupported');expect(r.candidates).toEqual([]);}
});
test('captured native CHECK syntax is distinct from enabled, trusted enforcement',async()=>{
 const proof=await Bun.file('fixtures/validation/facets-sqlserver-discovery-native.json').json();const source=JSON.parse(proof.sourceText);let candidate=0,unsupported=0,unenforced=0;
 for(const table of source.tables)for(const check of table.checks){const r=inspect(check.definition,'value');expect(r.native).toBe(check.definition);if(table.name==='custom'){expect(r.state).toBe('unsupported');unsupported++;}else{expect(r.state,table.name).toBe('candidate');candidate++;}if(check.is_disabled||check.is_not_trusted||check.is_not_for_replication){expect(r.state).toBe('candidate');expect(r.requires).toBe('catalog-type-association-enforcement-and-collation-evidence');unenforced++;}}
 expect({candidate,unsupported,unenforced}).toEqual({candidate:10,unsupported:1,unenforced:3});
});
test('non-string native JSON stays intact and accessors cannot execute',()=>{
 const native={definition:'[value]>=0',unknown:{future:[true,null,'huge']}};const r=inspect(native,'value');expect(r.state).toBe('unsupported');expect(r.native).toEqual(native);expect(r.native).not.toBe(native);
 for(const name of ['', 'x'.repeat(129), 'value\0', '\ud800', '\udc00'])expect(inspect(`[${name}]>=0`,name).state).toBe('unsupported');
 let calls=0;expect(()=>inspect({get definition(){calls++;return '[value]>=0';}},'value')).toThrow();expect(calls).toBe(0);
});
