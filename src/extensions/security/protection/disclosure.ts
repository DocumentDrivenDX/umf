// SPDX-License-Identifier: MIT OR Apache-2.0
// Disclosure inspection and codecs are implemented by the Rust V4 roots.
import type {CoreLiteral} from '../../../model/schema-literals';
import type {Json,Diagnostic} from '../../../model/types';
import type {SecurityRef} from '../types';
import {GREGORIAN_DATE_PROFILE} from '../../../adapters/gregorian-date';

export interface SecurityDisclosureColumnV2 {
 field:SecurityRef;storageEffect:'canonical'|'stored-transformed';
 storageTransform?:{id:string;version:string};valueProfile?:typeof GREGORIAN_DATE_PROFILE;
}
export type SecurityDisclosureCellV2=
 |{disposition:'original';value:CoreLiteral}
 |{disposition:'absent'|'withheld'}
 |{disposition:'transformed';selection:{ruleIndex:number;disclosureIndex:number};outputDomain:SecurityRef;
 transform:{id:string;version:string};value:CoreLiteral;valueProfile?:typeof GREGORIAN_DATE_PROFILE};
export interface SecurityDisclosureBatchV2 {
 version:'umf.security.disclosure/0.2.0';policy:{id:string;revision:string};protection:{id:string;revision:string};
 domains:{documentId:string;revision:string}[];columns:SecurityDisclosureColumnV2[];rows:SecurityDisclosureCellV2[][];
}
export interface SecurityDisclosureInspectionV2 {
 status:'validated-disclosure'|'refused';source:Json;batch:SecurityDisclosureBatchV2|null;
 policy:Json;catalog:Json;closure:Json;complete:false;authority:false;diagnostics:readonly Diagnostic[];
}
