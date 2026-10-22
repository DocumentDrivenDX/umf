import { type IcebergTransformType } from './transforms';
import type { Document, Diagnostic } from '../../model/types';
export interface IcebergTableTransforms {
    status: 'checked' | 'blocked';
    complete: false;
    bindings: {
        fieldPath: string;
        sourcePath: string;
        assessment: IcebergTransformType;
    }[];
    diagnostics: Diagnostic[];
}
/** Current selected fields only: no historical spec rebinding or transform execution. */
export declare function inspectIcebergTableTransforms(document: Document): IcebergTableTransforms;
