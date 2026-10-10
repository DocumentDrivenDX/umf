import { type Document, type JsonObject } from '../../model/types';
/** Native emitter output is evidence for a projection, not a lossless type-model conversion. */
export declare function emitTypeSpecJsonSchema(document: Document, input: {
    options: JsonObject;
}): Promise<{
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
}>;
