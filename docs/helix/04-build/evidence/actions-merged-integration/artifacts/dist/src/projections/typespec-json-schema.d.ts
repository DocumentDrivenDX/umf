import { type Document, type JsonObject } from '../model/types';
import type { ProjectionIssue } from './json-schema-protobuf';
export interface TypeSpecJsonSchemaPolicy {
    id: string;
    rootFile: string;
    retrievalBase: string;
    options: JsonObject;
    usage: 'native-emission';
    lossPolicy: 'strict' | 'allow-reported-loss';
}
/** Materialize native output with its dependencies; no claim of source-domain equivalence. */
export declare function projectTypeSpecToJsonSchema(source: Document, input: TypeSpecJsonSchemaPolicy): Promise<{
    status: 'blocked' | 'projected';
    source: Document;
    policy: TypeSpecJsonSchemaPolicy;
    complete: false;
    emission: {
        status: "blocked" | "emitted" | "empty";
        source: Document;
        emitter: string;
        policy: {
            options: JsonObject;
        };
        compilation: {
            compiler: string;
            libraries: {
                [x: string]: string;
            };
            valid: boolean;
            complete: false;
            diagnostics: {
                code: string;
                severity: import("@typespec/compiler").DiagnosticSeverity;
                message: string;
                file?: string;
                start?: number;
                end?: number;
            }[];
            limitations: string[];
        };
        files: Record<string, string>;
        complete: false;
        limitations: string[];
    };
    issues: ProjectionIssue[];
    resources: {
        file: string;
        retrievalUri: string;
    }[];
    target?: Document;
}>;
