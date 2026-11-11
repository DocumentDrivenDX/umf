// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Diagnostic} from '../../model/types';
export interface IcebergTableContext {
 status:'checked'|'blocked';
 complete:false;
 scope:'iceberg-v1-v3-current-references';
 resolved:Record<string,string>;
 diagnostics:Diagnostic[];
}
