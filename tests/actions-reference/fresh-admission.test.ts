import {test,expect} from 'bun:test';
import fixture from '../../fixtures/actions/approve.json';
import type {Document} from '../../src/model/types';
import {ReferenceActionIssuer} from '../../scripts/actions-reference/authentication';
import {ReferenceActionPolicy} from '../../scripts/actions-reference/policy';
import {ReferenceActionAdmission} from '../../scripts/actions-reference/admission';
import {withReferenceStore} from './native-harness';
/** @covers US-056-AC2 */
test('native fresh admission refuses full-declaration unknowns and fences without business or terminal writes',async()=>{
 await withReferenceStore(async store=>{
  await store.create('s','tenant','epoch');const issuer=new ReferenceActionIssuer(),policy=new ReferenceActionPolicy(store,issuer),admission=new ReferenceActionAdmission(policy),source=structuredClone(fixture) as unknown as Document,action=(source.modules[0]!.extensions!['umf.actions'] as any).actions[0];action.authorization.profile={id:'umf.actions.roles',version:'1'};
  source.modules[0]!.elements.push({id:'optional',kind:'field',scalarType:'string',cardinality:'one',nullability:'required',extensions:{},futureQualifier:true});action.parameters.push({id:'optional',kind:'value',field:{module:'sales',element:'optional'},required:false});
  const target={module:'sales',action:'approve',revision:'r1'},request={protocol:'umf.actions.tx/1',target,inputs:{order:{key:{module:'sales',element:'order',key:'pk'},components:[{string:'o1'}]}}};await admission.revisions.retain('s',target,source);const credential=issuer.issue({tenant:'tenant',principal:'person',service:'service'});await policy.membership('s','person','approver',true);
  await expect(admission.prepareFresh('s',credential,request)).rejects.toThrow('Entire selected declaration');
  await expect(admission.prepareFresh('s',credential,{...request,key:'token'})).rejects.toThrow('AUTHORIZATION');
  await policy.replayDiscovery('s','sales','approve',['approver']);await expect(admission.prepareFresh('s',credential,{...request,key:'token'})).rejects.toThrow('Entire selected declaration');
  const unused=structuredClone(fixture) as unknown as Document,unusedAction=(unused.modules[0]!.extensions!['umf.actions'] as any).actions[0];unusedAction.authorization.profile={id:'umf.actions.roles',version:'1'};unused.modules[0]!.elements.push({id:'unused',kind:'field',scalarType:'string',cardinality:'one',nullability:'required',extensions:{},futureQualifier:true},{id:'unused-record',kind:'record',members:[{module:'sales',element:'unused'}],extensions:{}});unusedAction.failures.push({code:'FALSE',message:'false',retryable:false});unusedAction.preconditions.push({id:'constant',failure:{code:'FALSE',message:'false'},rule:{language:'umf.actions.rules',version:'1',expression:'{"literal":{"boolean":true}}',references:[{record:{module:'sales',element:'unused-record'}}]}});await admission.revisions.retain('s',{...target,revision:'r2'},unused);await expect(admission.prepareFresh('s',credential,{...request,target:{...target,revision:'r2'}})).rejects.toThrow('Entire selected declaration');
  await store.transaction('s',async(tx,control)=>{await tx`update action_store set invocation_fenced=true where id=${control.id}`;});await expect(admission.prepareFresh('s',credential,request)).rejects.toThrow('invocation is fenced');
  for(const table of ['action_entity','action_outcome','action_audit','action_outbox'])expect((await store.sql.unsafe('select count(*)::text as count from '+table))[0]!.count).toBe('0');
 });
},60000);
