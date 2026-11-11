// SPDX-License-Identifier: MIT OR Apache-2.0
import assert from 'node:assert/strict';
import {verifyKeyAuthoredRoundTrips,verifyKeyIdentityConflicts} from './key-roundtrips';
import {verifyKeyNativeRoundTrips} from './key-native-roundtrips';

export const keySystems = ['tablespec', 'postgresql', 'sqlserver', 'avro', 'parquet'] as const;
export async function verifyKeyConformance() {
 const authored=await verifyKeyAuthoredRoundTrips();
 const conflicts=await verifyKeyIdentityConflicts();
 const native=await verifyKeyNativeRoundTrips();
 const usefulSystems=keySystems.filter(s=>authored[s]!.usefulStoredValueMappings>0);
 assert.deepEqual(usefulSystems,['postgresql','sqlserver'],'two useful enforced down-projections required');
 for(const system of keySystems){
  assert.ok(authored[system]!.recoveries>0 && native[system]!.recoveries>0);
  assert.equal(conflicts[system],4);
 }
 return {sourceUsefulSystems:usefulSystems,authored,conflicts,native};
}
