import {test,expect} from 'bun:test';
import {createHash} from 'node:crypto';
test('emitted PostgreSQL DDL and independent values have current pinned evidence',async()=>{
 const proof=await Bun.file('fixtures/validation/facets-postgresql-projection-native.json').json();
 expect(proof.serverVersion).toBe(170004);expect(proof.encoding).toBe('UTF8');expect(proof.ambientOperatorShadow).toBe(true);expect(proof.counts).toEqual({cases:232,emitted:145,blocked:87,probes:479,rejections:166,catalogRecoveries:2});
 for(const [path,sha] of Object.entries(proof.sha256 as Record<string,string>))expect(createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex')).toBe(sha);
 expect(proof.capture.snapshot.relations).toHaveLength(145);
 for(const row of proof.results){if(row.reject)expect(['23514','22003','22001']).toContain(row.actual.sqlstate);else expect(row.actual.sqlstate).toBe('00000');}
 const find=(name:string,encoding:string,id:string)=>{const p=proof.projections.find((p:any)=>p.name===name&&p.request.encoding===encoding&&p.status==='projected');return proof.results.find((r:any)=>r.id===p.request.tableName+'-'+id);};
 expect(find('decimal-5-2','checked','extra-scale').actual.sqlstate).toBe('23514');
 expect(find('decimal-5-2','type-modifier','extra-scale').actual).toEqual({sqlstate:'00000',value:'0.00'});
 expect(find('numeric-integer-128','checked','fraction').actual.sqlstate).toBe('23514');
 expect(find('numeric-integer-128','checked','max').actual.value).toBe('340282366920938463463374607431768211455');
 expect(find('length-text-2','checked','unicode').actual.value).toBe('2');
 expect(find('bytes-2','checked','max').actual.value).toBe('2');
 expect(find('facetless-real','checked','float-narrowing').actual.value).toBe('1');
 expect(find('facetless-double precision','checked','float-retention').actual.value).toBe('1.0000000000000002');
});
