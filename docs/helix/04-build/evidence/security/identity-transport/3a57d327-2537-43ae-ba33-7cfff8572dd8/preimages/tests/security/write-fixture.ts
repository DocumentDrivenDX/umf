import {evaluationFixture} from './evaluation-fixture';
import {ref} from './fixture';
import {copyJson} from '../../src/model/json';
import type {SecurityWriteProfile,SecurityWriteState} from '../../src/extensions/security/write';
export function writeFixture(){
  const f=evaluationFixture();
  f.resolution.ontology.actions.push('create','delete','write-fields','change-owner','change-policy');
  const actions=['create','update','delete','write-fields','change-owner','change-policy'];
  f.policy.rules.push({id:'writer',effect:'permit',actions,target:[ref('Resource')],condition:{op:'literal',value:true}},
    {...f.policy.rules[1]!,id:'write-membership',actions});
  const profile:SecurityWriteProfile={type:ref('Resource'),createAction:'create',updateAction:'update',deleteAction:'delete',
    fieldActions:[{field:ref('resourceId'),action:'write-fields'},{field:ref('salary'),action:'write-fields'}],policyAction:'change-policy',policyFields:[ref('resourceId')],ownershipAction:'change-owner',ownershipFields:[],ownershipAssociations:[ref('Ownership')]};
  const original:SecurityWriteState={resource:f.resource,cut:f.cut};
  const proposed=copyJson(original) as unknown as SecurityWriteState;
  proposed.resource.fields.find(x=>x.field.elementId==='salary')!.value={integerToken:'200'};
  return {...f,profile,original,proposed};
}
