import { copyJson } from '../json';
import { type Document, type Validation } from '../types';
import { type CoreLiteral, checkSchemaLiteral } from '../schema-literals';
export declare function evaluateFieldValue(fieldInput: {
    module: string;
    element: string;
}, valueInput: CoreLiteral, locateField: (field: {
    module: string;
    element: string;
}) => {
    source: Document;
    node: unknown;
}, copy?: typeof copyJson, checkLiteral?: typeof checkSchemaLiteral, reserveLiteral?: (value: CoreLiteral) => void): Validation;
