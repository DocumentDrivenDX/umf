import { type Document } from '../model/types';
import type { ProjectionIssue } from './json-schema-protobuf';
export interface ParquetAvroPolicy {
    id: string;
    recordName: string;
    namespace: string;
    fieldNames: Record<string, string>;
    maps: 'entry-arrays';
    lossPolicy: 'strict' | 'allow-reported-loss';
}
export interface ParquetAvroProjection {
    status: 'blocked' | 'projected';
    source: Document;
    policy: ParquetAvroPolicy;
    issues: ProjectionIssue[];
    mappings: {
        index: number;
        path: string[];
    }[];
    target?: Document;
    nativeSchema?: string;
}
/** Schema lowering only; never decodes or silently coerces stored page values. */
export declare function projectParquetToAvro(source: Document, input: ParquetAvroPolicy): ParquetAvroProjection;
