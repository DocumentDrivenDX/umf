// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Diagnostic} from '../../model/types';
export interface LinkmlClassSlotsReport {
 source:Document;className:string;scope:'document';status:'resolved'|'blocked';complete:false;
 ancestors:string[];slots:{name:string;declarations:{className:string;path:string;kind:'slot'|'attribute'}[]}[];diagnostics:Diagnostic[];
}
