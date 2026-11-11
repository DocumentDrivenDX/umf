// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Json} from '../../model/types';
import type {ProjectionIssue} from '../../projections/projection-types';

export type LakeviewIssue=ProjectionIssue;
export interface LakeviewIds {data:string;datasets:string[];pages:{id:string;items:string[]}[];}
export interface LakeviewProjection {root:Json;modules:Map<string,Json>;elements:Map<string,Json>;issues:LakeviewIssue[];}
export const elementKey=(module:string,element:string)=>JSON.stringify([module,element]);
