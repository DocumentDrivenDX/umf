import { type Document } from '../../model/types';
import { type BindingPayload } from '../../extensions/binding';
export interface DeltaBindingResidual {
    path: string;
    reason: string;
    choice: unknown;
}
export interface DeltaBindingProjection {
    status: 'blocked' | 'reported' | 'projected';
    logical: Document;
    binding: Document;
    nativeArchive: Document;
    target: BindingPayload['target'];
    residuals: DeltaBindingResidual[];
    /** A domainMetadata action proposal, not a transaction commit or clustered data files. */
    candidate?: string;
}
/** Project an authored liquid-clustering choice against a pinned, existing Delta table log. */
export declare function projectBindingToDelta(logical: Document, binding: Document, nativeArchive: Document, lossPolicy: 'strict' | 'report'): DeltaBindingProjection;
