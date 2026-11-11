// SPDX-License-Identifier: MIT OR Apache-2.0
import {JSONLD_EXTENSION,jsonldPackage} from './package';
import type {NativeJson} from '../../model/native-json';
import type {Document,Diagnostic} from '../../model/types';
export {JSONLD_EXTENSION,jsonldPackage};
export interface JsonLdExpansionReport {source:Document;lossPolicy:'report'|'reject';status:'candidate'|'blocked';complete:false;candidate?:Document;resourcesUsed:string[];diagnostics:Diagnostic[]}
export interface JsonLdFlattenReport extends JsonLdExpansionReport {context:NativeJson|null;compactArrays:boolean}
export interface JsonLdCompactionReport extends JsonLdExpansionReport {context:NativeJson;compactArrays:boolean;compactToRelative:boolean}
export interface JsonLdFramingOptions {embed?:'@once'|'@always'|'@never'|'@first'|'@last';explicit?:boolean;requireAll?:boolean;omitDefault?:boolean;omitGraph?:boolean;pruneBlankNodeIdentifiers?:boolean;frameDefault?:boolean;ordered?:boolean;compactArrays?:boolean;compactToRelative?:boolean}
export interface JsonLdFramingReport extends JsonLdExpansionReport {frame:NativeJson;framingOptions:JsonLdFramingOptions}
export interface RdfToJsonLdReport {source:Document;id:string;baseIRI:string;processingMode:'json-ld-1.0'|'json-ld-1.1';lossPolicy:'report'|'reject';useNativeTypes:boolean;useRdfType:boolean;rdfDirection:null|'i18n-datatype'|'compound-literal';status:'candidate'|'blocked';complete:false;candidate?:Document;diagnostics:Diagnostic[]}
export interface JsonLdToRdfReport extends JsonLdExpansionReport {id:string;produceGeneralizedRdf:boolean;numericPolicy:'strict'|'binary64';rdfDirection:null|'i18n-datatype'|'compound-literal'}
export interface GeneralizedRdfToJsonLdReport extends JsonLdExpansionReport {id:string;baseIRI:string;processingMode:'json-ld-1.0'|'json-ld-1.1'}
