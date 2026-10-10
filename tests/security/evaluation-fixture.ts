import {securityFixture,ref} from './fixture';
import type {SecurityFact,SecurityFactCut} from '../../src/extensions/security/evaluate';
import type {CoreLiteral} from '../../src/model/schema-literals';

export function evaluationFixture(){
  const model=securityFixture();
  const fact=(type:string,key:string,fields:Record<string,CoreLiteral>):SecurityFact=>({type:ref(type),key:[{string:key}],
    fields:Object.entries(fields).map(([name,value])=>({field:ref(name),value})),absent:[]});
  const subject=fact('Staff','alice',{staffId:{string:'alice'}});
  const resource=fact('Resource','r1',{resourceId:{string:'r1'},salary:{integerToken:'100'}});
  const owner=fact('Ownership','o1',{ownerId:{string:'o1'},ownerResource:{string:'r1'},ownerProject:{string:'p1'}});
  const assignment=fact('Assignment','a1',{assignmentId:{string:'a1'},assignmentStaff:{string:'alice'},assignmentProject:{string:'p1'},active:{boolean:true}});
  const cut:SecurityFactCut={trusted:true,generation:'g1',expectedGeneration:'g1',policyId:'project-access',policyRevision:'policy-1',ontologyDocumentId:'domain',ontologyRevision:'ontology-1',
    subjects:[subject],facts:[owner,assignment],coverage:[...model.resolution.ontology.entities,...model.resolution.ontology.associations].map(t=>({type:t.type,complete:true,fields:t.fields.map(f=>f.ref)})),context:[],maxFacts:100,maxSteps:10000};
  return {...model,resource,cut,owner,assignment};
}
