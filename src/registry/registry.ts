// SPDX-License-Identifier: MIT OR Apache-2.0
import type { ValidateFunction } from 'ajv';
import { createValidator, checkPackage } from '../validation/schema';
import { copyJson } from '../model/json';
import {canonicalSchemaJson} from '../model/schema-literals';
import { UmfError, type ExtensionPackage, type Diagnostic, type Document, type Json, type Scope } from '../model/types';
import type {ExtensionKindDefinition,ExtensionKindReference,ExtensionKindListResult} from '../generated/core-model';
import type {ExtensionKindRuntime,KindRegistration} from './kind-runtime';
import {composeOwnedSemanticValidator,semanticOwnerMatches,semanticValidatorComposition} from './semantic-owner';
export type SemanticValidator = (payload: Json, context: {document: Document; path: string; scope: Scope}) => Diagnostic[];
export interface Registration { manifest: ExtensionPackage; structure: ValidateFunction; semantics?: SemanticValidator; kinds?:boolean; nativeValidator?:string }
function freeze(value: unknown): void {
  if (value && typeof value === 'object') { Object.freeze(value); for (const child of Object.values(value)) freeze(child); }
}
export class Registry {
  #entries = new Map<string, Map<string, Registration>>();
  constructor(readonly kindRuntime?:ExtensionKindRuntime) {}
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
    if (!this.kindRuntime && !checkPackage(manifest)) throw new UmfError('PACKAGE_STRUCTURE', JSON.stringify(checkPackage.errors));
    const existing=this.get(manifest.id,manifest.version);
    let admittedSemantics=semantics;
    const owner={id:manifest.id,version:manifest.version};
    const existingComposition=semanticValidatorComposition(existing?.semantics);
    const suppliedComposition=semanticValidatorComposition(semantics);
    const sameManifest=!!existing&&canonicalSchemaJson(existing.manifest)===canonicalSchemaJson(manifest);
    const existingOwned=semanticOwnerMatches(existingComposition,owner);
    const suppliedOwned=semanticOwnerMatches(suppliedComposition,owner);
    // A caller may add checks or repeat registration without replacing the
    // retained native owner. Undefined semantics keeps the existing callbacks.
    const retainedCallerReplacement=sameManifest&&existingOwned&&!suppliedComposition;
    if(retainedCallerReplacement){
      if(!existingComposition)throw new UmfError('DUPLICATE_VERSION','Native semantic owner is unavailable');
      admittedSemantics=composeOwnedSemanticValidator(owner,existingComposition.native,[...existingComposition.callers,...(semantics?[semantics]:[])]);
    }
    const replacingNativeOwner=!!this.kindRuntime&&suppliedOwned&&
      (!existing||(sameManifest&&(!existingComposition||existingOwned)))&&
      (request.replaceActions===true||existingOwned);
    if(replacingNativeOwner){
      if(!suppliedComposition)throw new UmfError('DUPLICATE_VERSION','Native semantic owner is unavailable');
      const retained=existingOwned&&existingComposition?existingComposition.callers:existing?.semantics?[existing.semantics]:[];
      admittedSemantics=composeOwnedSemanticValidator(owner,suppliedComposition.native,[...retained,...suppliedComposition.callers]);
    }
    const replacingOwnedRegistration=replacingNativeOwner||(request.replaceActions===true&&!!this.kindRuntime&&retainedCallerReplacement);
    if(request.replaceActions&&!replacingOwnedRegistration)throw new UmfError('DUPLICATE_VERSION','Only the native semantic owner may replace its unchanged package registration');
    const mayReplaceOwned=retainedCallerReplacement||replacingOwnedRegistration;
    if (existing&&!mayReplaceOwned) throw new UmfError('DUPLICATE_VERSION', 'Extension version is already registered');
    if(this.kindRuntime){
      const candidate=mayReplaceOwned?this.registrations().filter(entry=>entry.manifest.id!==manifest.id||entry.manifest.version!==manifest.version):this.registrations();
      this.kindRuntime.listKinds([...candidate,this.#registration(manifest,admittedSemantics,request.kinds,request.nativeValidator)]);
    }
    else if(request.kinds||request.nativeValidator)this.#runtime();
    let structure: ValidateFunction;
    // Shared-runtime admission and document validation own consumer schemas.
    // Do not impose the legacy Ajv profile on a Rust-admitted package.
    try {
      if(this.kindRuntime){
        const runtime=this.kindRuntime;
        const validate=Object.assign((payload:unknown)=>{
          if(!runtime.validatePackagePayload)throw new UmfError('EXTENSION_KIND_RUNTIME_REQUIRED','The shared engine must expose package payload validation');
          const errors=runtime.validatePackagePayload(manifest,payload);
          validate.errors=errors.length?errors:null;
          return errors.length===0;
        },{errors:null as ValidateFunction['errors']});
        structure=validate as ValidateFunction;
      }else structure=createValidator().compile(manifest.schema);
    }
    catch (error) { throw new UmfError('PACKAGE_SCHEMA', String(error)); }
    freeze(manifest);
    const entry: Registration = {manifest, structure, kinds:request.kinds??false, ...(request.nativeValidator?{nativeValidator:request.nativeValidator}:{}), ...(admittedSemantics ? {semantics:admittedSemantics} : {})};
    Object.freeze(entry);
    if (!this.#entries.has(manifest.id)) this.#entries.set(manifest.id, new Map());
    this.#entries.get(manifest.id)!.set(manifest.version, entry);
    return this;
  }
  get(id: string, version: string): Registration | undefined { return this.#entries.get(id)?.get(version); }
}
