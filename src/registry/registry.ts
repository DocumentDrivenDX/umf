// SPDX-License-Identifier: MIT OR Apache-2.0
import type { ValidateFunction } from 'ajv';
import { createValidator, checkPackage } from '../validation/schema';
import { copyJson } from '../model/json';
import { UmfError, type ExtensionPackage, type Diagnostic, type Document, type Json, type Scope } from '../model/types';
import type {ExtensionKindDefinition,ExtensionKindReference,ExtensionKindListResult} from '../generated/core-model';
import type {ExtensionKindRuntime,KindRegistration} from './kind-runtime';
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
    return {manifest,kinds,...(nativeValidator?{nativeValidator}:{}),...(semantics?{semantics:(payload:unknown,context:{document:unknown;path:string;scope:string})=>semantics(payload as Json,{...context,document:context.document as Document,scope:context.scope as Scope})}:{})};
  }
  #runtime():ExtensionKindRuntime {
    if(!this.kindRuntime)throw new UmfError('EXTENSION_KIND_RUNTIME_REQUIRED','Initialize the shared native/WASM engine and pass it to Registry');
    return this.kindRuntime;
  }
  listKinds():ExtensionKindListResult {return this.#runtime().listKinds(this.registrations()) as ExtensionKindListResult;}
  getKind(reference:ExtensionKindReference):ExtensionKindDefinition|undefined {return this.#runtime().getKind(reference,this.registrations()) as ExtensionKindDefinition|undefined;}
  register(input: ExtensionPackage, semantics?: SemanticValidator,options:{kinds?:boolean;nativeValidator?:string}={}): this {
    const manifest = copyJson(input) as unknown as ExtensionPackage;
    const request=copyJson(options) as {kinds?:boolean;nativeValidator?:string};
    if(!request||typeof request!=='object'||Array.isArray(request)||Object.keys(request).some(k=>!['kinds','nativeValidator'].includes(k))||request.kinds!==undefined&&typeof request.kinds!=='boolean'||request.nativeValidator!==undefined&&(typeof request.nativeValidator!=='string'||!request.nativeValidator)||request.nativeValidator&&semantics)throw new UmfError('EXTENSION_KIND_QUERY','Expected kinds and an optional explicit native validator; callbacks and native validators cannot be combined');
    if (!checkPackage(manifest)) throw new UmfError('PACKAGE_STRUCTURE', JSON.stringify(checkPackage.errors));
    if (this.get(manifest.id, manifest.version)) throw new UmfError('DUPLICATE_VERSION', 'Extension version is already registered');
    if(this.kindRuntime)this.kindRuntime.listKinds([...this.registrations(),this.#registration(manifest,semantics,request.kinds,request.nativeValidator)]);
    else if(request.kinds||request.nativeValidator)this.#runtime();
    let structure: ValidateFunction;
    // Shared-runtime admission and document validation own consumer schemas.
    // Do not impose the legacy Ajv profile on a Rust-admitted package.
    try { structure = this.kindRuntime
      ? Object.assign(()=>{throw new UmfError('EXTENSION_KIND_RUNTIME_REQUIRED','Use shared-runtime document validation for this registry');},{errors:null}) as unknown as ValidateFunction
      : createValidator().compile(manifest.schema); }
    catch (error) { throw new UmfError('PACKAGE_SCHEMA', String(error)); }
    freeze(manifest);
    const entry: Registration = {manifest, structure, kinds:request.kinds??false, ...(request.nativeValidator?{nativeValidator:request.nativeValidator}:{}),...(semantics ? {semantics} : {})};
    Object.freeze(entry);
    if (!this.#entries.has(manifest.id)) this.#entries.set(manifest.id, new Map());
    this.#entries.get(manifest.id)!.set(manifest.version, entry);
    return this;
  }
  get(id: string, version: string): Registration | undefined { return this.#entries.get(id)?.get(version); }
}
