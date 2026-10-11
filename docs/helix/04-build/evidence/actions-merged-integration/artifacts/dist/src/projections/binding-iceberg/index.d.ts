import { type Document } from '../../model/types';
import { type BindingPayload } from '../../extensions/binding';
export interface IcebergBindingResidual {
    path: string;
    reason: string;
    choice: unknown;
}
export interface IcebergBindingProjection {
    status: 'blocked' | 'reported' | 'projected';
    logical: Document;
    binding: Document;
    nativeArchive: Document;
    target: BindingPayload['target'];
    residuals: IcebergBindingResidual[];
    /** Complete metadata proposal only; no catalog commit or sorted data-file claim. */
    candidate?: string;
}
/** Maps clustering to a v2/v3 default sort-order hint, with an explicit approximation residual. */
export declare function projectBindingToIceberg(logical: Document, binding: Document, nativeArchive: Document, lossPolicy: 'strict' | 'report'): IcebergBindingProjection;
