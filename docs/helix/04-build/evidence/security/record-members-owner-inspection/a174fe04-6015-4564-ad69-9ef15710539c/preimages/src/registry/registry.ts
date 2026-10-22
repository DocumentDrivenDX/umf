import type { ValidateFunction } from 'ajv';
import { createValidator, checkPackage } from '../validation/schema';
import { copyJson } from '../model/json';
import { UmfError, type ExtensionPackage, type Diagnostic, type Document, type Json, type Scope } from '../model/types';
export type SemanticValidator = (payload: Json, context: {document: Document; path: string; scope: Scope}) => Diagnostic[];
export interface Registration { manifest: ExtensionPackage; structure: ValidateFunction; semantics?: SemanticValidator }
function freeze(value: unknown): void {
  if (value && typeof value === 'object') { Object.freeze(value); for (const child of Object.values(value)) freeze(child); }
}
export class Registry {
  #entries = new Map<string, Map<string, Registration>>();
  register(input: ExtensionPackage, semantics?: SemanticValidator): this {
    const manifest = copyJson(input) as unknown as ExtensionPackage;
    if (!checkPackage(manifest)) throw new UmfError('PACKAGE_STRUCTURE', JSON.stringify(checkPackage.errors));
    if (this.get(manifest.id, manifest.version)) throw new UmfError('DUPLICATE_VERSION', 'Extension version is already registered');
    let structure: ValidateFunction;
    try { structure = createValidator().compile(manifest.schema); }
    catch (error) { throw new UmfError('PACKAGE_SCHEMA', String(error)); }
    freeze(manifest);
    const entry: Registration = {manifest, structure, ...(semantics ? {semantics} : {})};
    Object.freeze(entry);
    if (!this.#entries.has(manifest.id)) this.#entries.set(manifest.id, new Map());
    this.#entries.get(manifest.id)!.set(manifest.version, entry);
    return this;
  }
  get(id: string, version: string): Registration | undefined { return this.#entries.get(id)?.get(version); }
}
