import {test,expect} from 'bun:test';
import {verifyKeyConformance} from '../../scripts/core-ideals/key-conformance';
test('Key ideal admission and five-system delivery retain both recovery directions without native equivalence',async()=>{
 const r=await verifyKeyConformance();
 expect(r.idealAdmitted).toBe(true);expect(r.priorityDelivery).toBe(true);expect(r.nativeEquivalence).toBe(false);
 expect(r.usefulSystems).toEqual(['postgresql','sqlserver']);
 expect(Object.keys(r.native)).toHaveLength(5);
},120000);
