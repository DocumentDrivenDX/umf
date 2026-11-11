// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document} from '../model/types';
import type {BindingPayload} from '../extensions/binding';
export interface DeltaBindingResidual {path:string;reason:string;choice:unknown}
export interface DeltaBindingProjection {
  status:'blocked'|'reported'|'projected';
  logical:Document;binding:Document;nativeArchive:Document;
  target:BindingPayload['target'];residuals:DeltaBindingResidual[];
  /** A domainMetadata action proposal, not a transaction commit or clustered data files. */
  candidate?:string;
}
