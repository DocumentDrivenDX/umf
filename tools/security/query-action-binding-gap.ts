/** Diagnostic source replay; intentionally does not admit a backend/profile.
 * @covers US-079-AC8
 * @covers US-056-AC6
 */
import {evaluationFixture} from '../../tests/security/evaluation-fixture';
import {ref} from '../../tests/security/fixture';
import {evaluateSecurityAccess} from '../../src/extensions/security/evaluate';
const observations=[];
for(const operator of ['predicate','order','group','join','aggregate'] as const){
 const f=evaluationFixture(),salary=f.resolution.ontology.entities[2]!.fields.find(x=>x.ref.elementId==='salary')!;
 salary.queryUse={[operator]:'original-authorized'};
 f.resolution.ontology.actions.push('query-original','unrelated-export');
 f.policy.rules.push({id:'export',effect:'permit',actions:['unrelated-export'],target:[ref('Resource')],condition:{op:'literal',value:true}});
 const before=JSON.stringify(f);
 for(const [selectedAction,expected] of [['query-original','indeterminate'],['unrelated-export','permit'],['read','indeterminate']] as const){
  const request={action:'read',output:[],queryUses:[{field:ref('salary'),operator,originalAction:selectedAction}]};
  const observed=evaluateSecurityAccess(f.policy,f.resolution,f.cut,request,f.resource).decision;
  if(observed!==expected)throw new Error('Diagnostic source behavior changed');
  observations.push({operator,selectedAction,expected,observed});
 }
 if(JSON.stringify(f)!==before)throw new Error('Evaluation mutated fixture');
}
console.log(JSON.stringify({status:'unprofiled-action-substitution-reproduced',observations,
 scope:'No designated action can be represented by the current field classification. query-original is an external intended designation, not a stored binding. The current evaluator permits any separately granted action supplied by the request. This is an unprofiled evaluator/host-binding prerequisite, not native bypass evidence or accepted B08.'},null,2));
