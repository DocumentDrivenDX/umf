// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document} from '../model/types';

export interface SparkArrowPolicy {
  id: string;
  timestampUtc: boolean;
  largeTypes: boolean;
  rejectNestedDuplicates: boolean;
  lossPolicy: 'strict' | 'allow-reported-loss';
}

export interface SparkArrowIssue {
  path: string;
  code: string;
  classification: 'loss' | 'unsupported' | 'representation-change';
  detail: string;
  retainedInSource: true;
}

export interface SparkArrowProjection {
  status: 'blocked' | 'projected';
  complete: false;
  source: Document;
  policy: SparkArrowPolicy;
  issues: SparkArrowIssue[];
  target?: Document;
}
