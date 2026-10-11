import { Registry } from '../../registry/registry';
import { type NativeJson } from '../../model/native-json';
import { type Document, type Diagnostic, type ExtensionPackage } from '../../model/types';
export declare const JSONLD_EXTENSION = "umf.jsonld";
export declare const jsonldPackage: ExtensionPackage;
export declare function jsonldRegistry(): Registry;
export declare function inspectJsonLdDocument(document: Document): import("../..").Validation;
export declare function importJsonLdDocument(text: string, options: {
    id: string;
    baseIRI: string;
    processingMode?: 'json-ld-1.0' | 'json-ld-1.1';
    contexts?: {
        url: string;
        documentUrl?: string;
        text: string;
    }[];
    expandContext?: string;
}): Document;
export declare function exportJsonLdDocument(document: Document): string;
export declare function getJsonLdNode(document: Document, path: string): NativeJson;
export declare function proposeJsonLdNodeEdit(document: Document, path: string, text: string): {
    document: Document;
    validation: import("../..").Validation;
};
export interface JsonLdExpansionReport {
    source: Document;
    lossPolicy: 'report' | 'reject';
    status: 'candidate' | 'blocked';
    complete: false;
    candidate?: Document;
    resourcesUsed: string[];
    diagnostics: Diagnostic[];
}
export interface JsonLdFlattenReport extends JsonLdExpansionReport {
    context: NativeJson | null;
    compactArrays: boolean;
}
export declare function proposeJsonLdExpansion(document: Document, options: {
    lossPolicy: 'report' | 'reject';
}): Promise<JsonLdExpansionReport>;
export declare function proposeJsonLdFlatten(document: Document, options: {
    lossPolicy: 'report' | 'reject';
    context?: string;
    compactArrays?: boolean;
}): Promise<JsonLdFlattenReport>;
export interface JsonLdCompactionReport extends JsonLdExpansionReport {
    context: NativeJson;
    compactArrays: boolean;
    compactToRelative: boolean;
}
export declare function proposeJsonLdCompaction(document: Document, options: {
    lossPolicy: 'report' | 'reject';
    context: string;
    compactArrays?: boolean;
    compactToRelative?: boolean;
}): Promise<JsonLdCompactionReport>;
export interface JsonLdFramingOptions {
    embed?: '@once' | '@always' | '@never' | '@first' | '@last';
    explicit?: boolean;
    requireAll?: boolean;
    omitDefault?: boolean;
    omitGraph?: boolean;
    pruneBlankNodeIdentifiers?: boolean;
    frameDefault?: boolean;
    ordered?: boolean;
    compactArrays?: boolean;
    compactToRelative?: boolean;
}
export interface JsonLdFramingReport extends JsonLdExpansionReport {
    frame: NativeJson;
    framingOptions: JsonLdFramingOptions;
}
export declare function proposeJsonLdFraming(document: Document, options: Omit<JsonLdFramingOptions, 'embed'> & {
    embed?: JsonLdFramingOptions['embed'] | boolean;
    frame: string;
    lossPolicy: 'report' | 'reject';
}): Promise<JsonLdFramingReport>;
export interface RdfToJsonLdReport {
    source: Document;
    id: string;
    baseIRI: string;
    processingMode: 'json-ld-1.0' | 'json-ld-1.1';
    lossPolicy: 'report' | 'reject';
    useNativeTypes: boolean;
    useRdfType: boolean;
    rdfDirection: null | 'i18n-datatype' | 'compound-literal';
    status: 'candidate' | 'blocked';
    complete: false;
    candidate?: Document;
    diagnostics: Diagnostic[];
}
export declare function proposeRdfToJsonLd(document: Document, options: {
    id: string;
    baseIRI: string;
    processingMode?: 'json-ld-1.0' | 'json-ld-1.1';
    lossPolicy: 'report' | 'reject';
    useNativeTypes?: boolean;
    useRdfType?: boolean;
    rdfDirection?: null | 'i18n-datatype' | 'compound-literal';
}): Promise<RdfToJsonLdReport>;
export interface JsonLdToRdfReport extends JsonLdExpansionReport {
    id: string;
    produceGeneralizedRdf: boolean;
    numericPolicy: 'strict' | 'binary64';
    rdfDirection: null | 'i18n-datatype' | 'compound-literal';
}
export declare function proposeJsonLdToRdf(document: Document, options: {
    id: string;
    produceGeneralizedRdf?: boolean;
    numericPolicy?: 'strict' | 'binary64';
    lossPolicy: 'report' | 'reject';
    rdfDirection?: null | 'i18n-datatype' | 'compound-literal';
}): Promise<JsonLdToRdfReport>;
export interface GeneralizedRdfToJsonLdReport extends JsonLdExpansionReport {
    id: string;
    baseIRI: string;
    processingMode: 'json-ld-1.0' | 'json-ld-1.1';
}
export declare function proposeGeneralizedRdfToJsonLd(document: Document, options: {
    id: string;
    baseIRI: string;
    processingMode: 'json-ld-1.0' | 'json-ld-1.1';
    lossPolicy: 'report' | 'reject';
}): Promise<GeneralizedRdfToJsonLdReport>;
