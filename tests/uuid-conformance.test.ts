import {test,expect} from 'bun:test';
import {evaluateUuidAdmission,verifyUuidFingerprints,verifyUuidConformance} from '../scripts/uuid/conformance';
test('separate UUID ideal admission and five-target delivery require complete current native/source evidence',async()=>{
 const r=await verifyUuidConformance();expect(r.idealAdmitted).toBe(true);expect(r.priorityDelivery).toBe(true);expect(r.nativeEquivalence).toBe(false);for(const n of Object.values(r.conflicts))expect(n).toBe(4);
});
test('missing, stale, unsafe and falsified qualification cannot admit support',async()=>{
 const q=await Bun.file('fixtures/validation/uuid/model-qualification.json').json(),native=await Bun.file('fixtures/validation/uuid/native-adapter-roundtrips.json').json();
 for(const change of [(r:any)=>r.fileCases--,(r:any)=>r.databases.pop(),(r:any)=>r.browser.nodeGlobalsAbsent=false,(r:any)=>r.returnedNativeRows--,(r:any)=>r.returnedNativeRefusals--,(r:any)=>r.commands.tests=1]){const copy=structuredClone(q);change(copy);expect(()=>evaluateUuidAdmission(copy,native)).toThrow();}
 const missing=structuredClone(native);missing.cases.pop();expect(()=>evaluateUuidAdmission(q,missing)).toThrow();
 await expect(verifyUuidFingerprints({fingerprints:{}})).rejects.toThrow('Missing source-bound');
 const unsafe=structuredClone(q);unsafe.fingerprints['../escape']='00';await expect(verifyUuidFingerprints(unsafe)).rejects.toThrow('Unsafe evidence path');
 const stale=structuredClone(q);stale.fingerprints['src/model/uuid.ts']='00';await expect(verifyUuidFingerprints(stale)).rejects.toThrow();
});
