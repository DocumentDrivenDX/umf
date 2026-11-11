// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document} from './types';
import type {CoreKeyFieldReference} from '../validation/keys';
export interface CoreRecordMembersIdentity {module:string;element:string}
export type CoreRecordMembersMeaning={state:'known'|'partial';members:CoreKeyFieldReference[];uninterpretedPaths:string[]}|{state:'missing'|'inapplicable'};
export interface CoreRecordMembersInspection {operation:'inspect-core-record-members';version:'0.3.0';source:Document;identity:CoreRecordMembersIdentity;path:string;meaning:CoreRecordMembersMeaning;provenance:'unverified'}
