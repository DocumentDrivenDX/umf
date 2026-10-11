import { type Document, type Diagnostic } from '../model/types';
import { type ProtobufSourceCompiler } from '../adapters/protobuf/source';
export interface ProjectionIssue {
    path: string;
    code: string;
    classification: 'representation-change' | 'not-enforced' | 'unsupported' | 'annotation-only';
    detail: string;
    retainedInSource: true;
}
export interface ProtobufProjectionOptions {
    id: string;
    packageName: string;
    messageName: string;
    fields: Record<string, {
        number: number;
    }>;
    integerType: 'int64' | 'uint64' | 'sint64' | 'int32' | 'uint32' | 'sint32';
    lossPolicy: 'strict' | 'allow-reported-loss';
}
export interface ProtobufProjection {
    status: 'blocked' | 'projected';
    source: Document;
    policy: ProtobufProjectionOptions;
    issues: ProjectionIssue[];
    mappings: {
        sourcePath: string;
        targetMessage: string;
        targetField: string;
        number: number;
    }[];
    nativeSource?: string;
    target?: Document;
    targetDiagnostics?: Diagnostic[];
}
/** Schema projection only. Does not silently claim an instance-data converter. */
export declare function projectJsonSchemaToProtobuf(source: Document, input: ProtobufProjectionOptions, compiler: ProtobufSourceCompiler): Promise<ProtobufProjection>;
