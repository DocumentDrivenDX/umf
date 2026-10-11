import assert from 'node:assert/strict';
import {assertJsonDataEqual} from './json-data-assert';
import corpus from '../../fixtures/relationship/authored/corpus.json';
import * as u from '../../src';
import {relationshipExtraCases} from './relationship-extras-cases';
import {verifyRelationshipEvidence} from './relationship-evidence';
import {relationshipTests,digest} from './relationship-gate-inputs';

// @covers US-045-AC1 @covers US-045-AC2 @covers US-045-AC3 @covers US-045-AC4 @covers US-045-AC5 @covers US-045-AC6 @covers US-045-AC7 @covers US-045-AC8 @covers US-045-AC10
export function verifyRelationshipAuthoredCorpus(){
 const variants=[...corpus.cases,{id:'bounded-owned-one-to-many',relationship:{...structuredClone(corpus.cases[1]!.relationship),sourceMultiplicity:{min:1,max:2},targetMultiplicity:{min:2,max:3}}}];
 const cases=[];
 for(const c of variants){
  const legacy=structuredClone(corpus.base) as unknown as u.Document;
  legacy.extensions={future:{integerText:'9007199254740993',unknown:[null,{retained:true}]}};
  legacy.vocabularies.future={version:"1.0.0"};
  (legacy.modules[0] as any).relationships={futureNative:'uninterpreted collision'};
  const upgrade=u.upgradeRelationshipEnvelope(legacy),author=u.declareCoreRelationship(upgrade.target,{module:'sales'},c.relationship as any),source=author.target;
  assert.equal(u.validateRelationshipCandidate(source).valid,true);
  let recoveries=0,refusals=0;
  for(const format of ['json','yaml'] as const){
   const saved=u.readJsonValue(u.writeJsonValue(upgrade as any,format),format) as unknown as typeof upgrade;
   const rolled=u.rollbackRelationshipEnvelope(saved,source);assertJsonDataEqual(rolled.target,legacy);assertJsonDataEqual(rolled.source,source);u.verifyRelationshipTransition(rolled);recoveries++;
   const forged=structuredClone(saved);forged.target.id='forged';assert.throws(()=>u.rollbackRelationshipEnvelope(forged,source));refusals++;
  }
  const extras=[];
  for(const template of relationshipExtraCases().filter(x=>x.name.startsWith((c.id==='bounded-owned-one-to-many'?'owned-one-to-many':c.id)+'-'))){
   const r=u.projectRelationshipToExtra(source as unknown as u.Document,author,template.request);
   if(template.request.mode==='strict'){assert.equal(r.status,'blocked');assert.equal(r.target,undefined);extras.push({system:template.request.system,mode:'strict',status:r.status});continue;}
   assert.equal(r.status,'projected');const current=u.importRelationshipExtraArchive(r.nativeArchive!,'fresh-gate');
   for(const format of ['json','yaml'] as const){
    const saved=u.readJsonValue(u.writeJsonValue(r as any,format),format) as unknown as typeof r;
    assertJsonDataEqual(u.recoverRelationshipExtraIdeal(saved,current),source);
    assertJsonDataEqual(u.recoverRelationshipExtraNative(saved,current).archive,r.nativeArchive);
    const classified=u.classifyRelationshipExtra(current,{system:template.request.system,mode:'report',archive:r.nativeArchive!});
    assert(!classified.target!.modules.some(m=>Object.hasOwn(m,'relationships')),'Native classification invented intent');
    assertJsonDataEqual(u.recoverRelationshipExtraNative(classified,classified.target!).archive,r.nativeArchive);recoveries+=3;
   }
   const forged=structuredClone(r);forged.residuals.pop();assert.throws(()=>u.verifyRelationshipExtra(forged,current));refusals++;
   extras.push({system:template.request.system,mode:'report',status:r.status,residuals:r.residuals.length});
  }
  assert.equal(extras.length,6);cases.push({id:c.id,relationship:c.relationship,sourceSha256:digest(JSON.stringify(source)),recoveries,refusals,extras});
 }
 assert.equal(cases.length,corpus.cases.length+1);
 return {cases,migration:'0.6.0 to 0.7.0 with exact legacy rollback and retained new assertions',unknownContentRetained:true};
}
// Reexecute the binding tests here: the gate must not merely trust earlier counters.
export async function verifyRelationshipBindingRoundTrips(){
 const child=Bun.spawn(['bun','test',...relationshipTests],{stdout:'pipe',stderr:'pipe'});
 const [out,err,code]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);
 assert.equal(code,0,'Relationship binding recovery checks failed:\n'+out+err);
 const text=out+err,match=text.match(/(\d+) pass[\s\S]*?(\d+) fail/);assert(match,'Missing Bun test result');assert.equal(Number(match[2]),0);assert(Number(match[1])>0);
 return {command:['bun','test',...relationshipTests],passed:Number(match[1]),failed:0,logSha256:digest(text)};
}
// @covers US-045-AC9 @covers US-045-AC10
export async function verifyRelationshipConformance(){
 const evidence=await verifyRelationshipEvidence(),authored=verifyRelationshipAuthoredCorpus(),roundTrips=await verifyRelationshipBindingRoundTrips();
 assertJsonDataEqual(await verifyRelationshipEvidence(),evidence,'Evidence changed during conformance');
 const admission={idealAdmitted:true,minimumUsefulPriorityMappings:2,usefulSystems:evidence.usefulSystems,usefulMappings:evidence.usefulMappings,qualification:{path:'fixtures/validation/relationship-gate-refresh.json',sha256:evidence.refreshSha256,versions:evidence.versions},authored};
 const delivery={priorityDelivery:true,systems:['postgresql','sqlserver','tablespec','avro','parquet'],extras:['graphql','rdf','linkml'],evidence,roundTrips};
 return {admission,delivery,nativeEquivalence:false,limits:[
  'Useful priority mappings are qualified PostgreSQL and SQL Server FK/junction mappings with independent insertion controls; remaining endpoint multiplicities, ownership, inverse intent and qualifiers remain explicit residuals.',
  'The canonical six shapes, alternate Key selection, undirected relationship, keyed Enrollment association and bounded multiplicities are admitted independently of physical representability. Each target matrix retains its own refusals and qualified subset.',
  'TableSpec metadata, Avro/Parquet target-key carriers and GraphQL/RDF/LinkML schema declarations do not enforce graph-wide relationship instances.',
  'Native-only classification retains original archives and records observations without inventing author identity. Retained receipts prove consistency, not authenticity.',
  'Historical feature-worktree acceptance records remain historical; this gate consumes a successful current-source replay only.'
 ]};
}
if(import.meta.main){const result=await verifyRelationshipConformance();await Bun.write('fixtures/validation/relationship-conformance.json',JSON.stringify(result,null,2)+'\n');await Bun.write('fixtures/validation/relationship-admission.json',JSON.stringify({...result.admission,nativeEquivalence:false},null,2)+'\n');await Bun.write('fixtures/validation/relationship-delivery.json',JSON.stringify({...result.delivery,nativeEquivalence:false},null,2)+'\n');console.log(JSON.stringify({idealAdmitted:true,priorityDelivery:true,nativeEquivalence:false,authoredCases:result.admission.authored.cases.length,roundTrips:result.delivery.roundTrips.passed}));}
