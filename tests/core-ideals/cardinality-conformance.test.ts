import {test,expect} from 'bun:test';
import {cardinalitySystems,verifyCardinalityEvidence,verifyCardinalityRoundTrips} from '../../scripts/core-ideals/cardinality-conformance';
test('five Cardinality bindings preserve ideals, native refinements and qualified strict/report outcomes',async()=>{
 const result=await verifyCardinalityRoundTrips();expect(Object.keys(result)).toEqual([...cardinalitySystems]);
 const expected={tablespec:[86,38,336,110],postgresql:[56,26,104,34],sqlserver:[112,40,56,20],avro:[86,30,80,22],parquet:[168,32,120,44]};
 for(const system of cardinalitySystems){
  const r=result[system];expect([r.authoredCases,r.strictBlocks,r.nativeCases,r.nativeBlocks]).toEqual(expected[system]);expect(r.compositions).toBeGreaterThan(0);expect(r.labels).toEqual(['array','map','one','unspecified']);
  expect(r.strictBlocks).toBeGreaterThan(0);expect(r.reportResiduals).toBeGreaterThan(0);
  expect(r.idealRecoveries).toBe((r.authoredCases-r.strictBlocks)*2);
  expect(r.nativeBlocks).toBeGreaterThan(0);expect(r.nativeRecoveries).toBe((r.nativeCases-r.nativeBlocks)*2);
 }
},600000);
test('Cardinality evidence gate rejects stale, missing, unsafe and failed proof',async()=>{
 const result=await verifyCardinalityEvidence();expect(result.systems).toEqual([...cardinalitySystems]);expect(result.records).toHaveLength(6);expect(result.fingerprints).toBeGreaterThan(0);
 const read=async(path:string)=>new Uint8Array(await Bun.file(path).arrayBuffer());
 async function mutate(path:string,change:(r:any)=>void){const r=JSON.parse(new TextDecoder().decode(await read(path)));change(r);return new TextEncoder().encode(JSON.stringify(r));}
 const cases:[string,(r:any)=>void,string][]=[
  ['cardinality-core-acceptance-evidence',r=>delete r.sha256['spec/core/cardinality-document.schema.json'],'missing required proof'],
  ['cardinality-core-acceptance-evidence',r=>delete r.sha256['fixtures/validation/core-cardinality-browser.json'],'missing required proof'],
  ['cardinality-postgresql-native',r=>r.nativeVersion='unqualified','17.4'],
  ['cardinality-tablespec-browser',r=>r.sha256['/outside/unknown-browser.json']='0'.repeat(64),'unsafe evidence path'],
  ['parquet-cardinality-acceptance-evidence',r=>delete r.sha256['fixtures/validation/cardinality-parquet-native.json'],'missing required proof'],
  ['cardinality-core-acceptance-evidence',r=>r.sha256['/etc/passwd']='0'.repeat(64),'unsafe evidence path'],
  ['avro-cardinality-acceptance-evidence',r=>r.nativeEquivalence=true,'false'],
  ['sqlserver-cardinality-acceptance-evidence',r=>r.bindingAccepted=false,'not accepted'],
  ['tablespec-cardinality-acceptance-evidence',r=>r.results.failures=1,'failures'],
  ['field-gate-refresh-evidence',r=>r.runs[0].exitCode=1,'Failed command'],
  ['field-gate-refresh-evidence',r=>r.runs=r.runs.filter((x:any)=>!x.command.includes('scripts/core-ideals/cardinality-parquet-oracle.ts')),'Missing command'],
 ];
 for(const [name,change,message] of cases)await expect(verifyCardinalityEvidence(p=>p===`fixtures/validation/${name}.json`?mutate(p,change):read(p))).rejects.toThrow(message);
 await expect(verifyCardinalityEvidence(p=>p==='src/model/cardinality.ts'?Promise.resolve(new TextEncoder().encode('changed')):read(p))).rejects.toThrow('stale');
 await expect(verifyCardinalityEvidence(p=>p.endsWith('parquet-cardinality-acceptance-evidence.json')?Promise.reject(Error('missing binding')):read(p))).rejects.toThrow('missing binding');
},120000);
