// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document} from '../model/types';
import type {ProjectionIssue} from './projection-types';

export interface SqlServerDdlPolicy {aliases:'reject'|'base-type';physicalLayout:'default-rowstore';nativeExpressions:'verbatim';sourceState:'captured-only'|'allow-candidate';lossPolicy:'strict'|'allow-reported-loss';}
export interface SqlServerDdlStatement {sourcePath:string;kind:'schema'|'table'|'key'|'check'|'foreign-key'|'index'|'disable'|'description';sql:string;}
export interface SqlServerDdlProjection {status:'blocked'|'projected';source:Document;policy:SqlServerDdlPolicy;issues:ProjectionIssue[];statements:SqlServerDdlStatement[];nativeSource?:string;}
