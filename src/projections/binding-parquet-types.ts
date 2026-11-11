// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document} from '../model/types';
import type {BindingPayload} from '../extensions/binding';
export interface ParquetBindingResidual {path:string;reason:string;choice:unknown}
export interface ParquetBindingReport {
  status:'blocked'|'reported'|'preserved';
  logical:Document;
  binding:Document;
  target:BindingPayload['target'];
  residuals:ParquetBindingResidual[];
  nativeArchive?:Document;
}
