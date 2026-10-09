import {strict as assert} from 'node:assert';
import fixture from '../../fixtures/actions/approve.json';
import {actionFieldValueKey} from '../../src/index';
import type {Document,Action} from '../../src/index';
import {ReferenceActionIssuer} from '../actions-reference/authentication';
import {ReferenceActionPolicy} from '../actions-reference/policy';
import {ReferenceActionExecutor} from '../actions-reference/executor';
import {seedReferenceEntity} from '../actions-reference/state';
import {decodeReferenceJson} from '../actions-reference/codec';
import {ReferenceActionProjection} from '../actions-reference/projection';
import {withReferenceStore} from '../../tests/actions-reference/native-harness';

const equal=(actual:unknown,expected:unknown)=>assert.deepEqual(JSON.parse(JSON.stringify(actual)),JSON.parse(JSON.stringify(expected)));
await withReferenceStore(async(store,version,container)=>{
 await store.create('tutorial-store','tutorial-tenant','tutorial-epoch');
 const source=structuredClone(fixture) as unknown as Document;
 const action=(source.modules[0]!.extensions!['umf.actions'] as {actions:Action[]}).actions[0]!;
 action.authorization={kind:'roles',profile:{id:'umf.actions.roles',version:'1'},roles:['approver']};
 const issuer=new ReferenceActionIssuer(),policy=new ReferenceActionPolicy(store,issuer),executor=new ReferenceActionExecutor(policy);
 const target={module:'sales',action:'approve',revision:'tutorial-r1'};
 const credential=issuer.issue({tenant:'tutorial-tenant',principal:'tutorial-person',service:'tutorial-client'});
 await executor.admission.revisions.retain('tutorial-store',target,source);
 await policy.membership('tutorial-store','tutorial-person','approver',true);
 await policy.replayDiscovery('tutorial-store','sales','approve',['approver']);
 const fields={[actionFieldValueKey({module:'sales',element:'id'})]:{string:'order-1'},[actionFieldValueKey({module:'sales',element:'status'})]:{string:'pending'}};
 await store.transaction('tutorial-store',(tx,control)=>seedReferenceEntity(tx,control,source,{module:'sales',element:'order'},fields,'initial'));
 await store.transaction('tutorial-store',(tx,control)=>seedReferenceEntity(tx,control,source,{module:'sales',element:'order'},{...fields,[actionFieldValueKey({module:'sales',element:'id'})]:{string:'order-2'}},'initial'));
 const projection=new ReferenceActionProjection(policy);await projection.register('tutorial-store','orders',['order-reader']);await policy.membership('tutorial-store','tutorial-person','order-reader',true);
 const request={protocol:'umf.actions.tx/1',target,key:'original-approval',inputs:{order:{key:{module:'sales',element:'order',key:'pk'},components:[{string:'order-1'}]}}};
 const committed=await executor.invoke('tutorial-store',credential,request);
 assert.equal(committed.status,'committed');if(committed.status!=='committed')throw Error('Approval failed');
 assert.equal(committed.noOp,false);
 equal(await executor.invoke('tutorial-store',credential,request),committed);
 equal(await executor.outcomes.lookup('tutorial-store',credential,request),committed);
 const noOp=await executor.invoke('tutorial-store',credential,{...request,key:'fresh-approval'});
 assert.equal(noOp.status,'committed');if(noOp.status!=='committed')throw Error('No-op failed');
 assert.equal(noOp.noOp,true);assert.equal(noOp.version,committed.version);
 const rows=await store.sql`select fields from action_entity order by id`;
 equal(decodeReferenceJson(rows[0]!.fields),{...fields,[actionFieldValueKey({module:'sales',element:'status'})]:{string:'approved'}});
 assert.equal((await store.sql`select * from action_outcome`).length,2);
 assert.equal((await store.sql`select * from action_outbox`).length,1);
 // A second real commit makes reordered delivery observable, rather than simulating a queue.
 const second=await executor.invoke('tutorial-store',credential,{...request,key:'second-order',inputs:{order:{...request.inputs.order,components:[{string:'order-2'}]}}});
 assert.equal(second.status,'committed');if(second.status!=='committed')throw Error('Second approval failed');
 equal(await projection.deliver('tutorial-store','orders',{epoch:'tutorial-epoch',sequence:'2'}),{status:'delivered',prefix:'0'});
 assert.equal((await projection.readAtLeast('tutorial-store',credential,{projection:'orders',receipt:second.receipt})).status,'pending');
 equal(await projection.deliver('tutorial-store','orders',{epoch:'tutorial-epoch',sequence:'1'}),{status:'delivered',prefix:'2'});
 const visible=await projection.readAtLeast('tutorial-store',credential,{projection:'orders',receipt:second.receipt});assert.equal(visible.status,'visible');
 if(visible.status!=='visible')throw Error('Projection did not become visible');
 const native=await store.sql`select fields from action_entity order by id`;equal(visible.content.entities.map(entity=>entity.fields),native.map((row:{fields:string})=>decodeReferenceJson(row.fields)));
 // A tentative SET to pending fails its false postcondition before SQL persistence.
 const broken=structuredClone(source),brokenAction=(broken.modules[0]!.extensions!['umf.actions'] as unknown as {actions:Action[]}).actions[0]!;
 brokenAction.binding={kind:'recipe',profile:{id:'graph-write',version:'1'},effects:[{id:'rollback-status',kind:'set',entity:{parameter:'order'},values:[{field:{module:'sales',element:'status'},value:{literal:{string:'pending'}}}]}]};
 const failure={code:'DEMO_REFUSAL',message:'Demonstration refusal'};brokenAction.failures=[{...failure,retryable:false}];
 const condition={id:'false-demo',failure,rule:{language:'umf.actions.rules',version:'1',expression:JSON.stringify({literal:{boolean:false}}),references:[]}};
 brokenAction.postconditions=[condition];const rollbackTarget={...target,revision:'tutorial-rollback'};await executor.admission.revisions.retain('tutorial-store',rollbackTarget,broken);
 equal(await executor.invoke('tutorial-store',credential,{...request,target:rollbackTarget,key:'rollback-demo'}),{status:'failed',code:'POSTCONDITION'});
 equal(await store.sql`select fields from action_entity order by id`,native);assert.equal((await store.sql`select * from action_outcome`).length,3);assert.equal((await store.sql`select * from action_outbox`).length,2);
 // Force a SQL failure after business writes: PostgreSQL must roll back the whole transaction.
 brokenAction.postconditions=[];brokenAction.preconditions=[];
 const databaseRollbackTarget={...target,revision:'tutorial-database-rollback'};
 await executor.admission.revisions.retain('tutorial-store',databaseRollbackTarget,broken);
 const receiptsBefore=await store.sql`select * from action_receipt order by sequence`;
 const sequenceBefore=await store.sql`select business_sequence::text from action_store`;
 await store.sql.unsafe('alter table action_audit add constraint demo_audit_fail check(false) not valid').simple();
 try{await assert.rejects(executor.invoke('tutorial-store',credential,{...request,target:databaseRollbackTarget,key:'database-rollback-demo'}),/demo_audit_fail/);}
 finally{await store.sql.unsafe('alter table action_audit drop constraint demo_audit_fail').simple();}
 equal(await store.sql`select fields from action_entity order by id`,native);
 equal(await store.sql`select * from action_receipt order by sequence`,receiptsBefore);
 equal(await store.sql`select business_sequence::text from action_store`,sequenceBefore);
 assert.equal((await store.sql`select * from action_outcome`).length,3);assert.equal((await store.sql`select * from action_outbox`).length,2);
 // A false precondition is instead a durable rejection, replayable under its original token.
 brokenAction.postconditions=[];brokenAction.preconditions=[condition];const rejectedTarget={...target,revision:'tutorial-rejection'};await executor.admission.revisions.retain('tutorial-store',rejectedTarget,broken);
 const rejectedRequest={...request,target:rejectedTarget,key:'rejection-demo'};equal(await executor.invoke('tutorial-store',credential,rejectedRequest),{status:'rejected',code:'DEMO_REFUSAL'});equal(await executor.invoke('tutorial-store',credential,rejectedRequest),{status:'rejected',code:'DEMO_REFUSAL'});
 equal(await store.sql`select fields from action_entity order by id`,native);assert.equal((await store.sql`select * from action_outcome`).length,4);assert.equal((await store.sql`select * from action_outbox`).length,2);
 await policy.membership('tutorial-store','tutorial-person','approver',false);
 equal(await executor.invoke('tutorial-store',credential,request),{status:'denied',code:'AUTHORIZATION'});
 console.log(JSON.stringify({postgres:version,bun:Bun.version,ownedContainer:container,committed:true,replayMatches:true,freshNoOp:true,terminalOutcomes:4,outboxFacts:2,postconditionCandidateDiscarded:true,databaseFailureRolledBack:true,rollbackPreservedNativeState:true,durableRejectionReplayed:true,reorderedDeliveryPendingUntilGapClosed:true,visibleProjectionMatchesNativeRows:true,revokedReplayDenied:true,cleanup:'finally: close store and remove owned container'}));
});
