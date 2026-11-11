// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Json} from '../../model/types';
export interface TypeSpecSemanticNode {id:string;kind:string;label:string;attributes:Record<string,Json>;edges:{role:string;target:string;name?:string;index?:number}[];location?:{file:string;start:number;end:number};}
