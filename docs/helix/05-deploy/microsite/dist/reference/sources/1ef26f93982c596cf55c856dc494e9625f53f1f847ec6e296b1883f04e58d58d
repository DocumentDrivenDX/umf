// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document} from './types';
import type {CoreKeyDefinition} from '../validation/keys';
import type {CoreKeyIdentity} from './key-tuple';
export interface CoreRecordIdentity {module:string;element:string}
export interface CoreKeyRequest {id:string;name:string;fields:CoreRecordIdentity[];primary?:boolean}
interface Declaration {version:'2.0.0';source:Document;target:Document;identity:CoreRecordIdentity;provenance:{origin:'authored';idealPath:string;basis:'explicit-author-declaration';nativePath:null;binding:{id:string;version:'2.0.0'}}}
export interface CoreKeyDeclaration extends Declaration {operation:'declare-core-key';request:CoreKeyRequest}
export interface CoreRecordMembersDeclaration extends Declaration {operation:'declare-core-record-members';request:CoreRecordIdentity[]}
export type CoreKeyMeaning={state:'missing'|'inapplicable'}|{state:'known'|'partial';keys:CoreKeyDefinition[];uninterpretedPaths:string[]};
export interface CoreKeyInspection {operation:'inspect-core-keys';version:'4.0.0';source:Document;identity:CoreRecordIdentity;path:string;meaning:CoreKeyMeaning;provenance:'unverified'}
export interface CoreKeyLookup {operation:'lookup-core-key';version:'4.0.0';source:Document;identity:CoreKeyIdentity;path:string;key:CoreKeyDefinition;uninterpretedPaths:string[];provenance:'unverified'}
export type CoreKeyOperation=CoreKeyDeclaration|CoreRecordMembersDeclaration|CoreKeyInspection|CoreKeyLookup;
const id=(r:CoreRecordIdentity)=>JSON.stringify([r.module,r.element]);
