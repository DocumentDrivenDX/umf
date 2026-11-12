// SPDX-License-Identifier: MIT OR Apache-2.0
import { copyJson } from '../model/json';
import { UmfError, type ExtensionPackage, type Diagnostic, type Document, type Json, type Scope } from '../model/types';
import type {ExtensionKindDefinition,ExtensionKindReference,ExtensionKindListResult} from '../generated/core-model';
import type {ExtensionKindRuntime,KindRegistration} from './kind-runtime';
import {composeOwnedSemanticValidator,semanticOwnerMatches,semanticValidatorComposition,semanticCallbackId,semanticCallbacksForIds} from './semantic-owner';

export type SemanticValidator = (payload: Json, context: {document: Document; path: string; scope: Scope}) => Diagnostic[];
export interface StructureValidator { (payload:unknown):boolean; errors?:Array<{instancePath?:string;message?:string}>|null|undefined }
export interface Registration { manifest: ExtensionPackage; structure: StructureValidator; semantics?: SemanticValidator; kinds?:boolean; nativeValidator?:string }
type RegistrationPolicy=(input:Record<string,unknown>)=>{decision:'admit'|'replace';callbacks:string[]};
function freeze(value: unknown): void {
  if (value && typeof value === 'object') { Object.freeze(value); for (const child of Object.values(value)) freeze(child); }
}

/** Registry storage and shared-runtime admission, with no host schema compiler. */
export class RegistryBase {
  #entries = new Map<string, Map<string, Registration>>();
  #registrationPolicy:RegistrationPolicy;
  constructor(readonly kindRuntime:ExtensionKindRuntime,registrationPolicy:RegistrationPolicy) {
    if(!kindRuntime||typeof registrationPolicy!=='function')throw new UmfError('EXTENSION_KIND_RUNTIME_REQUIRED','A shared runtime and Rust registry policy are required');
    this.#registrationPolicy=registrationPolicy;
  }
  registrations():KindRegistration[] {
    return [...this.#entries.values()].flatMap(versions=>[...versions.values()].map(entry=>this.#registration(entry.manifest,entry.semantics,entry.kinds,entry.nativeValidator)));
  }
  #registration(manifest:ExtensionPackage,semantics?:SemanticValidator,kinds=false,nativeValidator?:string):KindRegistration {
    return {manifest,kinds,...(nativeValidator?{nativeValidator}:{}),...(semantics?{semantics:semantics as NonNullable<KindRegistration['semantics']>}:{})};
  }
  #runtime():ExtensionKindRuntime {
    if(!this.kindRuntime)throw new UmfError('EXTENSION_KIND_RUNTIME_REQUIRED','Initialize the shared native/WASM engine and pass it to Registry');
    return this.kindRuntime;
  }
  listKinds():ExtensionKindListResult {return this.#runtime().listKinds(this.registrations()) as ExtensionKindListResult;}
  getKind(reference:ExtensionKindReference):ExtensionKindDefinition|undefined {return this.#runtime().getKind(reference,this.registrations()) as ExtensionKindDefinition|undefined;}
  register(input: ExtensionPackage, semantics?: SemanticValidator,options:{kinds?:boolean;replaceActions?:boolean;nativeValidator?:string}={}): this {
    const manifest = copyJson(input) as unknown as ExtensionPackage;
    const request=copyJson(options) as {kinds?:boolean;replaceActions?:boolean;nativeValidator?:string};
    if(!request||typeof request!=='object'||Array.isArray(request)||Object.keys(request).some(k=>k!=='kinds'&&k!=='replaceActions'&&k!=='nativeValidator')||request.kinds!==undefined&&typeof request.kinds!=='boolean'||request.replaceActions!==undefined&&typeof request.replaceActions!=='boolean')throw new UmfError('EXTENSION_KIND_QUERY','Expected only optional boolean kinds and replaceActions flags');
    if(request.nativeValidator!==undefined&&(typeof request.nativeValidator!=='string'||!request.nativeValidator||semantics))throw new UmfError('EXTENSION_KIND_QUERY','Expected an explicit native validator without a host callback');
    const existing=this.get(manifest.id,manifest.version);
    const owner={id:manifest.id,version:manifest.version};
    const existingComposition=semanticValidatorComposition(existing?.semantics);
    const suppliedComposition=semanticValidatorComposition(semantics);
    const existingOwned=semanticOwnerMatches(existingComposition,owner);
    const suppliedOwned=semanticOwnerMatches(suppliedComposition,owner);
    const callbackMap=new Map<string,SemanticValidator>();
    for(const callback of [...(existingComposition?[existingComposition.native,...existingComposition.callers]:existing?.semantics?[existing.semantics]:[]),...(suppliedComposition?[suppliedComposition.native,...suppliedComposition.callers]:semantics?[semantics]:[])])callbackMap.set(semanticCallbackId(callback),callback);
    const rustDecision=this.#registrationPolicy({
        existingManifest:existing?.manifest??null,manifest,
        existingOwner:existingOwned,suppliedOwner:suppliedOwned,
        existingNative:existingComposition?semanticCallbackId(existingComposition.native):null,
        suppliedNative:suppliedComposition?semanticCallbackId(suppliedComposition.native):null,
        existingCallers:(existingComposition?.callers??(existing?.semantics?[existing.semantics]:[])).map(semanticCallbackId),
        suppliedCallers:(suppliedComposition?.callers??(semantics?[semantics]:[])).map(semanticCallbackId),
        replaceActions:request.replaceActions===true,
      });
    if(rustDecision.decision!=='admit'&&rustDecision.decision!=='replace'||!Array.isArray(rustDecision.callbacks)||rustDecision.callbacks.some(id=>typeof id!=='string'))throw new UmfError('EXTENSION_KIND_RUNTIME_REQUIRED','Rust registry policy returned an invalid decision');
    let admittedSemantics=semantics;
    if(existing||rustDecision.decision==='replace'){
        const callbacks=semanticCallbacksForIds(rustDecision.callbacks,callbackMap);
        const expectedNative=suppliedComposition?.native??(existingOwned?existingComposition?.native:undefined);
        if(expectedNative&&callbacks.length&&rustDecision.callbacks.at(-1)===semanticCallbackId(expectedNative)){
          admittedSemantics=composeOwnedSemanticValidator(owner,callbacks.at(-1)!,callbacks.slice(0,-1));
        }else if(callbacks.length===1)admittedSemantics=callbacks[0];
        else if(callbacks.length>1)admittedSemantics=(payload,context)=>callbacks.flatMap(callback=>callback(payload,context));
        else admittedSemantics=undefined;
    }
    const mayReplaceOwned=rustDecision.decision==='replace';
    const candidate=mayReplaceOwned?this.registrations().filter(entry=>entry.manifest.id!==manifest.id||entry.manifest.version!==manifest.version):this.registrations();
    this.kindRuntime.listKinds([...candidate,this.#registration(manifest,admittedSemantics,request.kinds,request.nativeValidator)]);
    let structure:StructureValidator;
    try {
      const runtime=this.kindRuntime;
      const validate=Object.assign((payload:unknown)=>{
        if(!runtime.validatePackagePayload)throw new UmfError('EXTENSION_KIND_RUNTIME_REQUIRED','The shared engine must expose package payload validation');
        const errors=runtime.validatePackagePayload(manifest,payload);
        validate.errors=errors.length?errors:null;
        return errors.length===0;
      },{errors:null as StructureValidator['errors']});
      structure=validate;
    } catch (error) { throw new UmfError('PACKAGE_SCHEMA', String(error)); }
    freeze(manifest);
    const entry: Registration = {manifest, structure, kinds:request.kinds??false, ...(request.nativeValidator?{nativeValidator:request.nativeValidator}:{}), ...(admittedSemantics ? {semantics:admittedSemantics} : {})};
    Object.freeze(entry);
    if (!this.#entries.has(manifest.id)) this.#entries.set(manifest.id, new Map());
    this.#entries.get(manifest.id)!.set(manifest.version, entry);
    return this;
  }
  get(id: string, version: string): Registration | undefined { return this.#entries.get(id)?.get(version); }
}
