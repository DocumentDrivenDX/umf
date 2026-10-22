import { type Document, type Element } from './types';
export type CoreLiteral = null | {
    boolean: boolean;
} | {
    integerToken: string;
} | {
    decimalToken: string;
} | {
    string: string;
} | {
    binaryHex: string;
} | {
    floatToken: string;
} | {
    date: string;
} | {
    time: string;
} | {
    timestamp: string;
} | {
    array: CoreLiteral[];
} | {
    map: Record<string, CoreLiteral>;
};
export declare const schemaPropertyNames: readonly ['title', 'aliases', 'examples', 'allowedValues', 'default'];
export declare const newFacetNames: readonly ['collectionSize', 'range'];
export declare const canonicalSchemaJson: (value: unknown) => string;
export declare function schemaError(message: string, path?: string): never;
export declare function knownSchemaMembers(value: unknown, keys: string[], path: string): void;
/** Exact coefficient, bounded before expansion. No host floating-point arithmetic. */
export declare function schemaCoefficient(token: string, scale: number, precision?: number): bigint;
export declare function literalIdentity(field: Element, value: CoreLiteral): string;
export declare function checkSchemaLiteral(doc: Document, field: Element, value: CoreLiteral, refinements?: boolean, depth?: number): void;
/** Internal metered entry; the same evaluator owns all literal semantics. */
export declare function checkSchemaLiteralTracked(doc: Document, field: Element, value: CoreLiteral, charge: (doc: Document, field: Element, value: CoreLiteral) => void): void;
