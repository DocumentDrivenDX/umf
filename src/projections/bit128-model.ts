// SPDX-License-Identifier: MIT OR Apache-2.0
import type {CompositeMapping} from './model-shape-mappings';
import type {Document} from '../model/types';
import type {Bit128ModelResidual} from './bit128-sql-model';
export interface Bit128ModelProjection {
 operation:'project-bit128-model';version:'1.0.0';source:Document;binding:Document;lossPolicy:'strict'|'report';
 status:'projected'|'reported'|'blocked';nativeRequirements:{scope:'connection';statements:string[]}[];residuals:Bit128ModelResidual[];
 mappings:{record:{module:string;element:string};table:string;fields:{identity:{module:string;element:string};slots:string[];paths:string[][]}[]}[];
 compositeMappings?:CompositeMapping[];
 candidate?:{format:'sql'|'avro'|'parquet'|'tablespec';text:string};
}
