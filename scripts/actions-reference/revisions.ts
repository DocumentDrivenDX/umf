import {copyJson} from '../../src/model/json';
import type {Document} from '../../src/model/types';
import {inspectActions,registerActions} from '../../src/extensions/actions';
import {Registry} from '../../src/registry/registry';
import {admitReferenceRequest,type RevisionReference} from './protocol';
import {encodeReferenceIdentity,encodeReferenceJson,decodeReferenceJson} from './codec';
import {ReferenceActionStore,type ReferenceStoreControl} from './store';
import type {SQL} from 'bun';
export interface RetainedActionRevision {id:string;target:RevisionReference;source:Document;lifecycle:'active'|'retired'|'unavailable';deployment:unknown}
/** Retention is independent of current executability: unknown obligations remain retained. */
export class ReferenceRevisionRepository {
 constructor(readonly store:ReferenceActionStore){}
 async retain(storeName:string,target:RevisionReference,sourceInput:Document,deployment:unknown=null):Promise<string>{
  target=admitReferenceRequest({protocol:'umf.actions.tx/1',target,inputs:{}},'preview').target;
  const source=copyJson(sourceInput) as unknown as Document;
  const inspection=inspectActions(source,registerActions(new Registry()));
  if(!inspection.validation.valid||!inspection.actions.some(a=>a.module===target.module&&a.action.id===target.action))throw Error('Invalid retained action revision');
  const identity=encodeReferenceIdentity(target),payload=encodeReferenceJson(source),binding=encodeReferenceJson(deployment);
  return this.store.transaction(storeName,async(tx,control)=>{const rows=await tx`insert into action_revision(store,identity,lifecycle,source,deployment) values (${control.id},${identity},'active',${payload},${binding}) returning id::text`;return rows[0]!.id;});
 }
 async lifecycle(storeName:string,target:RevisionReference,lifecycle:RetainedActionRevision['lifecycle']):Promise<void>{
  target=admitReferenceRequest({protocol:'umf.actions.tx/1',target,inputs:{}},'preview').target;
  if(!['active','retired','unavailable'].includes(lifecycle))throw Error('Invalid revision lifecycle');const identity=encodeReferenceIdentity(target);
  await this.store.transaction(storeName,async(tx,control)=>{const rows=await tx`update action_revision set lifecycle=${lifecycle} where store=${control.id} and lookup=action_identity_lookup(${identity}) and identity=${identity} returning id`;if(rows.length!==1)throw Error('Retained revision does not resolve');});
 }
 async readInTransaction(tx:SQL,control:ReferenceStoreControl,target:RevisionReference):Promise<RetainedActionRevision>{return readReferenceRevision(tx,control,target);}
 async read(storeName:string,target:RevisionReference):Promise<RetainedActionRevision>{
  target=admitReferenceRequest({protocol:'umf.actions.tx/1',target,inputs:{}},'preview').target;
  return this.store.transaction(storeName,(tx,control)=>this.readInTransaction(tx,control,target));
 }
}

export async function readReferenceRevision(tx:SQL,control:ReferenceStoreControl,target:RevisionReference):Promise<RetainedActionRevision>{
  target=admitReferenceRequest({protocol:'umf.actions.tx/1',target,inputs:{}},'preview').target;const identity=encodeReferenceIdentity(target);
  const rows=await tx`select id::text,lifecycle,source,deployment from action_revision where store=${control.id} and lookup=action_identity_lookup(${identity}) and identity=${identity}`;
  if(rows.length!==1)throw Error('Retained revision does not resolve');const row=rows[0]!;
  return {id:row.id,target:decodeReferenceJson(identity) as unknown as RevisionReference,lifecycle:row.lifecycle,source:decodeReferenceJson(row.source) as unknown as Document,deployment:row.deployment===null?null:decodeReferenceJson(row.deployment)};
}
