// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Json,Validation} from './types';
export {default as csvBooleanLexicalOperationSchema} from '../../spec/core/csv-boolean-lexical-operation.schema.json';
export interface CsvBooleanLexicalRequest {
 profile:'umf.csv-boolean-lexical/1.0.0';field:{module:string;element:string};
 token:'true'|'false'|'True'|'False';sourceContext:Json;
}
export interface CsvBooleanLexicalReceipt {
 operation:'validate-csv-boolean-lexical';version:'1.0.0';source:Document;
 request:CsvBooleanLexicalRequest;value:{boolean:boolean};validation:Validation;provenance:'unverified';
}
