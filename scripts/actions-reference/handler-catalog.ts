import type {SQL} from 'bun';
import type {Action} from '../../src/extensions/actions/types';
import {UmfError} from '../../src/model/types';
import {ReferenceHandlerRegistry,type ReferenceHandlerDeployment} from './handlers';
import type {ReferenceHandlerProgram} from './sandbox';
import type {ReferenceActionStore,ReferenceStoreControl} from './store';
import {encodeReferenceIdentity,encodeReferenceJson,decodeReferenceJson} from './codec';
/** Trusted operator API only. No caller request or declaration can publish a program. */
export class ReferenceHandlerCatalog extends ReferenceHandlerRegistry {
 constructor(readonly store:ReferenceActionStore){super();}
 async publish(storeName:string,program:ReferenceHandlerProgram):Promise<ReferenceHandlerDeployment>{
  const checked=new ReferenceHandlerRegistry(),deployment=checked.install(program),validated=checked.resolve({binding:{kind:'handler',profile:{id:'umf.actions.container',version:'1'},handler:{id:deployment.id,version:deployment.version}}} as Action,deployment),encoded=encodeReferenceJson({id:validated.id,version:validated.version,build:validated.build,source:validated.source}),identity=encodeReferenceIdentity(deployment);
  return this.store.transaction(storeName,async(tx,control)=>{const rows=await tx`select program from action_handler_deployment where store=${control.id} and lookup=action_identity_lookup(${identity}) and identity=${identity}`;if(rows.length){if(rows[0]!.program!==encoded)throw new UmfError('ACTION_HANDLER_PROFILE','Immutable deployment source required');}else await tx`insert into action_handler_deployment(store,identity,program) values (${control.id},${identity},${encoded})`;return deployment;});
 }
 async retireInstalled(storeName:string,input:ReferenceHandlerDeployment):Promise<void>{const identity=encodeReferenceIdentity(this.identity(input));await this.store.transaction(storeName,async(tx,control)=>{const rows=await tx`update action_handler_deployment set active=false where store=${control.id} and lookup=action_identity_lookup(${identity}) and identity=${identity} returning id`;if(rows.length!==1)throw new UmfError('ACTION_HANDLER_PROFILE','Deployment unavailable');});}
 override async qualifyInTransaction(tx:SQL,control:ReferenceStoreControl,action:Action,input:unknown):Promise<ReferenceHandlerRegistry>{
  const deployment=this.identity(input),identity=encodeReferenceIdentity(deployment),rows=await tx`select program,active from action_handler_deployment where store=${control.id} and lookup=action_identity_lookup(${identity}) and identity=${identity}`;
  if(rows.length!==1||rows[0]!.active!==true)throw new UmfError('ACTION_HANDLER_PROFILE','Deployment unavailable for fresh admission');
  const registry=new ReferenceHandlerRegistry(),installed=registry.install(decodeReferenceJson(rows[0]!.program) as unknown as ReferenceHandlerProgram);if(encodeReferenceIdentity(installed)!==identity)throw new UmfError('ACTION_HANDLER_PROFILE','Catalog identity/source mismatch');registry.resolve(action,deployment);return registry;
 }
}
