// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {verifyKeyConformance} from '../../scripts/core-ideals/key-conformance';
test('Key source operations retain both recovery directions without claiming native qualification',async()=>{
 const r=await verifyKeyConformance();
 expect(r.idealAdmitted).toBe(false);expect(r.sourceOperationsVerified).toBe(true);expect(r.currentNativeQualification).toBe('UNQUALIFIED');expect(r.historicalQualification).toBe('PARTIALLY_REVALIDATED');expect(r.priorityDelivery).toBe(false);expect(r.qualifiedBindings).toBe(0);expect(r.nativeEquivalence).toBe(false);
 expect(r.sourceUsefulSystems).toEqual(['postgresql','sqlserver']);
 expect(Object.keys(r.native)).toHaveLength(5);
},120000);
