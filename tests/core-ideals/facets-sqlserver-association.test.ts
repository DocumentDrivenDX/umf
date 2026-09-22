import {test,expect} from 'bun:test';
import {createHash} from 'node:crypto';
import * as u from '../../src';
import {inspectSqlServerFacetConstraints as inspect} from '../../src/adapters/sqlserver/facet-constraints';
const proof=await Bun.file('fixtures/validation/facets-sqlserver-association-native.json').json();
const native=JSON.parse(proof.sourceText),document=u.importSqlServerCatalog(proof.sourceText,{id:'association'});
test('independent table declaration probes establish catalog association and counterexamples',async()=>{
 expect(proof.serverVersion).toBe('16.0.4295.3');expect(proof.columns).toBe(12);expect(proof.cases.length).toBe(11);expect(proof.serializationRecoveries).toBe(2);
 for(const [path,hash] of Object.entries(proof.sha256 as Record<string,string>))expect(createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex'),path).toBe(hash);
 for(const c of proof.cases){expect(c.actual.error,c.id).toBe(c.error);expect(c.actual.value,c.id).toBe(c.expected);}
 for(const [i,t] of native.tables.entries()){
  const value=inspect(document,`/tables/${i}/columns/0`).observations[0]!,other=inspect(document,`/tables/${i}/columns/1`).observations[0]!;
  expect(other.state).toBe('residual');expect(other.facts).toEqual([]);
  if(['cross_column','compound'].includes(t.name)){expect(t.checks[0].parent_column_id).toBe(0);expect(value.state).toBe('residual');expect(value.facts).toEqual([]);}
  else{expect(t.checks[0].parent_column_id).toBe(1);expect(value.state).toBe(t.name==='disabled'?'residual':'interpreted');}
  if(t.name==='untrusted')expect(value.scope).toBe('ordinary-checked-write-non-null');
 }
},20000);
