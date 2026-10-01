import {test,expect} from 'bun:test';
import {verifyRelationshipAuthoredCorpus,verifyRelationshipConformance} from '../../scripts/core-ideals/relationship-conformance';
import {verifyRelationshipEvidence} from '../../scripts/core-ideals/relationship-evidence';
import {readEvidence,digest} from '../../scripts/core-ideals/relationship-gate-inputs';
// @covers US-045-AC1 @covers US-045-AC2 @covers US-045-AC3 @covers US-045-AC4 @covers US-045-AC5 @covers US-045-AC6 @covers US-045-AC7 @covers US-045-AC8 @covers US-045-AC10
test('authored shape corpus preserves unknown content, keyed association and migration rollback',()=>{
 const result=verifyRelationshipAuthoredCorpus();expect(result.cases.length).toBeGreaterThanOrEqual(9);
 expect(result.cases.every(c=>c.recoveries>0&&c.refusals>0)).toBe(true);
 expect(result.cases.find(c=>c.id==='reified-association')!.relationship.associationRecord).toEqual({module:'sales',element:'Enrollment'});
 expect(result.cases.find(c=>c.id==='bounded-owned-one-to-many')!.relationship.targetMultiplicity).toEqual({min:2,max:3});
},300000);
// @covers US-045-AC9
test('ideal admission and qualified five-system delivery require current executable proofs',async()=>{
 const result=await verifyRelationshipConformance();expect(result.admission.idealAdmitted).toBe(true);expect(result.admission.usefulSystems).toEqual(['postgresql','sqlserver']);expect(result.delivery.systems).toHaveLength(5);expect(result.delivery.extras).toHaveLength(3);expect(result.nativeEquivalence).toBe(false);
},300000);
// @covers US-045-AC9
test('missing, failed, stale, tampered and version-mismatched proofs refuse admission',async()=>{
 const manifest='fixtures/validation/relationship-gate-refresh.json',proof='fixtures/validation/relationship-postgresql-native.json';
 for(const kind of ['missing','failed','stale','tampered','version','empty'] as const){
  const reader=async(path:string)=>{
   if(kind==='missing'&&path===proof)throw Error('Missing proof');
   let bytes:Uint8Array=await readEvidence(path);
   if(path===manifest){const value=JSON.parse(new TextDecoder().decode(bytes));if(kind==='failed')value.commands[0].exitCode=1;if(kind==='stale')value.sourceHashes['src/index.ts']='0'.repeat(64);if(kind==='tampered')value.proofHashes[proof]='0'.repeat(64);
    if(kind==='version'||kind==='empty'){const p=JSON.parse(new TextDecoder().decode(await readEvidence(proof)));if(kind==='version')p.serverVersion=1;else p.rows=[];value.proofHashes[proof]=digest(JSON.stringify(p));}bytes=new TextEncoder().encode(JSON.stringify(value));
   }else if(path===proof&&(kind==='version'||kind==='empty')){const p=JSON.parse(new TextDecoder().decode(bytes));if(kind==='version')p.serverVersion=1;else p.rows=[];bytes=new TextEncoder().encode(JSON.stringify(p));}
   return bytes;
  };
  await expect(verifyRelationshipEvidence(reader)).rejects.toThrow();
 }
},300000);
