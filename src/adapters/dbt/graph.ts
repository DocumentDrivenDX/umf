// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Diagnostic} from '../../model/types';
export interface DbtManifestGraph {
 status:'checked'|'blocked';complete:false;
 nodes:{id:string;collection:string;path:string}[];
 edges:{dependent:string;dependency:string;kind:'resource'|'macro';path:string;resolved:boolean}[];
 diagnostics:Diagnostic[];
}
