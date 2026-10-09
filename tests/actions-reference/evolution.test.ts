import {test,expect} from 'bun:test';
import fixture from '../../fixtures/actions/approve.json';
import type {Document} from '../../src/model/types';
import {reviewReferenceActionEvolution,reviewStoredReferenceActionEvolution} from '../../scripts/actions-reference/evolution';
import {ReferenceRevisionRepository,type RetainedActionRevision} from '../../scripts/actions-reference/revisions';
import {ReferenceActionIssuer} from '../../scripts/actions-reference/authentication';
import {ReferenceActionPolicy} from '../../scripts/actions-reference/policy';
import {ReferenceActionExecutor} from '../../scripts/actions-reference/executor';
import {seedReferenceEntity} from '../../scripts/actions-reference/state';
import {withReferenceStore} from './native-harness';
const action=(source:Document)=>(source.modules[0]!.extensions!['umf.actions'] as any).actions[0];
function revision(id:string,source=structuredClone(fixture) as unknown as Document):RetainedActionRevision{return {id,target:{module:'sales',action:'approve',revision:id},source,lifecycle:'active',deployment:null};}
/** @covers US-056-AC12 */
test('evolution review preserves exact signature/frame/condition/policy/profile/unknown changes without proving caller compatibility',()=>{
 const old=revision('r1'),next=revision('r2');expect(reviewReferenceActionEvolution(old,next)).toMatchObject({requiresReview:true,callerCompatibility:'unproven',automaticAdoption:false,differences:[]});const variants:[string,(source:Document)=>void][]=[
  ['signature',source=>action(source).parameters.push({id:'note',kind:'value',field:{module:'sales',element:'status'},required:true})],
  ['reads',source=>action(source).reads.push({...structuredClone(action(source).writes[0]),id:'read'})],
  ['writes',source=>action(source).writes[0].fields.push({module:'sales',element:'id'})],
  ['preconditions',source=>action(source).preconditions.push({id:'new-condition',rule:{language:'umf.actions.rules',version:'1',expression:'{"literal":{"boolean":false}}',references:[]},failure:{code:'NEW',message:'new'}})],
  ['postconditions',source=>action(source).postconditions=[]],
  ['authorization',source=>action(source).authorization.roles=['new-role']],
  ['result-obligations',source=>action(source).result.future={obligation:true}],
  ['display',source=>action(source).description='New display text'],
  ['unknown-declaration',source=>action(source).future={meaning:{mustPreserve:true}}],
  ['model-and-profiles',source=>{source.modules[0]!.elements[1]!.description='Changed model context';}]
 ];
 // Give the old snapshot a postcondition, then remove it in every variant. No
 // implication/substitution result is inferred from the old and new expressions.
 action(old.source).postconditions=[{id:'old-condition',rule:{language:'umf.actions.rules',version:'1',expression:'{"literal":{"boolean":true}}',references:[]},failure:{code:'OLD',message:'old'}}];action(old.source).failures=[{code:'OLD',message:'old',retryable:false}];
 for(const [area,change] of variants){const candidate=revision('r2',structuredClone(old.source));change(candidate.source);if(area==='preconditions')action(candidate.source).failures.push({code:'NEW',message:'new',retryable:false});const before=structuredClone(candidate),report=reviewReferenceActionEvolution(old,candidate);expect(report.callerCompatibility).toBe('unproven');expect(report.automaticAdoption).toBe(false);expect(report.differences.some(difference=>difference.area===area)).toBe(true);expect(candidate).toEqual(before);if(area==='unknown-declaration'){const difference=report.differences.find(value=>value.member==='future')!;expect(difference.next).toEqual({present:true,value:{meaning:{mustPreserve:true}}});}}
 const ordered=revision('r1');const otherAction=structuredClone(action(ordered.source));otherAction.id='other';otherAction.name='Other';(ordered.source.modules[0]!.extensions!['umf.actions'] as any).actions.push(otherAction);const reordered=structuredClone(ordered);(reordered.source.modules[0]!.extensions!['umf.actions'] as any).actions.reverse();expect(reviewReferenceActionEvolution(ordered,reordered)).toMatchObject({requiresReview:true});expect(reviewReferenceActionEvolution(ordered,reordered).differences.map(value=>value.area)).toContain('model-and-profiles');
 const changedDeployment=revision('r2',structuredClone(old.source));changedDeployment.deployment={id:'handler',version:'2',build:'opaque'};expect(reviewReferenceActionEvolution(old,changedDeployment).differences.map(value=>value.area)).toContain('deployment');const other=revision('r2');other.target.action='other';expect(()=>reviewReferenceActionEvolution(old,other)).toThrow('Same action family');
});
/** @covers US-056-AC6 @covers US-056-AC12 */
test('native immutable revision comparison flags strengthened conditions and leaves original replay and explicit fresh selection independent',async()=>{
 await withReferenceStore(async store=>{await store.create('s','tenant','epoch');const issuer=new ReferenceActionIssuer(),policy=new ReferenceActionPolicy(store,issuer),executor=new ReferenceActionExecutor(policy),repo=new ReferenceRevisionRepository(store),source=structuredClone(fixture) as unknown as Document,target={module:'sales',action:'approve',revision:'r1'},credential=issuer.issue({tenant:'tenant',principal:'human',service:'review'});action(source).authorization.profile={id:'umf.actions.roles',version:'1'};await repo.retain('s',target,source);await policy.membership('s','human','approver',true);await policy.replayDiscovery('s','sales','approve',['approver']);await store.transaction('s',(tx,control)=>seedReferenceEntity(tx,control,source,{module:'sales',element:'order'},{'["sales","id"]':{string:'one'},'["sales","status"]':{string:'pending'}},'initial'));const request={protocol:'umf.actions.tx/1',target,key:'A',inputs:{order:{key:{module:'sales',element:'order',key:'pk'},components:[{string:'one'}]}}},original=await executor.invoke('s',credential,request);expect(original.status).toBe('committed');const next=structuredClone(source),replacement={...target,revision:'r2'};action(next).failures=[{code:'REVIEWED',message:'new condition',retryable:false}];action(next).preconditions=[{id:'new-condition',rule:{language:'umf.actions.rules',version:'1',expression:'{"literal":{"boolean":false}}',references:[]},failure:{code:'REVIEWED',message:'new condition'}}];await repo.retain('s',replacement,next);
  const before=await store.sql`select identity,source,lifecycle,deployment from action_revision order by id`;const review=await reviewStoredReferenceActionEvolution(repo,'s',target,replacement);expect(review).toMatchObject({requiresReview:true,callerCompatibility:'unproven',automaticAdoption:false});expect(review.differences.map(value=>value.area)).toContain('preconditions');expect(await store.sql`select identity,source,lifecycle,deployment from action_revision order by id`).toEqual(before);expect(await executor.invoke('s',credential,request)).toEqual(original);await repo.lifecycle('s',target,'retired');expect(await executor.invoke('s',credential,request)).toEqual(original);expect(await executor.invoke('s',credential,{...request,key:'fresh-old'})).toEqual({status:'unsupported',code:'REVISION'});expect(await executor.invoke('s',credential,{...request,target:replacement,key:'fresh-next'})).toEqual({status:'rejected',code:'REVIEWED'});expect((await store.sql`select count(*)::int as count from action_outcome`)[0]!.count).toBe(2);expect((await store.sql`select count(*)::int as count from action_outbox`)[0]!.count).toBe(1);expect((await store.sql`select business_sequence::text from action_store`)[0]!.business_sequence).toBe('1');
 });
},30000);
