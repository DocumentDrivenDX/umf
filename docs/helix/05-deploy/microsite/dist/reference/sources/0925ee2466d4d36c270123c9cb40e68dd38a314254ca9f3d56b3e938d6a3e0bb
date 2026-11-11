// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document} from '../../model/types';
import type {BindingPayload} from '../../extensions/binding';

export interface PostgresqlBindingResidual {path:string;reason:string;choice:unknown}
export interface PostgresqlIndexProjection {
  status:'blocked'|'reported'|'proposed';logical:Document;binding:Document;nativeArchive:Document;
  target:BindingPayload['target'];residuals:PostgresqlBindingResidual[];
  /** DDL proposal verified by the pinned parser/deparser/codec; execution is a separate oracle. */
  candidate?:string;
}
