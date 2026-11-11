// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Bit128Ref} from '../extensions/binding/bit128-layout';
export type ShapePathSegment={kind:'member';name:string}|{kind:'array-item'}|{kind:'map-value'};
export interface CompositeMapping {record:Bit128Ref;root:Bit128Ref;field:Bit128Ref;column:string;storage:'json-column'|'native-nested';path:ShapePathSegment[];slots:string[]}
