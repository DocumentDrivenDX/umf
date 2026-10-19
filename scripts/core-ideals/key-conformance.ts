import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {verifyKeyEvidence,keySystems} from './key-evidence';
import {verifyKeyAuthoredRoundTrips,verifyKeyIdentityConflicts} from './key-roundtrips';
import {verifyKeyNativeRoundTrips} from './key-native-roundtrips';

export async function verifyKeyConformance() {
 const evidence=await verifyKeyEvidence(undefined,{allowUnqualifiedHistorical:true});
 const authored=await verifyKeyAuthoredRoundTrips();
 const conflicts=await verifyKeyIdentityConflicts();
 const native=await verifyKeyNativeRoundTrips();
 assert.deepEqual(await verifyKeyEvidence(undefined,{allowUnqualifiedHistorical:true}),evidence,'qualification changed during conformance');
 const usefulSystems=keySystems.filter(s=>authored[s]!.usefulStoredValueMappings>0);
 assert.deepEqual(usefulSystems,['postgresql','sqlserver'],'two useful enforced down-projections required');
 for(const system of keySystems){
  assert.ok(authored[system]!.recoveries>0 && native[system]!.recoveries>0);
  assert.equal(conflicts[system],4);
 }
 return {scope:'Current named Key authoring/receipt behavior and historical native evidence are reported separately',idealAdmitted:false,sourceOperationsVerified:true,sourceUsefulSystems:usefulSystems,currentNativeQualification:'UNQUALIFIED',historicalQualification:evidence.historicalQualification,priorityDelivery:false,qualifiedBindings:0,nativeEquivalence:false,evidence,authored,native,conflicts,
  limits:['SQL enforcement applies to the qualified required stored-value domains; conversion, session, index-size and scope restrictions remain residuals.',
   'TableSpec declarations and Avro/Parquet encodings do not enforce collection identity.',
   'SQL Server authored recovery retains explicit DDL; classification uses independent engine catalogs, not a DDL parser.',
   'PostgreSQL native classification uses independent discovery catalogs; generated DDL enforcement is verified by separate native insertion controls.',
   'Native-only imports cannot infer authored stable key IDs, names, primary intent or unknown qualifiers. Receipts establish consistency, not authentication.']};
}
if(import.meta.main){
 const result=await verifyKeyConformance();
 const paths=['scripts/core-ideals/key-conformance.ts','scripts/core-ideals/key-evidence.ts','scripts/core-ideals/key-roundtrips.ts','scripts/core-ideals/key-native-roundtrips.ts','tests/core-ideals/key-conformance.test.ts','tests/core-ideals/key-evidence.test.ts','tests/core-ideals/key-authored-roundtrips.test.ts','tests/core-ideals/key-native-roundtrips.test.ts','fixtures/validation/key-gate-refresh-evidence.json'];
 const sha256=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/key-conformance.json',JSON.stringify({...result,sha256},null,2)+'\n');
 console.log(JSON.stringify({idealAdmitted:result.idealAdmitted,sourceOperationsVerified:result.sourceOperationsVerified,currentNativeQualification:result.currentNativeQualification,priorityDelivery:result.priorityDelivery,nativeEquivalence:false,sourceUsefulSystems:result.sourceUsefulSystems,authored:result.authored,native:result.native}));
}
