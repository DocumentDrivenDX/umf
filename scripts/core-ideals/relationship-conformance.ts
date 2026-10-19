import assert from 'node:assert/strict';
import {assertJsonDataEqual} from './json-data-assert';
import corpus from '../../fixtures/relationship/authored/corpus.json';
import * as u from '../../src';
import {relationshipCurrentBase} from './relationship-current-base';
import {relationshipExtraCases} from './relationship-extras-cases';
import {verifyRelationshipEvidence} from './relationship-evidence';
import {relationshipTests,digest} from './relationship-gate-inputs';

// @covers US-045-AC1 @covers US-045-AC2 @covers US-045-AC3 @covers US-045-AC4 @covers US-045-AC5 @covers US-045-AC6 @covers US-045-AC7 @covers US-045-AC8
export function verifyRelationshipAuthoredCorpus(){
 const variants=[...corpus.cases,{id:'bounded-owned-one-to-many',relationship:{...structuredClone(corpus.cases[1]!.relationship),sourceMultiplicity:{min:1,max:2},targetMultiplicity:{min:2,max:3}}}];
 const cases=[];
 for(const c of variants){
  const base=relationshipCurrentBase();
  base.extensions={future:{integerText:'9007199254740993',unknown:[null,{retained:true}]}};
  base.vocabularies.future={version:"1.0.0"};
  const author=u.declareCoreRelationship(base,{module:'sales'},c.relationship as any),source=author.target;
  assert.equal(u.validateRelationshipCandidate(source).valid,true);
  let recoveries=0,refusals=0;
  for(const format of ['json','yaml'] as const){
   const saved=u.readJsonValue(u.writeJsonValue(author as any,format),format) as unknown as typeof author;
   assertJsonDataEqual(u.verifyCoreRelationshipOperation(saved,source),author);recoveries++;
   const forged=structuredClone(saved);forged.target.id='forged';assert.throws(()=>u.verifyCoreRelationshipOperation(forged,source));refusals++;
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
 return {cases,coreVersion:u.CURRENT_CORE_VERSION,operation:'current relationship declaration with retained extension content',unknownContentRetained:true,construction:{base:'independently authored current document',shapeProposals:{path:'fixtures/relationship/authored/corpus.json',originalCoreVersion:'0.6.0',archivedSha256:'aa751e8d09ad68e9423f3067f38ee51dd6bc9885a43bed22d1c8df3919a421bb',use:'relationship proposal values only; historical base is never promoted or treated as a current source'}}};
}
// Reexecute the binding tests here: the gate must not merely trust earlier counters.
export async function verifyRelationshipBindingRoundTrips(){
 const child=Bun.spawn(['bun','test',...relationshipTests],{stdout:'pipe',stderr:'pipe'});
 const [out,err,code]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);
 assert.equal(code,0,'Relationship binding recovery checks failed:\n'+out+err);
 const text=out+err,match=text.match(/(\d+) pass[\s\S]*?(\d+) fail/);assert(match,'Missing Bun test result');assert.equal(Number(match[2]),0);assert(Number(match[1])>0);
 return {command:['bun','test',...relationshipTests],passed:Number(match[1]),failed:0,logSha256:digest(text)};
}
// @covers US-045-AC9
export async function verifyRelationshipConformance(){
 const evidence=await verifyRelationshipEvidence(undefined,{allowUnqualifiedHistorical:true}),authored=verifyRelationshipAuthoredCorpus(),roundTrips=await verifyRelationshipBindingRoundTrips();
 assertJsonDataEqual(await verifyRelationshipEvidence(undefined,{allowUnqualifiedHistorical:true}),evidence,'Evidence changed during conformance');
 const admission={idealAdmitted:false,sourceOperationsVerified:true,currentNativeQualification:'UNQUALIFIED',minimumUsefulPriorityMappings:2,sourceUsefulSystems:evidence.usefulSystems,sourceUsefulMappings:evidence.usefulMappings,historicalQualification:'PARTIALLY_REVALIDATED',qualification:{path:'fixtures/validation/relationship-gate-refresh.json',sha256:evidence.refreshSha256,versions:evidence.versions},authored};
 const delivery={priorityDelivery:false,sourceBindingsVerified:['postgresql','sqlserver','tablespec','avro','parquet'],qualifiedBindings:0,currentNativeQualification:'UNQUALIFIED',systems:['postgresql','sqlserver','tablespec','avro','parquet'],extras:['graphql','rdf','linkml'],evidence,roundTrips};
 return {admission,delivery,nativeEquivalence:false,limits:[
  'Historical PostgreSQL and SQL Server FK/junction evidence records contain useful insertion controls; their current native qualification remains UNQUALIFIED because original source and oracle artifacts are only partially recoverable.',
  'The current-source replay exercises six canonical shapes, alternate Key selection, an undirected relationship, a keyed Enrollment association and bounded multiplicities. It does not establish current native admission or physical representability.',
  'TableSpec metadata, Avro/Parquet target-key carriers and GraphQL/RDF/LinkML schema declarations do not enforce graph-wide relationship instances.',
  'Native-only classification retains original archives and records observations without inventing author identity. Retained receipts prove consistency, not authenticity.',
  'Current source declaration and recovery behavior is tested separately from historical native acceptance. Missing original artifacts remain explicit and cannot promote current native admission or delivery.'
 ]};
}
if(import.meta.main){const result=await verifyRelationshipConformance();await Bun.write('fixtures/validation/relationship-conformance.json',JSON.stringify(result,null,2)+'\n');await Bun.write('fixtures/validation/relationship-admission.json',JSON.stringify({...result.admission,nativeEquivalence:false},null,2)+'\n');await Bun.write('fixtures/validation/relationship-delivery.json',JSON.stringify({...result.delivery,nativeEquivalence:false},null,2)+'\n');console.log(JSON.stringify({idealAdmitted:false,sourceOperationsVerified:true,priorityDelivery:false,nativeEquivalence:false,authoredCases:result.admission.authored.cases.length,roundTrips:result.delivery.roundTrips.passed}));}
