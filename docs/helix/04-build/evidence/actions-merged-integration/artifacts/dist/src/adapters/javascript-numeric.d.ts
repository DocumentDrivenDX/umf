import { type Document } from '../model/types';
export type JavascriptNumericLiteral = {
    integerToken: string;
} | {
    decimalToken: string;
};
export interface JavascriptNumericContext {
    document: Document;
    field: {
        module: string;
        element: string;
    };
}
/** Exact text constructor. Spelling is retained; optional Field constraints are checked. */
export declare function exactDecimal(token: string, context?: JavascriptNumericContext): {
    decimalToken: string;
};
export declare function integerFromBigInt(value: bigint, context?: JavascriptNumericContext): {
    integerToken: string;
};
export declare function integerToBigInt(input: {
    integerToken: string;
}, context?: JavascriptNumericContext): bigint;
export declare function admitJavascriptNumber(value: number, scalarType: 'integer' | 'decimal', context?: JavascriptNumericContext): JavascriptNumericLiteral;
/** Lossless value conversion, not lexical recovery. The original carrier is untouched. */
export declare function numericToNumberLossless(input: JavascriptNumericLiteral, context?: JavascriptNumericContext): number;
