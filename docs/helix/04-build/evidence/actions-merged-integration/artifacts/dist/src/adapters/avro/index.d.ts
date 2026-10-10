export type { AvroFieldMetadata } from './metadata';
export { default as avroNativeSchema } from '../../../spec/extensions/avro/native-schema.schema.json';
import { Registry } from '../../registry/registry';
import { type Document, type Diagnostic, type ExtensionPackage, type Validation } from '../../model/types';
import { type NativeJson } from '../json-schema/tree';
export declare const AVRO_EXTENSION = "umf.avro";
export declare const avroPackage: ExtensionPackage;
export interface AvroPayload {
    version: '1.12.0';
    root: NativeJson;
    dependencies?: {
        id: string;
        root: NativeJson;
    }[];
}
export declare function avroRegistry(): Registry;
export declare function inspectAvro(document: Document): Validation;
export declare function importAvroSchema(text: string, options: {
    id: string;
    dependencies?: {
        id: string;
        schema: string;
    }[];
}): Document;
export declare function getAvroFieldMetadata(document: Document): import("./metadata").AvroFieldMetadata[];
export declare function exportAvroSchema(document: Document): string;
export declare function getAvroNode(document: Document, path: string, dependencyId?: string): NativeJson;
export declare function editAvroNode(document: Document, path: string, text: string, dependencyId?: string): Document;
export interface AvroNodeEditProposal {
    status: 'candidate';
    source: Document;
    document: Document;
    validation: Validation;
    edit: {
        path: string;
        dependencyId?: string;
        replacement: NativeJson;
    };
}
/** Explicit authoring proposal, not a semantic-validity or compatibility certificate. */
export declare function proposeAvroNodeEdit(input: Document, path: string, text: string, dependencyId?: string): AvroNodeEditProposal;
export declare function exportAvroBundle(document: Document): {
    schema: string;
    dependencies: {
        id: string;
        schema: string;
    }[];
    source: Document;
    diagnostics: Diagnostic[];
};
