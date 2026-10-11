import { type Validation } from '../model/types';
export interface CoreKeyFieldReference {
    module: string;
    element: string;
    [key: string]: unknown;
}
export interface CoreKeyDefinition {
    id: string;
    name: string;
    fields: CoreKeyFieldReference[];
    primary?: boolean;
    [key: string]: unknown;
}
/** Candidate-only 0.6.0 validation. No author provenance, migration or native enforcement is inferred. */
export declare function validateKeyCandidate(input: unknown, validateBase?: boolean): Validation;
