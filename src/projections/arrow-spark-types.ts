// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document} from '../model/types';
import type {SparkArrowIssue} from './spark-arrow-types';

export interface ArrowSparkPolicy {
  id: string;
  preferTimestampNtz: boolean;
  variant: 'spark-tagged-struct' | 'preserve-struct';
  lossPolicy: 'strict' | 'allow-reported-loss';
}

export interface ArrowSparkProjection {
  status: 'blocked' | 'projected';
  complete: false;
  source: Document;
  policy: ArrowSparkPolicy;
  issues: SparkArrowIssue[];
  target?: Document;
}
