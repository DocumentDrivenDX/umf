import { Registry } from '../../registry/registry';
import { type Document, type Diagnostic, type ExtensionPackage } from '../../model/types';
import { type DescriptorNode } from './descriptor';
export { readDescriptorSet, writeDescriptorSet, type DescriptorNode } from './descriptor';
export declare const PROTOBUF_EXTENSION = "umf.protobuf";
export declare const protobufPackage: ExtensionPackage;
export interface ProtobufPayload {
    descriptorProfile: 'protobuf-es-2.15.0';
    descriptorSet: DescriptorNode;
    sourceArchive?: {
        role: 'original';
        compiler: string;
        files: Record<string, string>;
        roots: string[];
    };
}
export declare function protobufRegistry(): Registry;
export declare function inspectProtobuf(document: Document): import("../..").Validation;
export declare function importProtobufDescriptorSet(binary: Uint8Array, options: {
    id: string;
}): Document;
export declare function exportProtobufDescriptorSet(document: Document): Uint8Array;
export declare function getProtobufDescriptorSet(document: Document): DescriptorNode;
/** Produces an explicit validation candidate; never claims a compiler-validated edit. */
export declare function proposeProtobufDescriptorEdit(document: Document, edit: (node: DescriptorNode) => void): {
    document: Document;
    diagnostics: Diagnostic[];
};
export declare function exportProtobufBundle(document: Document): {
    descriptorSet: Uint8Array<ArrayBufferLike>;
    source: Document;
    diagnostics: Diagnostic[];
};
export * from './source';
