import { type Document, type Json, type Validation } from './types';
import operationSchema from '../../spec/core/csv-boolean-lexical-operation.schema.json';
export { operationSchema as csvBooleanLexicalOperationSchema };
export interface CsvBooleanLexicalRequest {
    profile: 'umf.csv-boolean-lexical/1.0.0';
    field: {
        module: string;
        element: string;
    };
    token: 'true' | 'false' | 'True' | 'False';
    sourceContext: Json;
}
export interface CsvBooleanLexicalReceipt {
    operation: 'validate-csv-boolean-lexical';
    version: '1.0.0';
    source: Document;
    request: CsvBooleanLexicalRequest;
    value: {
        boolean: boolean;
    };
    validation: Validation;
    provenance: 'unverified';
}
/** Explicit source-token conversion only; public Core Field validation owns validity. */
export declare function validateCsvBooleanLexical(sourceInput: Document, requestInput: CsvBooleanLexicalRequest): CsvBooleanLexicalReceipt;
/** Independently expected original source/request are mandatory, never receipt-derived. */
export declare function verifyCsvBooleanLexical(receiptInput: CsvBooleanLexicalReceipt, sourceInput: Document, requestInput: CsvBooleanLexicalRequest): CsvBooleanLexicalReceipt;
