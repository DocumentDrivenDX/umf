import { type Document } from '../model/types';
import type { SparkArrowIssue } from './spark-arrow';
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
/** Arrow logical schema to Spark 4.0.1 JSON, retaining source independently of recovery. */
export declare function projectArrowToSpark(source: Document, input: ArrowSparkPolicy): ArrowSparkProjection;
