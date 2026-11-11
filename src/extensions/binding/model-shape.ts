// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Element} from '../../model/types';
import type {Bit128Carrier} from './bit128';
import type {ScalarCarrier} from './model-scalar';
import type {Bit128Ref} from './bit128-layout';
export type ModelShape={identity:Bit128Ref;field:Element;kind:'leaf';carrier:Bit128Carrier|ScalarCarrier}|{identity:Bit128Ref;field:Element;kind:'array';item:ModelShape}|{identity:Bit128Ref;field:Element;kind:'map';item:ModelShape}|{identity:Bit128Ref;field:Element;kind:'group';members:ModelShape[]};
export interface JsonCarrier {kind:'json';column:string;shape:ModelShape}
