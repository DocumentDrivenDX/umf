import type {Document} from '../../src/model/types';
import type {SecurityRef,SecurityEntity,SecurityAssociation,SecurityResolution,SecurityPolicy,SecurityExpr} from '../../src/extensions/security/types';
export const ref=(elementId:string):SecurityRef=>({documentId:'domain',moduleId:'m',elementId});
export function securityFixture():{policy:SecurityPolicy;resolution:SecurityResolution} {
  const definitions=[
    ['Staff',[['staffId','string']]],['Project',[['projectId','string']]],
    ['Resource',[['resourceId','string'],['salary','integer']]],
    ['Ownership',[['ownerId','string'],['ownerResource','string'],['ownerProject','string']]],
    ['Assignment',[['assignmentId','string'],['assignmentStaff','string'],['assignmentProject','string'],['active','boolean']]],
  ] as const;
  const elements=definitions.flatMap(([name,fields])=>[
    {id:name,kind:'record',members:fields.map(([id])=>({module:'m',element:id})),keys:[{id:'pk',name:'Key',fields:[{module:'m',element:fields[0]![0]}]}],extensions:{}},
    ...fields.map(([id,scalarType])=>({id,kind:'field',scalarType,nullability:'required',cardinality:'one',extensions:{}})),
  ]);
  const document:Document={umf:'0.8.0',id:'domain',vocabularies:{},modules:[{id:'m',namespace:'',elements}]};
  const entity=(name:string):SecurityEntity=>({type:ref(name),keyId:'pk',fields:
    definitions.find(d=>d[0]===name)![1].map(([id])=>({ref:ref(id),protection:id==='salary'?'protected':'unprotected'}))});
  const association=(name:string,endpoints:SecurityAssociation['endpoints']):SecurityAssociation=>({...entity(name),endpoints});
  const ownership=association('Ownership',[{role:'resource',target:ref('Resource'),fields:[ref('ownerResource')]},{role:'project',target:ref('Project'),fields:[ref('ownerProject')]}]);
  const assignment=association('Assignment',[{role:'staff',target:ref('Staff'),fields:[ref('assignmentStaff')]},{role:'project',target:ref('Project'),fields:[ref('assignmentProject')]}]);
  const membership:SecurityExpr={op:'exists',association:ref('Ownership'),as:'o',where:{op:'and',args:[
    {op:'eq',left:{kind:'variable',name:'o',endpoint:'resource'},right:{kind:'resource',identity:true}},
    {op:'exists',association:ref('Assignment'),as:'a',where:{op:'and',args:[
      {op:'eq',left:{kind:'variable',name:'a',endpoint:'staff'},right:{kind:'subject',identity:true}},
      {op:'eq',left:{kind:'variable',name:'a',endpoint:'project'},right:{kind:'variable',name:'o',endpoint:'project'}},
      {op:'eq',left:{kind:'variable',name:'a',field:ref('active')},right:{kind:'constant',field:ref('active'),value:{boolean:true}}},
    ]}},
  ]}};
  return {resolution:{ontology:{version:'0.1.0',documentId:'domain',revision:'ontology-1',documents:[{documentId:'domain',revision:'schema-1'}],
    subject:ref('Staff'),entities:['Staff','Project','Resource'].map(entity),associations:[ownership,assignment],context:[],actions:['read','update']},documents:[{revision:'schema-1',document}]},
    policy:{vocabulary:'umf.security',version:'0.1.0',id:'project-access',revision:'policy-1',ontology:{documentId:'domain',revision:'ontology-1'},rules:[
      {id:'reader',effect:'permit',actions:['read'],target:[ref('Resource')],condition:{op:'literal',value:true},disclosure:[{field:ref('salary'),disposition:{kind:'withheld'}}]},
      {id:'membership',effect:'require',actions:['read'],target:[ref('Resource')],condition:membership},
    ]}};
}
