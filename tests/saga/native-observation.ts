// SPDX-License-Identifier: MIT OR Apache-2.0
/** Query the reference provider and action store independently of saga history. */
import {decodeReferenceJson,encodeReferenceIdentity} from '../../scripts/actions-reference/codec';
import type {ReferenceActionStore} from '../../scripts/actions-reference/store';
import type {SagaProviderGateway} from '../../scripts/saga-reference/provider';
import type {ProviderObservation} from './history-oracle';

export interface NativeObservationProvider {
  store: ReferenceActionStore;
  storeName: string;
  gateway: SagaProviderGateway;
}

export async function observeNativeProvider(
  provider: NativeObservationProvider,
  ticket: string,
  entityKey: string,
): Promise<ProviderObservation> {
  const [tickets,attempts] = await Promise.all([
    provider.gateway.sql`select tenant,subject,store_name,epoch,intent,state,final_disposition from saga_provider_ticket where ticket=${ticket}`,
    provider.gateway.sql`select state from saga_provider_attempt where ticket=${ticket} order by attempt`,
  ]);
  const retained = tickets[0];
  if (!retained) return {ticket,status:'missing',gatewayClosed:false,attemptsTerminal:false,outcomeCount:0,entityKey,source:'native-provider-ticket'};

  const intent = decodeReferenceJson(retained.intent) as any;
  const subject = decodeReferenceJson(retained.subject) as any;
  const identity = encodeReferenceIdentity([retained.tenant,retained.store_name,subject.principal,intent.target.module,intent.target.action,intent.key]);
  const [outcomes,entities] = await Promise.all([
    provider.store.transaction(provider.storeName,async(tx,control)=>tx`select identity,original_intent,result from action_outcome where store=${control.id}`),
    provider.store.transaction(provider.storeName,async(tx,control)=>tx`select fields from action_entity where store=${control.id}`),
  ]);
  const entity = entities.map((row:any)=>decodeReferenceJson(row.fields) as any).find((fields:any)=>fields['["sales","id"]']?.string===entityKey);
  const attemptsTerminal = attempts.length>0 ? attempts.every((row:any)=>row.state!=='admitted') : retained.state==='closed';
  const disposition = retained.final_disposition ? decodeReferenceJson(retained.final_disposition) as any : undefined;
  const ticketOutcomes = outcomes.filter((row:any)=>String(row.identity)===identity||(decodeReferenceJson(row.original_intent) as any)?.correlation===ticket);
  const nativeOriginal = ticketOutcomes.length===1 ? decodeReferenceJson(ticketOutcomes[0]!.original_intent) as any : undefined;
  const original = nativeOriginal ?? intent;
  const custodyMismatch = ticketOutcomes.length>0 && (!nativeOriginal || nativeOriginal.correlation!==ticket || String(ticketOutcomes[0]!.identity)!==identity || encodeReferenceIdentity([
    nativeOriginal.correlation,nativeOriginal.key,nativeOriginal.target?.module,nativeOriginal.target?.action,nativeOriginal.target?.revision,
  ]) !== encodeReferenceIdentity([
    intent.correlation,intent.key,intent.target?.module,intent.target?.action,intent.target?.revision,
  ])) ? 'gateway ticket intent differs from native original action intent' : undefined;
  const shared:ProviderObservation = {
    ticket,
    status:ticketOutcomes.length===1?(decodeReferenceJson(ticketOutcomes[0]!.result) as any).status:ticketOutcomes.length===0?(disposition?.status??(retained.state==='open'?'pending':'missing')):'duplicate',
    provider:provider.gateway.issuerId,
    tenant:String(retained.tenant),
    storeEpoch:String(retained.epoch),
    actionRevision:original.target?.revision,
    originalTicket:original.correlation,
    key:original.key,
    gatewayClosed:retained.state==='closed',
    attemptsTerminal,
    attemptCount:attempts.length,
    outcomeCount:ticketOutcomes.length,
    entityKey:entity?.['["sales","id"]']?.string??'missing',
    entityStatus:entity?.['["sales","status"]']?.string??'missing',
    ...(disposition===undefined?{}:{finalDisposition:disposition}),
    ...(custodyMismatch===undefined?{}:{custodyMismatch}),
    source:ticketOutcomes.length?'native-action-outcome':'native-provider-ticket',
  };
  return shared;
}
