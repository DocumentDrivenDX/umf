import {canonicalSchemaJson} from '../../model/schema-literals';
import {UmfError} from '../../model/types';
import {requireSecurityInterpretation} from './policy';
import {evaluateSecurityCollection,type SecurityFactCut,type SecurityEvaluationRequest,type SecurityCollectionResult} from './evaluate';
import type {SecurityPolicy,SecurityResolution} from './types';

/** Opaque in-process selection handle; never a native authorization credential. */
export interface SecurityReadHandle {readonly kind:'registered-security-read'}
interface Definition {policy:SecurityPolicy;resolution:SecurityResolution}

/** Trusted host registration boundary. This class does not authenticate its caller or facts. */
export class SecurityReadRegistration {
  #definitions=new WeakMap<SecurityReadHandle,Definition>();
  #pins=new Map<string,string>();
  #count=0;
  #characters=0;
  register(policy:unknown,resolution:SecurityResolution):SecurityReadHandle {
    const admitted=requireSecurityInterpretation(policy,resolution);
    const p=admitted.source as unknown as SecurityPolicy,r=admitted.resolution as unknown as SecurityResolution;
    const candidates:[string,string][]=[
      [JSON.stringify(['policy',p.id,p.revision]),canonicalSchemaJson(p)],
      [JSON.stringify(['ontology',r.ontology.documentId,r.ontology.revision]),canonicalSchemaJson(r.ontology)],
      ...r.documents.map(d=>[JSON.stringify(['document',d.document.id,d.revision]),canonicalSchemaJson(d.document)] as [string,string]),
    ];
    const pending=new Map<string,string>();
    for(const [key,value] of candidates){
      const existing=this.#pins.get(key)??pending.get(key);
      if(existing!==undefined&&existing!==value)throw new UmfError('SECURITY_REVISION_REUSE','Registered source revision has different content');
      if(existing===undefined)pending.set(key,value);
    }
    const added=[...pending].reduce((sum,[key,value])=>sum+key.length+value.length,0);
    if(this.#count>=32||this.#pins.size+pending.size>512||this.#characters+added>16000000)
      throw new UmfError('SECURITY_REGISTRATION_BOUND','Security registration bound exceeded');
    // Commit all pins together; failed registration leaves prior bindings intact.
    for(const [key,value] of pending)this.#pins.set(key,value);
    this.#characters+=added;this.#count++;
    const handle=Object.freeze({kind:'registered-security-read' as const});
    this.#definitions.set(handle,{policy:p,resolution:r});
    return handle;
  }
  evaluate(handle:SecurityReadHandle,cut:SecurityFactCut,request:SecurityEvaluationRequest):SecurityCollectionResult {
    const definition=this.#definitions.get(handle);
    if(!definition)return {status:'refused',rows:[]};
    return evaluateSecurityCollection(definition.policy,definition.resolution,cut,request);
  }
}
