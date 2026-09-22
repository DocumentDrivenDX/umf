import {test,expect} from 'bun:test';
import {createHash} from 'node:crypto';
import {projectFacetsToSqlServer} from '../../src';
import {facetsSqlServerProjectionCases} from '../../scripts/core-ideals/facets-sqlserver-projection-cases';
const proof=await Bun.file('fixtures/validation/facets-sqlserver-projection-native.json').json();
test('pinned native execution matches current authored DDL and keeps exact value counterexamples',async()=>{
 expect(proof.serverVersion).toBe('16.0.4295.3');expect(proof.projected).toBe(145);expect(proof.blocked).toBe(93);expect(proof.probes.length).toBe(27);expect(proof.serializationRecoveries).toBe(2);expect(proof.idealRecoveries).toBe(145);
 for(const [path,hash] of Object.entries(proof.sha256 as Record<string,string>))expect(createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex'),path).toBe(hash);
 const rows=facetsSqlServerProjectionCases();expect(proof.cases.length).toBe(rows.length);
 for(const [i,c] of rows.entries()){const actual=projectFacetsToSqlServer(c.author,c.request);expect(proof.cases[i].status).toBe(actual.status);expect(proof.cases[i].nativeSql).toBe(actual.nativeSql??null);}
 for(const p of proof.probes){expect(p.actual.error,p.id).toBe(p.error);expect(p.actual.value,p.id).toBe(p.expected);}
 const probe=(id:string)=>proof.probes.find((p:any)=>p.id===id).actual;
 expect(probe('decimal-rounded-before-check').value).toBe('1.24');expect(probe('real-narrows').value).toBe('1.0000000000000000e+000');expect(probe('unicode-malformed-residual').value).toBe('00D8');
 const native=JSON.parse(proof.sourceText),control=rows.find(c=>c.request.tableName.includes('] quote'))!;
 expect(native.tables.find((t:any)=>t.name===control.request.tableName).columns[0].description).toBe(control.author.target.modules[0]!.elements[0]!.description);
});
