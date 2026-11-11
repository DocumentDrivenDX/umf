// SPDX-License-Identifier: MIT OR Apache-2.0
import type {DbtManifestGraph} from './graph';
import type {Document,Diagnostic} from '../../model/types';
export interface DbtDependencySelection {
 source:Document;
 selection:{status:'selected'|'blocked';complete:false;roots:string[];includeMacros:boolean;maxDepth:number;maxNodes:number;
 nodes:(DbtManifestGraph['nodes'][number]&{depth:number})[];
 edges:DbtManifestGraph['edges'];
 boundary:{edge:DbtManifestGraph['edges'][number];reason:'macro-excluded'|'depth-limit'|'node-limit'}[];
 diagnostics:Diagnostic[];};
}
