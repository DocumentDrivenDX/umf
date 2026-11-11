// SPDX-License-Identifier: MIT OR Apache-2.0
import type {CoreLiteral} from '../../model/schema-literals';
export type ModelLiteral=CoreLiteral|{group:{field:{module:string;element:string};value:ModelLiteral}[]}|{array:ModelLiteral[]}|{map:{[key:string]:ModelLiteral}};
const key=(v:{module:string;element:string})=>JSON.stringify([v.module,v.element]);
