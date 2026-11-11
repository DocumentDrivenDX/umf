// SPDX-License-Identifier: MIT OR Apache-2.0
import type {CURRENT_CORE_VERSION} from '../../generated/core-model';
import type {bit128BindingPackage} from './package';
export {bit128BindingPackage} from './package';
export type Bit128Carrier={kind:'native-uuid'|'bytes16'|'uuid-text'|'hex128-text';column:string}|{kind:'words64';highColumn:string;lowColumn:string;signed:boolean};
export interface Bit128FieldBinding {module:string;element:string;storage:'scalar-carrier';carrier:Bit128Carrier}
export interface Bit128BindingPayload {
 profile:'umf-binding-3';logical:{documentId:string;coreVersion:typeof CURRENT_CORE_VERSION};target:{system:string;version:string;subset:string};
 elements:{module:string;element:string;table?:string;partition?:string|null}[];
 fields:(Bit128FieldBinding|{module:string;element:string;field?:string;storage:'column'|'embedded';column?:string;documentColumn?:string;path?:string[]})[];
 relationships:unknown[];indexes:unknown[];
}
