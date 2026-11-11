// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Diagnostic} from '../../model/types';
export interface OdcsRelationshipReport {
 source:Document;status:'checked'|'blocked';complete:false;
 relationships:{path:string;scope:'schema'|'property';status:'resolved'|'blocked';pairs:{fromPath:string;toPath:string}[];diagnostics:Diagnostic[]}[];
 diagnostics:Diagnostic[];
}
