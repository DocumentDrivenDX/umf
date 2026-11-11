// SPDX-License-Identifier: MIT OR Apache-2.0
import type {IcebergTransformType} from './transforms';
import type {Diagnostic} from '../../model/types';
export interface IcebergTableTransforms {
 status:'checked'|'blocked';complete:false;
 bindings:{fieldPath:string;sourcePath:string;assessment:IcebergTransformType}[];
 diagnostics:Diagnostic[];
}
