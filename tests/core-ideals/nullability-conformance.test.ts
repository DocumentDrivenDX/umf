import {test,expect} from 'bun:test';
import {verifyNullabilityEvidence,verifyNullabilityRoundTrips,nullabilitySystems} from '../../scripts/core-ideals/nullability-conformance';
test('five Nullability bindings preserve ideals, native payloads and explicit loss policy',async()=>{
 const result=await verifyNullabilityRoundTrips();expect(Object.keys(result)).toEqual([...nullabilitySystems]);
 for(const system of nullabilitySystems)expect(result[system]).toEqual({authoredCases:12,strictBlocks:3,reportResiduals:3,idealRecoveries:18,nativeCases:8,nativeBlocks:2,nativeRecoveries:12});
},120000);
test('Nullability gate requires current core and five native/browser evidence records',async()=>{
 const evidence=await verifyNullabilityEvidence();expect(evidence.systems).toEqual([...nullabilitySystems]);expect(evidence.records).toHaveLength(6);expect(evidence.fingerprints).toBeGreaterThan(0);
 const reader=async(path:string)=>new Uint8Array(await Bun.file(path).arrayBuffer());
 await expect(verifyNullabilityEvidence(async path=>{
  const bytes=await reader(path);if(!path.endsWith('nullability-core-acceptance-evidence.json'))return bytes;
  const record=JSON.parse(new TextDecoder().decode(bytes));delete record.sha256['spec/core/cardinality-document.schema.json'];
  return new TextEncoder().encode(JSON.stringify(record));
 })).rejects.toThrow('missing required proof');
 await expect(verifyNullabilityEvidence(async path=>path==='src/model/nullability.ts'?new TextEncoder().encode('changed'):reader(path))).rejects.toThrow('stale');
 await expect(verifyNullabilityEvidence(async path=>{if(path.endsWith('parquet-nullability-acceptance-evidence.json'))throw Error('Missing native evidence');return reader(path);})).rejects.toThrow('Missing native evidence');
 async function mutate(path:string,change:(record:any)=>void){const value=JSON.parse(new TextDecoder().decode(await reader(path)));change(value);return new TextEncoder().encode(JSON.stringify(value));}
 await expect(verifyNullabilityEvidence(path=>path.endsWith('nullability-core-acceptance-evidence.json')?mutate(path,r=>delete r.sha256['spec/core/nullability-document.schema.json']):reader(path))).rejects.toThrow('missing required proof');
 await expect(verifyNullabilityEvidence(path=>path.endsWith('avro-nullability-acceptance-evidence.json')?mutate(path,r=>delete r.sha256['fixtures/validation/nullability-avro-native.json']):reader(path))).rejects.toThrow('missing required proof');
 await expect(verifyNullabilityEvidence(path=>path.endsWith('parquet-nullability-acceptance-evidence.json')?mutate(path,r=>r.nativeEquivalence=true):reader(path))).rejects.toThrow();
 await expect(verifyNullabilityEvidence(path=>path.endsWith('parquet-nullability-acceptance-evidence.json')?mutate(path,r=>r.results.failures=1):reader(path))).rejects.toThrow('failures');
 await expect(verifyNullabilityEvidence(path=>path.endsWith('nullability-core-acceptance-evidence.json')?mutate(path,r=>r.sha256['/etc/passwd']='0'.repeat(64)):reader(path))).rejects.toThrow('unsafe evidence path');
},120000);
