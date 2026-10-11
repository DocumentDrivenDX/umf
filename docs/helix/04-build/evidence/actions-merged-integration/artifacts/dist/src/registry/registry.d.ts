import type { ValidateFunction } from 'ajv';
import { type ExtensionPackage, type Diagnostic, type Document, type Json, type Scope } from '../model/types';
export type SemanticValidator = (payload: Json, context: {
    document: Document;
    path: string;
    scope: Scope;
}) => Diagnostic[];
export interface Registration {
    manifest: ExtensionPackage;
    structure: ValidateFunction;
    semantics?: SemanticValidator;
}
export declare class Registry {
    #private;
    register(input: ExtensionPackage, semantics?: SemanticValidator): this;
    get(id: string, version: string): Registration | undefined;
}
