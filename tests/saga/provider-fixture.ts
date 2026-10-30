// SPDX-License-Identifier: MIT OR Apache-2.0
import fixture from '../../fixtures/actions/approve.json';
import type {Document} from '../../src/model/types';
import {ReferenceActionIssuer} from '../../scripts/actions-reference/authentication';
import {ReferenceActionPolicy} from '../../scripts/actions-reference/policy';
import {ReferenceActionExecutor} from '../../scripts/actions-reference/executor';
import {seedReferenceEntity} from '../../scripts/actions-reference/state';
import {SagaProviderGateway,type SagaProviderFaults} from '../../scripts/saga-reference/provider';
import type {ReferenceActionStore} from '../../scripts/actions-reference/store';
import type {ReferenceInvokeRequest,RevisionReference} from '../../scripts/actions-reference/protocol';
import type {SagaRuntimeDefinition} from '../../scripts/saga-reference/protocol';

export const actionNames=['reserve','allocate','release'] as const;
export function sagaActionDocument():Document{
 const source=structuredClone(fixture) as unknown as Document,extension=source.modules[0]!.extensions!['umf.actions'] as any,base=extension.actions[0];
 extension.actions=actionNames.map(name=>{const action=structuredClone(base);action.id=name;action.name=name;action.authorization={kind:'roles',profile:{id:'umf.actions.roles',version:'1'},roles:[name==='release'?'compensator':'forward']};action.binding.effects[0].values[0].value.literal.string=name;return action;});return source;
}
export function sagaRuntimePlan(a:Awaited<ReturnType<typeof installSagaProvider>>,b:Awaited<ReturnType<typeof installSagaProvider>>):SagaRuntimeDefinition{
 const document=sagaActionDocument() as any;document.vocabularies['umf.actions.saga']={version:'0.1.0'};
 const input=(parameter:string)=>({parameter,from:{input:'order'}}),step=(id:string,action:string,binding:string)=>({id,action:{module:'sales',action},binding,inputs:[input('order')],compensation:{kind:'action',action:{module:'sales',action:'release'},binding,inputs:[input('order')]}});
 const definition={id:'reserve-allocate',name:'Reserve then allocate',description:'Native conformance saga fixture.',profile:{id:'umf.actions.saga.sequential',version:'1'},parameters:[{id:'order',kind:'entity',target:{module:'sales',element:'order',key:'pk'},required:true}],outputs:[],outputBindings:[],steps:[step('reserve','reserve','inventory'),step('allocate','allocate','allocation')]};
 document.modules[0]!.extensions!['umf.actions.saga']={sagas:[definition]};
 const binding=(provider:Awaited<ReturnType<typeof installSagaProvider>>,providerId:string)=>({provider:providerId,issuerId:provider.gateway.issuerId,storeName:provider.storeName,gateway:provider.gateway,credential:provider.credential,actionRevisions:Object.fromEntries(actionNames.map(action=>[action,'saga-r1']))});
 return {id:definition.id,module:'sales',revision:'saga-r1',document,definition,bindings:{inventory:binding(a,'provider-a'),allocation:binding(b,'provider-b')}} as SagaRuntimeDefinition;
}
export async function installSagaProvider(store:ReferenceActionStore,providerName:string,issuer=new ReferenceActionIssuer(),faults:SagaProviderFaults={}){
 const storeName='saga-'+providerName,tenant='tenant-a',source=sagaActionDocument();await store.create(storeName,tenant,'epoch-'+providerName);
 const policy=new ReferenceActionPolicy(store,issuer),executor=new ReferenceActionExecutor(policy),gateway=new SagaProviderGateway(store,storeName,executor,faults,providerName==='inventory'?'provider-a':providerName==='allocation'?'provider-b':storeName);await gateway.initialize();
 for(const name of actionNames){const target:RevisionReference={module:'sales',action:name,revision:'saga-r1'};await executor.admission.revisions.retain(storeName,target,source);await policy.replayDiscovery(storeName,'sales',name,['reader']);}
 await policy.membership(storeName,'worker','forward',true);await policy.membership(storeName,'worker','compensator',true);await policy.membership(storeName,'worker','reader',true);
 const seed=async(action:string,key:string)=>store.transaction(storeName,(tx,control)=>seedReferenceEntity(tx,control,source,{module:'sales',element:'order'},{'["sales","id"]':{string:key},'["sales","status"]':{string:'pending'}},'v0'));
 const request=(action:'reserve'|'allocate'|'release',key:string):ReferenceInvokeRequest=>({protocol:'umf.actions.tx/1',target:{module:'sales',action,revision:'saga-r1'},key:`${providerName}:${action}:${key}`,inputs:{order:{key:{module:'sales',element:'order',key:'pk'},components:[{string:key}]}}});
 return {storeName,source,policy,executor,gateway,issuer,credential:issuer.issue({tenant,principal:'worker',service:'saga-test-worker'}),seed,request,store};
}
