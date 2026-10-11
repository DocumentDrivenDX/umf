import { type Document } from '../../model/types';
export interface ProtobufSourceRequest {
    files: Record<string, string>;
    roots: string[];
}
/** A trusted installed compiler. It must resolve only the explicit source bundle. */
export interface ProtobufSourceCompiler {
    compile(request: ProtobufSourceRequest): Promise<{
        descriptorSet: Uint8Array;
        compiler: string;
    }>;
}
export declare function importProtobufSources(input: ProtobufSourceRequest, compiler: ProtobufSourceCompiler, options: {
    id: string;
}): Promise<Document>;
export interface ProtobufSourceEmitter {
    emit(descriptorSet: Uint8Array): Promise<{
        files: Record<string, string>;
        compiler: string;
        printer: string;
    }>;
}
/** Emit current descriptors; the original source archive is never replayed. */
export declare function exportProtobufSources(document: Document, emitter: ProtobufSourceEmitter): Promise<{
    files: Record<string, string>;
    compiler: string;
    printer: string;
    source: Document;
    diagnostics: import("../..").Diagnostic[];
}>;
