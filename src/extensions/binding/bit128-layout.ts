// SPDX-License-Identifier: MIT OR Apache-2.0
import type {AssociationLayout} from './model-associations';
import type {JsonCarrier} from './model-shape';
import type {ScalarCarrier} from './model-scalar';
import type {Element} from '../../model/types';
import type {Bit128Carrier} from './bit128';
import type {CoreRelationship} from '../../validation/relationships';
export interface Bit128Ref {module:string;element:string}
export interface Bit128Key {id:string;name:string;fields:Bit128Ref[];primary?:boolean}
export interface Bit128ForeignKey {module:string;id:string;storage:'foreign_key';fields:Bit128Ref[]}
export interface Bit128Index {name:string;kind:'btree'|'unique';on:{field:Bit128Ref}[];unique:boolean}
export interface Resolved128Field {identity:Bit128Ref;field:Element;carrier:Bit128Carrier|ScalarCarrier|JsonCarrier;slots:string[]}
export interface Resolved128Record {identity:Bit128Ref;record:Element;table:string;fields:Resolved128Field[];keys:Bit128Key[]}
export interface Resolved128Relation {declaration:CoreRelationship;layout:Bit128ForeignKey;source:Resolved128Record;target:Resolved128Record;sourceFields:Resolved128Field[];targetFields:Resolved128Field[];targetKey:Bit128Key}
export interface Resolved128Layout {records:Resolved128Record[];relationships:Resolved128Relation[];indexes:{index:Bit128Index;record:Resolved128Record;fields:Resolved128Field[]}[];associations?:{layout:AssociationLayout;declaration:CoreRelationship}[]}
