// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Diagnostic} from '../../model/types';
import type {NativeJson} from '../../model/native-json';
export { LINKML_SCALAR_SLOT_FIELDS } from './package';
import type {LINKML_SCALAR_SLOT_FIELDS} from './package';
export type LinkmlScalarSlotField=keyof typeof LINKML_SCALAR_SLOT_FIELDS;
export interface LinkmlSlotValuesReport {
 source:Document;className:string;slotName:string;scope:'document-scalar-slot-values';status:'resolved'|'blocked';complete:false;
 fields:Partial<Record<LinkmlScalarSlotField,NativeJson>>;
 derivations:{field:LinkmlScalarSlotField;path:string;rule:'base'|'slot-inheritance'|'slot-usage'|'default-range'|'identifier-required'|'key-required'|'list-inlined';value:NativeJson}[];
 diagnostics:Diagnostic[];
}
