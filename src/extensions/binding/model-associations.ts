// SPDX-License-Identifier: MIT OR Apache-2.0
import {Bit128Ref} from './bit128-layout';
export interface AssociationEnd {record:Bit128Ref;key:string;fields:Bit128Ref[]}
export interface AssociationLayout {module:string;id:string;storage:'junction';record:Bit128Ref;source:AssociationEnd[];target:AssociationEnd[]}
const key=(r:Bit128Ref)=>JSON.stringify([r.module,r.element]);
